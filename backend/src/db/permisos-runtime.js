import { readFileSync } from 'node:fs';

const authFunctions = [
  'identity.mobile_login_candidate(text)',
  'identity.reserve_mobile_login(bytea,bytea,bytea,uuid)',
  'identity.finish_mobile_login(bytea,bytea,bytea,uuid,uuid,bigint,bigint,text,uuid,bytea)',
  'identity.read_mobile_session(bytea)',
  'identity.revoke_mobile_session(bytea)',
];
const catalogSql = readFileSync(new URL('../../db/queries/catalog-render-permissions.sql', import.meta.url), 'utf8');
const authSchemas = ['identity', 'audit', 'catalog', 'demo'];

const leastPrivilege = `
  current_user = $1 AND current_database() = 'lapape_mobile_dev'
  AND EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication)
  )
  AND NOT pg_catalog.has_database_privilege(current_database(), 'CREATE')
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_namespace AS n
    WHERE n.nspname NOT LIKE 'pg_%' AND pg_catalog.has_schema_privilege(n.oid, 'CREATE')
  )
`;
const noTableWrites = `
  NOT pg_catalog.has_table_privilege(c.oid, 'TRUNCATE, TRIGGER, DELETE')
  AND NOT pg_catalog.has_any_column_privilege(c.oid, 'INSERT, UPDATE, REFERENCES')
`;
const authSql = `
  SELECT ${leastPrivilege}
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = current_user::regrole)
    AND coalesce(pg_catalog.has_schema_privilege(pg_catalog.to_regnamespace('identity')::oid, 'USAGE'), false)
    AND NOT EXISTS (
      SELECT 1 FROM unnest($2::text[]) AS f(signature)
      WHERE NOT coalesce(pg_catalog.has_function_privilege(pg_catalog.to_regprocedure(signature)::oid, 'EXECUTE'), false)
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = ANY($3::text[]) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND (NOT (${noTableWrites}) OR pg_catalog.has_any_column_privilege(c.oid, 'SELECT'))
    ) AS ready
`;

export async function verifyRuntimePermissions(pool, kind) {
  const [text, values] = kind === 'catalog'
    ? [catalogSql, [true]]
    : [authSql, ['lapape_auth_runtime', authFunctions, authSchemas]];
  const { rows } = await pool.query({ text, values, query_timeout: 5000 });
  return rows[0]?.ready === true;
}
