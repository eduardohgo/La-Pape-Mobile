import { readFileSync } from 'node:fs';

const authFunctions = [
  'identity.mobile_login_candidate(text)',
  'identity.reserve_mobile_login(bytea,bytea,bytea,uuid)',
  'identity.finish_mobile_login(bytea,bytea,bytea,uuid,uuid,bigint,bigint,text,uuid,bytea)',
  'identity.read_mobile_session(bytea)',
  'identity.revoke_mobile_session(bytea)',
];
export const registrationFunctions = [
  'identity.registration_budget(bytea,bytea,text)',
  'identity.prepare_registration(text,text,text,uuid,bytea,bytea)',
  'identity.resend_registration(uuid,bytea,bytea)',
  'identity.registration_delivery(uuid,bytea,boolean)',
  'identity.confirm_registration(uuid,bytea,bytea)',
];
const catalogSql = readFileSync(new URL('../../db/queries/catalog-render-permissions.sql', import.meta.url), 'utf8');
const authSchemas = ['identity', 'audit', 'catalog', 'demo', 'privacy'];

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
    AND NOT coalesce(pg_catalog.has_function_privilege(
      pg_catalog.to_regprocedure('privacy.review_opposition(uuid,text,text)')::oid, 'EXECUTE'), false)
    AND NOT coalesce(pg_catalog.has_function_privilege(
      pg_catalog.to_regprocedure('privacy.pending_oppositions()')::oid, 'EXECUTE'), false)
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

export async function verifyRuntimePermissions(pool, kind, registrationEnabled = false, deletionEnabled = false, privacyEnabled = false) {
  const functions = [...authFunctions];
  if (registrationEnabled) functions.push(...registrationFunctions);
  if (deletionEnabled) functions.push('identity.registration_budget(bytea,bytea,text)',
    'identity.mobile_deletion_candidate(bytea)', 'identity.delete_mobile_account(bytea,text,bigint)');
  if (privacyEnabled) {
    functions.push('privacy.read_my_data(bytea)', 'privacy.update_my_name(bytea,text)',
      'privacy.record_my_promotions(bytea,uuid,text,boolean)', 'privacy.read_my_preferences(bytea)',
      'privacy.create_my_opposition(bytea,uuid,text,text)', 'privacy.list_my_oppositions(bytea,uuid)',
      'privacy.read_my_opposition(bytea,uuid)');
    if (registrationEnabled) functions.push('privacy.current_documents()',
      'privacy.prepare_registration(text,text,text,uuid,bytea,bytea,text,text,boolean,boolean)');
  }
  const [text, values] = kind === 'catalog'
    ? [catalogSql, [true]]
    : [authSql, ['lapape_auth_runtime', functions, authSchemas]];
  const { rows } = await pool.query({ text, values, query_timeout: 5000 });
  return rows[0]?.ready === true;
}
