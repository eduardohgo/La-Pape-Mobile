-- Review only until the owner authorizes execution on the isolated Neon branch.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $preflight$
BEGIN
  IF current_database() <> 'lapape_mobile_dev'
    OR current_setting('server_version_num')::int / 10000 <> 18
    OR to_regclass('identity.auth_rate_limits') IS NULL
    OR to_regclass('audit.security_events') IS NULL THEN
    RAISE EXCEPTION 'Apply reviewed 003 first on the PostgreSQL 18 test target';
  END IF;
END;
$preflight$;

CREATE ROLE lapape_auth_executor NOLOGIN NOINHERIT;
CREATE ROLE lapape_auth_runtime NOLOGIN NOINHERIT;
GRANT lapape_auth_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT USAGE, CREATE ON SCHEMA identity TO lapape_auth_executor;
GRANT USAGE ON SCHEMA audit TO lapape_auth_executor;
GRANT USAGE ON SCHEMA identity TO lapape_auth_runtime;

-- The executor is accessible through these fixed operations. Row-lock privileges
-- belong to the executor, never to the credential used by Express.
GRANT SELECT ON identity.users, identity.password_credentials TO lapape_auth_executor;
GRANT UPDATE (updated_at) ON identity.users TO lapape_auth_executor;
GRANT UPDATE (changed_at) ON identity.password_credentials TO lapape_auth_executor;
GRANT SELECT, INSERT ON identity.sessions TO lapape_auth_executor;
GRANT UPDATE (last_activity_at, idle_expires_at, revoked_at, revocation_reason)
  ON identity.sessions TO lapape_auth_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.auth_rate_limits TO lapape_auth_executor;
GRANT INSERT ON audit.security_events TO lapape_auth_executor;

CREATE FUNCTION identity.mobile_login_candidate(p_email_key text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
  SELECT jsonb_build_object('id', u.id, 'passwordHash', c.password_hash,
    'securityVersion', u.security_version::text, 'registrationVersion', u.registration_version::text)
  FROM identity.users u JOIN identity.password_credentials c ON c.user_id = u.id
  WHERE u.email_key = p_email_key AND u.status = 'ACTIVE' AND u.email_verified_at IS NOT NULL
    AND u.role_code = 'CLIENTE' AND c.state = 'CONFIRMED' AND c.policy_version = 1
    AND c.registration_version = u.registration_version
$fn$;

CREATE FUNCTION identity.reserve_mobile_login(p_global bytea, p_origin bytea, p_pair bytea, p_attempt uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  keys bytea[] := ARRAY[p_global, p_origin, p_pair];
  scopes text[] := ARRAY['ORIGIN', 'ORIGIN', 'ACCOUNT_ORIGIN'];
  bucket identity.auth_rate_limits%ROWTYPE;
  stamp timestamptz;
  failures timestamptz[];
  ids uuid[];
  deadlines timestamptz[];
  limit_count integer;
BEGIN
  IF p_attempt IS NULL OR octet_length(p_global) IS DISTINCT FROM 32
    OR octet_length(p_origin) IS DISTINCT FROM 32 OR octet_length(p_pair) IS DISTINCT FROM 32
    OR p_global = p_origin THEN RETURN false; END IF;

  -- Lock in the same order in reserve and finish. Check the global budget first,
  -- before creating rows for arbitrary origin or account keys.
  FOR i IN 1..3 LOOP
    stamp := clock_timestamp();
    INSERT INTO identity.auth_rate_limits(scope, subject_key, updated_at, expires_at)
      VALUES (scopes[i], keys[i], stamp, stamp + interval '16 minutes')
      ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT bucket FROM identity.auth_rate_limits
      WHERE scope = scopes[i] AND subject_key = keys[i] FOR UPDATE;
    stamp := clock_timestamp();
    SELECT ARRAY(SELECT f FROM unnest(bucket.failure_times) f WHERE f > stamp - interval '15 minutes' ORDER BY f)
      INTO failures;
    SELECT coalesce(array_agg(r.id ORDER BY r.deadline, r.id), '{}'::uuid[]),
           coalesce(array_agg(r.deadline ORDER BY r.deadline, r.id), '{}'::timestamptz[])
      INTO ids, deadlines
      FROM unnest(bucket.reservation_ids, bucket.reservation_deadlines) r(id, deadline)
      WHERE r.deadline > stamp;
    -- Global limits concurrent work without blocking every account after unrelated failures.
    limit_count := CASE i WHEN 1 THEN 8 WHEN 3 THEN 5 ELSE 30 END;
    IF p_attempt = ANY(ids) OR cardinality(failures) + cardinality(ids) >= limit_count THEN
      RAISE EXCEPTION USING ERRCODE = 'LP001', MESSAGE = 'Login capacity exhausted';
    END IF;
    UPDATE identity.auth_rate_limits SET failure_times = failures,
      reservation_ids = array_append(ids, p_attempt),
      reservation_deadlines = array_append(deadlines, stamp + interval '30 seconds'),
      updated_at = stamp, expires_at = stamp + interval '16 minutes'
      WHERE scope = scopes[i] AND subject_key = keys[i];
  END LOOP;

  DELETE FROM identity.auth_rate_limits a USING (
    SELECT scope, subject_key FROM identity.auth_rate_limits
    WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED
  ) expired
  WHERE a.scope = expired.scope AND a.subject_key = expired.subject_key;
  RETURN true;
EXCEPTION WHEN SQLSTATE 'LP001' THEN
  -- Roll back all partial reservations when any bucket denies the attempt.
  RETURN false;
END;
$fn$;

CREATE FUNCTION identity.finish_mobile_login(
  p_global bytea, p_origin bytea, p_pair bytea, p_attempt uuid,
  p_user uuid, p_security bigint, p_registration bigint, p_password_hash text,
  p_session uuid, p_secret_hash bytea
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  keys bytea[] := ARRAY[p_global, p_origin, p_pair];
  scopes text[] := ARRAY['ORIGIN', 'ORIGIN', 'ACCOUNT_ORIGIN'];
  bucket identity.auth_rate_limits%ROWTYPE;
  account identity.users%ROWTYPE;
  credential identity.password_credentials%ROWTYPE;
  stamp timestamptz;
  succeeded boolean := false;
BEGIN
  FOR i IN 1..3 LOOP
    PERFORM 1 FROM identity.auth_rate_limits
      WHERE scope = scopes[i] AND subject_key = keys[i] FOR UPDATE;
  END LOOP;
  IF p_user IS NOT NULL AND p_session IS NOT NULL AND octet_length(p_secret_hash) = 32 THEN
    SELECT * INTO account FROM identity.users WHERE id = p_user FOR UPDATE;
    IF FOUND THEN
      SELECT * INTO credential FROM identity.password_credentials WHERE user_id = p_user FOR SHARE;
      succeeded := FOUND AND account.status = 'ACTIVE' AND account.email_verified_at IS NOT NULL
        AND account.role_code = 'CLIENTE' AND account.security_version = p_security
        AND account.registration_version = p_registration AND credential.registration_version = p_registration
        AND credential.state = 'CONFIRMED' AND credential.policy_version = 1
        AND credential.password_hash = p_password_hash;
    END IF;
  END IF;
  succeeded := coalesce(succeeded, false);
  stamp := clock_timestamp();
  FOR i IN 1..3 LOOP
    SELECT * INTO bucket FROM identity.auth_rate_limits WHERE scope = scopes[i] AND subject_key = keys[i];
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM unnest(bucket.reservation_ids, bucket.reservation_deadlines) r(id, deadline)
      WHERE r.id = p_attempt AND r.deadline > stamp
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'LP002', MESSAGE = 'Login reservation unavailable';
    END IF;
    UPDATE identity.auth_rate_limits SET
      failure_times = ARRAY(SELECT f FROM unnest(bucket.failure_times) f WHERE f > stamp - interval '15 minutes' ORDER BY f)
        || CASE WHEN succeeded OR i = 1 THEN '{}'::timestamptz[] ELSE ARRAY[stamp] END,
      reservation_ids = ARRAY(SELECT r.id FROM unnest(bucket.reservation_ids, bucket.reservation_deadlines)
        WITH ORDINALITY r(id, deadline, n) WHERE r.id <> p_attempt AND r.deadline > stamp ORDER BY r.n),
      reservation_deadlines = ARRAY(SELECT r.deadline FROM unnest(bucket.reservation_ids, bucket.reservation_deadlines)
        WITH ORDINALITY r(id, deadline, n) WHERE r.id <> p_attempt AND r.deadline > stamp ORDER BY r.n),
      updated_at = stamp, expires_at = stamp + interval '16 minutes'
      WHERE scope = scopes[i] AND subject_key = keys[i];
  END LOOP;

  IF NOT succeeded THEN
    INSERT INTO audit.security_events(id, request_id, event_code, outcome)
      VALUES (gen_random_uuid(), p_attempt, 'LOGIN_FAILED', 'FAILURE');
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  INSERT INTO identity.sessions(id, user_id, secret_hash, transport, role_at_issue, security_version,
    idle_timeout_minutes, created_at, last_activity_at, absolute_expires_at, idle_expires_at)
    VALUES (p_session, account.id, p_secret_hash, 'MOBILE_BEARER', account.role_code, account.security_version,
      30, stamp, stamp, stamp + interval '120 minutes', stamp + interval '30 minutes');
  INSERT INTO audit.security_events(id, actor_user_id, subject_user_id, request_id, session_id, event_code, outcome)
    VALUES (gen_random_uuid(), account.id, account.id, p_attempt, p_session, 'LOGIN_SUCCEEDED', 'SUCCESS');
  RETURN jsonb_build_object('status', 'ok', 'user', jsonb_build_object(
    'id', account.id, 'name', account.name, 'email', account.email, 'role', account.role_code),
    'expiresAt', stamp + interval '120 minutes', 'idleExpiresAt', stamp + interval '30 minutes');
EXCEPTION WHEN SQLSTATE 'LP002' THEN
  RETURN jsonb_build_object('status', 'limited');
END;
$fn$;

CREATE FUNCTION identity.read_mobile_session(p_secret_hash bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  account_id uuid;
  account identity.users%ROWTYPE;
  session_row identity.sessions%ROWTYPE;
  stamp timestamptz;
  idle_until timestamptz;
BEGIN
  SELECT user_id INTO account_id FROM identity.sessions
    WHERE secret_hash = p_secret_hash AND transport = 'MOBILE_BEARER';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO account FROM identity.users WHERE id = account_id FOR SHARE;
  IF NOT FOUND OR account.status <> 'ACTIVE' OR account.email_verified_at IS NULL
    OR account.role_code <> 'CLIENTE' THEN RETURN NULL; END IF;
  PERFORM 1 FROM identity.password_credentials
    WHERE user_id = account_id AND state = 'CONFIRMED' AND policy_version = 1
      AND registration_version = account.registration_version FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO session_row FROM identity.sessions
    WHERE secret_hash = p_secret_hash AND user_id = account_id AND transport = 'MOBILE_BEARER' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  stamp := greatest(clock_timestamp(), session_row.last_activity_at);
  IF session_row.revoked_at IS NOT NULL OR session_row.security_version <> account.security_version
    OR session_row.absolute_expires_at <= stamp OR session_row.idle_expires_at <= stamp THEN
    RETURN NULL;
  END IF;
  idle_until := least(session_row.absolute_expires_at, stamp + session_row.idle_timeout_minutes * interval '1 minute');
  UPDATE identity.sessions SET last_activity_at = stamp, idle_expires_at = idle_until WHERE id = session_row.id;
  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', account.id, 'name', account.name, 'email', account.email, 'role', account.role_code),
    'expiresAt', session_row.absolute_expires_at, 'idleExpiresAt', idle_until);
END;
$fn$;

CREATE FUNCTION identity.revoke_mobile_session(p_secret_hash bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $fn$
DECLARE
  revoked identity.sessions%ROWTYPE;
BEGIN
  UPDATE identity.sessions SET revoked_at = greatest(clock_timestamp(), created_at), revocation_reason = 'LOGOUT'
    WHERE secret_hash = p_secret_hash AND transport = 'MOBILE_BEARER' AND revoked_at IS NULL
    RETURNING * INTO revoked;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit.security_events(id, actor_user_id, subject_user_id, request_id, session_id, event_code, outcome)
    VALUES (gen_random_uuid(), revoked.user_id, revoked.user_id, gen_random_uuid(), revoked.id, 'SESSION_REVOKED', 'SUCCESS');
  RETURN true;
END;
$fn$;

-- Keep every permission change in the transaction that creates the functions.
DO $acl$
DECLARE
  signature text;
  function_oid oid;
  migrator name := current_user;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'identity.mobile_login_candidate(text)',
    'identity.reserve_mobile_login(bytea,bytea,bytea,uuid)',
    'identity.finish_mobile_login(bytea,bytea,bytea,uuid,uuid,bigint,bigint,text,uuid,bytea)',
    'identity.read_mobile_session(bytea)',
    'identity.revoke_mobile_session(bytea)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO lapape_auth_executor', signature);
    -- The migrator has temporary SET membership to grant as the new owner.
    EXECUTE 'SET LOCAL ROLE lapape_auth_executor';
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lapape_auth_runtime', signature);
    EXECUTE format('SET LOCAL ROLE %I', migrator);
    function_oid := to_regprocedure(signature);
    IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl
      WHERE p.oid = function_oid
        AND acl.grantee NOT IN ('lapape_auth_runtime'::regrole, 'lapape_auth_executor'::regrole)) THEN
      RAISE EXCEPTION 'Unexpected default function grants for %', signature;
    END IF;
  END LOOP;
END;
$acl$;
REVOKE CREATE ON SCHEMA identity FROM lapape_auth_executor;
REVOKE SET OPTION FOR lapape_auth_executor FROM CURRENT_USER;
COMMIT;
