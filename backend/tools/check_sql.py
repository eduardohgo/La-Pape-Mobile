"""Parse reviewed SQL with the PostgreSQL 18 grammar. Never connects to a database."""
import hashlib
import json
from pathlib import Path
import subprocess

import pglast
from pglast.parser import get_postgresql_version


def nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from nodes(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            yield from nodes(child)


def main():
    version = get_postgresql_version()
    if version[0] != 18:
        raise ValueError("This review requires the PostgreSQL 18 parser")
    base = Path(__file__).resolve().parents[1]
    results = []
    for group in ("migrations", "queries", "validation"):
        paths = sorted((base / "db" / group).glob("*.sql"))
        if not paths:
            raise ValueError(f"Missing reviewed SQL: {group}")
        for path in paths:
            sql = path.read_text(encoding="utf-8")
            parsed = pglast.parse_sql(sql)
            if not parsed:
                raise ValueError(f"Empty SQL: {path.name}")
            trees = [statement(skip_none=True) for statement in parsed]
            if group != "migrations":
                roots = {tree["stmt"]["@"] for tree in trees}
                allowed = {"SelectStmt"} if group == "queries" else {
                    "SelectStmt", "TransactionStmt", "VariableSetStmt"
                }
                if not roots <= allowed:
                    raise ValueError(f"Non-read-only statement: {path.name}")
                forbidden = {"InsertStmt", "UpdateStmt", "DeleteStmt", "MergeStmt", "IntoClause"}
                if any(node.get("@") in forbidden for node in nodes(trees)):
                    raise ValueError(f"Data-changing SQL inside query: {path.name}")
                if group == "queries" and len(parsed) != 1:
                    raise ValueError(f"Each endpoint query must be a single SELECT: {path.name}")
            # SQL grammar treats a DO body as a string: parse its PL/pgSQL separately.
            for statement in pglast.split(sql):
                if isinstance(pglast.parse_sql(statement)[0].stmt, pglast.ast.DoStmt):
                    pglast.parse_plpgsql(statement)
            results.append({
                "file": path.relative_to(base).as_posix(),
                "statements": len(parsed),
                "sha256": hashlib.sha256(sql.encode("utf-8")).hexdigest(),
            })
    # Exercise the SQL generator with fictional approvals only in subprocess memory.
    # A hostile-looking description must remain a literal, not a DROP statement.
    fixture = subprocess.run([
        "node", "--input-type=module", "-e", """
import {readCatalogReview, generateApprovedCatalogSql} from './scripts/catalog-review.js';
const manifest = await readCatalogReview();
for (const product of manifest.products) {
  product.catalog.imageUrl = 'https://assets.example.invalid/review-fixture.jpg';
  product.review = {approved:true, price:true, brand:true, image:true, category:true,
    content:true, reviewedBy:'review-fixture', reviewedAt:'2026-10-12T12:00:00.000Z'};
}
manifest.products[0].catalog.description = "Texto '); DROP TABLE catalog.products; -- \\\\ literal";
process.stdout.write(generateApprovedCatalogSql(manifest));
"""
    ], cwd=base, capture_output=True, text=True, encoding="utf-8", check=True).stdout
    fixture_trees = [statement(skip_none=True) for statement in pglast.parse_sql(fixture)]
    fixture_roots = [tree["stmt"]["@"] for tree in fixture_trees]
    if fixture_roots.count("InsertStmt") != 19 or "DropStmt" in fixture_roots:
        raise ValueError("Generated fixture must contain exactly 10 products + 3 categories + 6 brands, with no DROP")
    for statement in pglast.split(fixture):
        if isinstance(pglast.parse_sql(statement)[0].stmt, pglast.ast.DoStmt):
            pglast.parse_plpgsql(statement)
    print(json.dumps({
        "tool": pglast.__version__, "postgres_parser": version,
        "database_connections": 0, "files": results,
        "generated_fixture": {"approved_only_in_memory": 10, "insert_statements": 19,
                              "drop_statements": 0, "written_import_files": 0},
        "limit": "Syntax and read-only statement structure only; no execution, type resolution or live constraint validation."
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
