-- Local candidate only. Apply after 009 in an isolated PostgreSQL 18 database.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $guard$
BEGIN
  IF current_database() <> 'lapape_mobile_dev'
    OR current_setting('server_version_num')::int / 10000 <> 18
    OR to_regprocedure('identity.read_mobile_session(bytea)') IS NULL
    OR to_regprocedure('privacy.read_my_preferences(bytea)') IS NULL
    OR to_regprocedure('identity.rotate_mobile_jwt_session(bytea,bytea,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected migration 009 baseline or JWT rotation already exists';
  END IF;
END
$guard$;

GRANT UPDATE (secret_hash) ON identity.sessions TO lapape_auth_executor;

CREATE FUNCTION identity.rotate_mobile_jwt_session(p_previous bytea, p_next bytea, p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  existing jsonb;
  updated uuid;
BEGIN
  IF octet_length(p_previous) <> 32 OR octet_length(p_next) <> 32
    OR p_previous = p_next OR p_session IS NULL THEN RETURN NULL; END IF;
  -- The existing validator locks the current account and credential, checks
  -- ACTIVE/verified/CLIENTE/security_version, and enforces both deadlines.
  existing := identity.read_mobile_session(p_previous);
  IF existing IS NULL THEN RETURN NULL; END IF;
  UPDATE identity.sessions SET secret_hash = p_next
    WHERE id = p_session AND secret_hash = p_previous AND transport = 'MOBILE_BEARER'
      AND revoked_at IS NULL AND absolute_expires_at > clock_timestamp()
      AND idle_expires_at > clock_timestamp()
    RETURNING id INTO updated;
  IF updated IS NULL THEN RETURN NULL; END IF;
  RETURN existing;
END
$fn$;

REVOKE ALL ON FUNCTION identity.rotate_mobile_jwt_session(bytea,bytea,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.rotate_mobile_jwt_session(bytea,bytea,uuid) TO lapape_auth_runtime;
ALTER FUNCTION identity.rotate_mobile_jwt_session(bytea,bytea,uuid) OWNER TO lapape_auth_executor;
REVOKE CREATE ON SCHEMA identity FROM lapape_auth_executor;
COMMIT;
