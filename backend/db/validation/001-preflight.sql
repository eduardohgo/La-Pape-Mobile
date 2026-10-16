-- Future review only. Do not run until the Neon target and execution are approved.
-- Neon project/branch identity must also be verified outside PostgreSQL.
-- Expected: correct_database=true, postgresql_18=true, user_relation_count=0,
-- catalog_schema_absent=true. Existing user relations mean STOP, not reset.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT
    current_database() = 'lapape_mobile_dev' AS correct_database,
    current_setting('server_version_num')::integer / 10000 = 18 AS postgresql_18,
    (
        SELECT COUNT(*)
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname <> 'information_schema'
          AND n.nspname !~ '^pg_'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ) AS user_relation_count,
    NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS n
        WHERE n.nspname = 'catalog'
    ) AS catalog_schema_absent;
ROLLBACK;
