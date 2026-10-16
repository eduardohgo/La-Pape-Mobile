-- Future review after the explicitly approved schema migration, before any import.
-- Expected: three catalog tables, two validated foreign keys, zero invalid
-- constraints, no unexpected user tables, and zero category/brand/product rows.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT
    (
        SELECT COUNT(*)
        FROM information_schema.tables AS t
        WHERE t.table_schema = 'catalog'
          AND t.table_type = 'BASE TABLE'
    ) AS catalog_table_count,
    (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint AS k
        JOIN pg_catalog.pg_class AS c ON c.oid = k.conrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'catalog'
          AND c.relname = 'products'
          AND k.contype = 'f'
          AND k.convalidated = true
    ) AS validated_product_foreign_keys,
    (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint AS k
        JOIN pg_catalog.pg_class AS c ON c.oid = k.conrelid
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'catalog'
          AND k.convalidated = false
    ) AS unvalidated_constraints,
    (
        SELECT COUNT(*)
        FROM information_schema.tables AS t
        WHERE t.table_type = 'BASE TABLE'
          AND t.table_schema <> 'information_schema'
          AND t.table_schema !~ '^pg_'
          AND NOT (
              t.table_schema = 'catalog'
              AND t.table_name IN ('categories', 'brands', 'products')
          )
    ) AS unexpected_user_tables,
    (SELECT COUNT(*) FROM catalog.categories) AS category_rows,
    (SELECT COUNT(*) FROM catalog.brands) AS brand_rows,
    (SELECT COUNT(*) FROM catalog.products) AS product_rows;

-- Review the actual FK targets and delete actions, not only their count.
SELECT
    c.relname AS table_name,
    k.conname AS constraint_name,
    pg_catalog.pg_get_constraintdef(k.oid, true) AS definition
FROM pg_catalog.pg_constraint AS k
JOIN pg_catalog.pg_class AS c ON c.oid = k.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'catalog'
  AND k.contype IN ('p', 'u', 'f', 'c')
ORDER BY c.relname ASC, k.conname ASC;
ROLLBACK;
