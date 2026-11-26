-- Review only. Verify the isolated destination and retention obligations before applying.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $guard$
BEGIN
  IF current_database() <> 'lapape_mobile_dev'
    OR current_setting('server_version_num')::int / 10000 <> 18
    OR to_regprocedure('identity.registration_budget(bytea,bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'Expected the reviewed PostgreSQL 18 authentication schema with migration 006';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype = 'f' AND (
    (confrelid = 'identity.users'::regclass AND (confdeltype <> 'r' OR conrelid NOT IN (
      'identity.sessions'::regclass, 'identity.password_credentials'::regclass,
      'identity.email_verifications'::regclass, 'identity.password_resets'::regclass,
      'audit.security_events'::regclass)))
    OR confrelid = 'identity.sessions'::regclass)) THEN
    RAISE EXCEPTION 'Unexpected account or session relationship; review before enabling deletion';
  END IF;
END;
$guard$;

CREATE ROLE lapape_deletion_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT lapape_deletion_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT USAGE, CREATE ON SCHEMA identity TO lapape_deletion_executor;
GRANT USAGE ON SCHEMA audit TO lapape_deletion_executor;
GRANT SELECT, DELETE ON identity.users, identity.sessions, identity.password_credentials,
  identity.email_verifications, identity.password_resets TO lapape_deletion_executor;
-- Row-lock privileges, scoped to one column per locked table.
GRANT UPDATE (updated_at) ON identity.users TO lapape_deletion_executor;
GRANT UPDATE (changed_at) ON identity.password_credentials TO lapape_deletion_executor;
GRANT UPDATE (last_activity_at) ON identity.sessions TO lapape_deletion_executor;
GRANT SELECT (actor_user_id, subject_user_id, session_id),
  UPDATE (actor_user_id, subject_user_id, session_id) ON audit.security_events TO lapape_deletion_executor;

CREATE FUNCTION identity.mobile_deletion_candidate(p_token bytea)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT jsonb_build_object('id', u.id, 'passwordHash', c.password_hash,
    'securityVersion', u.security_version::text)
  FROM identity.sessions s JOIN identity.users u ON u.id = s.user_id
  JOIN identity.password_credentials c ON c.user_id = u.id
  WHERE s.secret_hash = p_token AND s.transport = 'MOBILE_BEARER' AND s.revoked_at IS NULL
    AND s.absolute_expires_at > statement_timestamp() AND s.idle_expires_at > statement_timestamp()
    AND s.security_version = u.security_version AND u.role_code = 'CLIENTE'
    AND u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL
    AND c.state = 'CONFIRMED' AND c.policy_version = 1 AND c.registration_version = u.registration_version
$fn$;

CREATE FUNCTION identity.delete_mobile_account(p_token bytea, p_password_hash text, p_version bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  target uuid;
  removed_sessions uuid[];
BEGIN
  SELECT user_id INTO target FROM identity.sessions WHERE secret_hash = p_token;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Match the lock order used by session validation and login.
  PERFORM 1 FROM identity.users WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.password_credentials WHERE user_id = target
    AND password_hash = p_password_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.sessions WHERE secret_hash = p_token AND user_id = target FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF (identity.mobile_deletion_candidate(p_token)->>'securityVersion')::bigint IS DISTINCT FROM p_version
    OR p_version IS NULL OR NOT EXISTS (
      SELECT 1 FROM identity.sessions WHERE secret_hash = p_token
        AND absolute_expires_at > clock_timestamp() AND idle_expires_at > clock_timestamp()
    ) THEN RETURN false; END IF;

  WITH removed AS (DELETE FROM identity.sessions WHERE user_id = target RETURNING id)
  SELECT array_agg(id) INTO removed_sessions FROM removed;
  DELETE FROM identity.password_credentials WHERE user_id = target;
  DELETE FROM identity.email_verifications WHERE user_id = target;
  DELETE FROM identity.password_resets WHERE user_id = target;
  UPDATE audit.security_events SET
    actor_user_id = CASE WHEN actor_user_id = target THEN NULL ELSE actor_user_id END,
    subject_user_id = CASE WHEN subject_user_id = target THEN NULL ELSE subject_user_id END,
    session_id = CASE WHEN session_id = ANY(removed_sessions) THEN NULL ELSE session_id END
  WHERE actor_user_id = target OR subject_user_id = target OR session_id = ANY(removed_sessions);
  DELETE FROM identity.users WHERE id = target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account deletion did not remove the locked user'; END IF;
  RETURN true;
END;
$fn$;

DO $acl$
DECLARE
  signature text;
  migrator name := current_user;
BEGIN
  FOREACH signature IN ARRAY ARRAY['identity.mobile_deletion_candidate(bytea)',
    'identity.delete_mobile_account(bytea,text,bigint)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO lapape_deletion_executor', signature);
    EXECUTE 'SET LOCAL ROLE lapape_deletion_executor';
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lapape_auth_runtime', signature);
    EXECUTE format('SET LOCAL ROLE %I', migrator);
    IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl
      WHERE p.oid = to_regprocedure(signature)
        AND acl.grantee NOT IN ('lapape_auth_runtime'::regrole, 'lapape_deletion_executor'::regrole)) THEN
      RAISE EXCEPTION 'Unexpected deletion function grants';
    END IF;
  END LOOP;
END;
$acl$;
REVOKE CREATE ON SCHEMA identity FROM lapape_deletion_executor;
REVOKE lapape_deletion_executor FROM CURRENT_USER;
COMMIT;
