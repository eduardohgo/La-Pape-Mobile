-- Checks effective privileges for both the login and its dedicated group.
-- $1 = true requires the service session; false checks a provisioned NOLOGIN role.
WITH login_role AS (
  SELECT * FROM pg_catalog.pg_roles WHERE rolname = 'lapape_catalog_render'
), reader_group AS (
  SELECT * FROM pg_catalog.pg_roles WHERE rolname = 'lapape_render_catalog_select'
), allowed_tables AS (
  SELECT pg_catalog.to_regclass(relation)::oid AS oid
  FROM unnest(ARRAY['catalog.categories', 'catalog.brands', 'catalog.products']) AS t(relation)
), inspected_roles AS (
  SELECT * FROM login_role UNION ALL SELECT * FROM reader_group
), app_schemas AS (
  SELECT oid, nspname FROM pg_catalog.pg_namespace
  WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
)
SELECT current_database() = 'lapape_mobile_dev' AND EXISTS (
  SELECT 1 FROM login_role AS login CROSS JOIN reader_group AS reader
  WHERE login.rolinherit AND NOT reader.rolcanlogin AND login.rolcanlogin = $1::boolean
    AND (NOT $1::boolean OR (session_user = login.rolname AND current_user = login.rolname))
    AND (SELECT count(*) FROM pg_catalog.pg_auth_members WHERE member = login.oid) = 1
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members
      WHERE member = login.oid AND roleid = reader.oid
        AND inherit_option AND NOT (set_option OR admin_option)
    )
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE member = reader.oid)
    AND NOT EXISTS (
      SELECT 1 FROM inspected_roles AS role
      WHERE role.rolsuper OR role.rolcreatedb OR role.rolcreaterole OR role.rolbypassrls OR role.rolreplication
        OR pg_catalog.has_database_privilege(role.oid, current_database(), 'CREATE')
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_shdepend AS d
          WHERE d.refclassid = 'pg_catalog.pg_authid'::regclass AND d.refobjid = role.oid AND d.deptype = 'o'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM inspected_roles AS role CROSS JOIN app_schemas AS schema
      WHERE pg_catalog.has_schema_privilege(role.oid, schema.oid, 'CREATE')
        OR (schema.nspname NOT IN ('catalog', 'public')
            AND pg_catalog.has_schema_privilege(role.oid, schema.oid, 'USAGE'))
    )
    AND coalesce(pg_catalog.has_schema_privilege(reader.oid, pg_catalog.to_regnamespace('catalog')::oid, 'USAGE'), false)
    AND NOT EXISTS (
      SELECT 1 FROM inspected_roles AS role CROSS JOIN allowed_tables AS tbl
      WHERE NOT coalesce(pg_catalog.has_table_privilege(role.oid, tbl.oid, 'SELECT'), false)
    )
    AND NOT EXISTS (
      SELECT 1 FROM inspected_roles AS role
      CROSS JOIN pg_catalog.pg_class AS c JOIN app_schemas AS n ON n.oid = c.relnamespace
      WHERE CASE
        WHEN c.relkind = 'S' THEN pg_catalog.has_sequence_privilege(role.oid, c.oid, 'SELECT, UPDATE, USAGE')
        WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f') THEN
          pg_catalog.has_table_privilege(role.oid, c.oid, 'TRUNCATE, TRIGGER, DELETE, MAINTAIN')
          OR pg_catalog.has_any_column_privilege(role.oid, c.oid, 'INSERT, UPDATE, REFERENCES, SELECT WITH GRANT OPTION')
          OR (NOT EXISTS (SELECT 1 FROM allowed_tables WHERE oid = c.oid)
              AND pg_catalog.has_any_column_privilege(role.oid, c.oid, 'SELECT'))
        ELSE false END
    )
    AND NOT EXISTS (
      SELECT 1 FROM inspected_roles AS role
      CROSS JOIN pg_catalog.pg_proc AS f JOIN app_schemas AS n ON n.oid = f.pronamespace
      WHERE f.prosecdef AND pg_catalog.has_schema_privilege(role.oid, n.oid, 'USAGE')
        AND pg_catalog.has_function_privilege(role.oid, f.oid, 'EXECUTE')
    )
) AS ready;
