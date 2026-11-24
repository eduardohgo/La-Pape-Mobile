-- REVIEW ONLY. Do not execute in Neon without explicit authorization.
-- Destination to verify externally: auth-login-tigre10 / br-green-rice-b7lt3v8b,
-- twilight-moon-02635569, database lapape_mobile_dev. No catalog/demo DML.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;
DO $preflight$
BEGIN
  IF current_database() <> 'lapape_mobile_dev' OR current_setting('server_version_num')::int / 10000 <> 18
    OR to_regprocedure('identity.mobile_login_candidate(text)') IS NULL
    OR to_regclass('identity.email_verifications') IS NULL THEN
    RAISE EXCEPTION 'Expected PostgreSQL 18 identity schema and reviewed 004';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lapape_registration_executor') THEN
    RAISE EXCEPTION 'Registration executor exists; inspect migration history, do not overwrite';
  END IF;
END;
$preflight$;
ALTER TABLE identity.email_verifications
  ADD COLUMN attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  ADD COLUMN delivery_state text NOT NULL DEFAULT 'PENDING' CHECK (delivery_state IN ('PENDING','SENT','FAILED')),
  ADD COLUMN last_issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN send_count smallint NOT NULL DEFAULT 1 CHECK (send_count BETWEEN 1 AND 3);
CREATE ROLE lapape_registration_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT lapape_registration_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
GRANT USAGE, CREATE ON SCHEMA identity TO lapape_registration_executor;
GRANT USAGE ON SCHEMA audit TO lapape_registration_executor;
GRANT SELECT, INSERT ON identity.users, identity.password_credentials, identity.email_verifications TO lapape_registration_executor;
GRANT UPDATE (name,email,status,email_verified_at,registration_version,security_version,updated_at)
  ON identity.users TO lapape_registration_executor;
GRANT UPDATE (password_hash,state,policy_version,registration_version,provisional_expires_at,created_at,changed_at)
  ON identity.password_credentials TO lapape_registration_executor;
GRANT UPDATE (token_hash,attempts,delivery_state,last_issued_at,send_count,expires_at,consumed_at,revoked_at)
  ON identity.email_verifications TO lapape_registration_executor;
GRANT SELECT, INSERT, UPDATE, DELETE ON identity.auth_rate_limits TO lapape_registration_executor;
GRANT INSERT ON audit.security_events TO lapape_registration_executor;

CREATE FUNCTION identity.registration_budget(p_origin bytea, p_account bytea, p_operation text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  keys bytea[] := ARRAY[p_origin,p_account];
  scopes text[] := ARRAY['ORIGIN','ACCOUNT'];
  bucket identity.auth_rate_limits%ROWTYPE;
  stamp timestamptz;
  recent timestamptz[];
  ceiling integer;
BEGIN
  IF octet_length(p_origin) IS DISTINCT FROM 32 OR octet_length(p_account) IS DISTINCT FROM 32
    OR p_origin = p_account OR p_operation IS NULL OR p_operation NOT IN ('request','resend','verify') THEN RETURN false; END IF;
  FOR i IN 1..2 LOOP
    stamp := clock_timestamp();
    INSERT INTO identity.auth_rate_limits(scope,subject_key,updated_at,expires_at)
      VALUES(scopes[i],keys[i],stamp,stamp+interval '16 minutes') ON CONFLICT DO NOTHING;
    SELECT * INTO STRICT bucket FROM identity.auth_rate_limits
      WHERE scope=scopes[i] AND subject_key=keys[i] FOR UPDATE;
    stamp := clock_timestamp();
    SELECT ARRAY(SELECT value FROM unnest(bucket.failure_times) value
      WHERE value > stamp-interval '15 minutes' ORDER BY value) INTO recent;
    ceiling := CASE WHEN i=1 THEN 30 WHEN p_operation='verify' THEN 5 ELSE 3 END;
    IF cardinality(recent)>=ceiling OR (i=2 AND p_operation<>'verify'
      AND cardinality(recent)>0 AND recent[cardinality(recent)]>stamp-interval '60 seconds') THEN
      RAISE EXCEPTION USING ERRCODE='LP003', MESSAGE='Registration budget exhausted';
    END IF;
    UPDATE identity.auth_rate_limits SET failure_times=array_append(recent,stamp),
      updated_at=stamp,expires_at=stamp+interval '16 minutes'
      WHERE scope=scopes[i] AND subject_key=keys[i];
  END LOOP;
  DELETE FROM identity.auth_rate_limits a USING (
    SELECT scope,subject_key FROM identity.auth_rate_limits WHERE expires_at<=stamp
      ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED
  ) old WHERE a.scope=old.scope AND a.subject_key=old.subject_key;
  RETURN true;
EXCEPTION WHEN SQLSTATE 'LP003' THEN RETURN false;
END;
$fn$;

CREATE FUNCTION identity.prepare_registration(p_name text,p_email text,p_hash text,p_challenge uuid,p_request bytea,p_code bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE account identity.users%ROWTYPE; stamp timestamptz;
BEGIN
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_email IS NULL
    OR octet_length(p_email)>254 OR p_email<>btrim(p_email) OR p_challenge IS NULL
    OR octet_length(p_request) IS DISTINCT FROM 32 OR octet_length(p_code) IS DISTINCT FROM 32
    OR p_hash IS NULL OR p_hash !~ '^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$'
    THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_email COLLATE "C"),725006));
  SELECT * INTO account FROM identity.users WHERE email_key=lower(p_email COLLATE "C") FOR UPDATE;
  stamp := clock_timestamp();
  IF FOUND THEN
    IF account.status<>'PENDING_VERIFICATION' OR account.email_verified_at IS NOT NULL
      OR account.role_code<>'CLIENTE' THEN RETURN NULL; END IF;
    UPDATE identity.users SET name=btrim(p_name),email=p_email,registration_version=registration_version+1,
      security_version=security_version+1,updated_at=stamp WHERE id=account.id RETURNING * INTO account;
  ELSE
    INSERT INTO identity.users(id,name,email,role_code,status,created_at,updated_at)
      VALUES(gen_random_uuid(),btrim(p_name),p_email,'CLIENTE','PENDING_VERIFICATION',stamp,stamp) RETURNING * INTO account;
  END IF;
  INSERT INTO identity.password_credentials(user_id,password_hash,state,policy_version,registration_version,
    provisional_expires_at,created_at,changed_at)
    VALUES(account.id,p_hash,'PROVISIONAL',1,account.registration_version,stamp+interval '15 minutes',stamp,stamp)
    ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,state='PROVISIONAL',
      policy_version=1,registration_version=excluded.registration_version,
      provisional_expires_at=excluded.provisional_expires_at,created_at=stamp,changed_at=stamp;
  UPDATE identity.email_verifications SET revoked_at=stamp WHERE user_id=account.id
    AND purpose='REGISTER' AND consumed_at IS NULL AND revoked_at IS NULL;
  INSERT INTO identity.email_verifications(id,user_id,purpose,target_email,token_hash,request_secret_hash,
    registration_version,security_version,created_at,expires_at,last_issued_at)
    VALUES(p_challenge,account.id,'REGISTER',account.email,p_code,p_request,
      account.registration_version,account.security_version,stamp,stamp+interval '15 minutes',stamp);
  INSERT INTO audit.security_events(id,subject_user_id,request_id,event_code,outcome)
    VALUES(gen_random_uuid(),account.id,p_challenge,'REGISTRATION_REQUESTED','SUCCESS');
  RETURN jsonb_build_object('email',account.email);
END;
$fn$;

CREATE FUNCTION identity.resend_registration(p_challenge uuid,p_request bytea,p_code bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE account identity.users%ROWTYPE; challenge identity.email_verifications%ROWTYPE; target uuid; stamp timestamptz;
BEGIN
  IF octet_length(p_request) IS DISTINCT FROM 32 OR octet_length(p_code) IS DISTINCT FROM 32 THEN RETURN NULL; END IF;
  SELECT user_id INTO target FROM identity.email_verifications WHERE id=p_challenge;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO account FROM identity.users WHERE id=target FOR UPDATE;
  PERFORM 1 FROM identity.password_credentials WHERE user_id=target FOR UPDATE;
  SELECT * INTO challenge FROM identity.email_verifications WHERE id=p_challenge FOR UPDATE;
  stamp := clock_timestamp();
  IF account.status<>'PENDING_VERIFICATION' OR account.role_code<>'CLIENTE'
    OR account.email_verified_at IS NOT NULL OR challenge.purpose<>'REGISTER'
    OR challenge.request_secret_hash<>p_request OR challenge.revoked_at IS NOT NULL
    OR challenge.consumed_at IS NOT NULL OR challenge.send_count>=3
    OR challenge.last_issued_at>stamp-interval '60 seconds'
    OR challenge.created_at<stamp-interval '23 hours'
    OR challenge.registration_version<>account.registration_version
    OR challenge.security_version<>account.security_version THEN RETURN NULL; END IF;
  UPDATE identity.email_verifications SET token_hash=p_code,attempts=0,delivery_state='PENDING',
    last_issued_at=stamp,send_count=send_count+1,expires_at=stamp+interval '15 minutes' WHERE id=p_challenge;
  UPDATE identity.password_credentials SET provisional_expires_at=stamp+interval '15 minutes',changed_at=stamp
    WHERE user_id=target AND state='PROVISIONAL';
  RETURN jsonb_build_object('email',account.email);
END;
$fn$;

CREATE FUNCTION identity.registration_delivery(p_challenge uuid,p_code bytea,p_sent boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  UPDATE identity.email_verifications SET delivery_state=CASE WHEN p_sent THEN 'SENT' ELSE 'FAILED' END
    WHERE id=p_challenge AND purpose='REGISTER' AND token_hash=p_code AND consumed_at IS NULL AND revoked_at IS NULL;
  RETURN FOUND;
END;
$fn$;

CREATE FUNCTION identity.confirm_registration(p_challenge uuid,p_request bytea,p_code bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE account identity.users%ROWTYPE; credential identity.password_credentials%ROWTYPE;
  challenge identity.email_verifications%ROWTYPE; target uuid; stamp timestamptz;
BEGIN
  IF octet_length(p_request) IS DISTINCT FROM 32 OR octet_length(p_code) IS DISTINCT FROM 32 THEN RETURN false; END IF;
  SELECT user_id INTO target FROM identity.email_verifications WHERE id=p_challenge;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO account FROM identity.users WHERE id=target FOR UPDATE;
  SELECT * INTO credential FROM identity.password_credentials WHERE user_id=target FOR UPDATE;
  SELECT * INTO challenge FROM identity.email_verifications WHERE id=p_challenge FOR UPDATE;
  stamp := clock_timestamp();
  IF account.status<>'PENDING_VERIFICATION' OR account.role_code<>'CLIENTE' OR account.email_verified_at IS NOT NULL
    OR challenge.purpose<>'REGISTER' OR challenge.request_secret_hash<>p_request
    OR challenge.consumed_at IS NOT NULL OR challenge.revoked_at IS NOT NULL OR challenge.expires_at<=stamp
    OR challenge.attempts>=5 OR challenge.delivery_state<>'SENT'
    OR challenge.target_email_key<>account.email_key
    OR challenge.registration_version<>account.registration_version OR challenge.security_version<>account.security_version
    OR credential.state<>'PROVISIONAL' OR credential.policy_version<>1
    OR credential.registration_version<>account.registration_version OR credential.provisional_expires_at<=stamp
    THEN RETURN false; END IF;
  IF challenge.token_hash<>p_code THEN
    UPDATE identity.email_verifications SET attempts=attempts+1,
      revoked_at=CASE WHEN attempts+1>=5 THEN stamp ELSE NULL END WHERE id=p_challenge;
    RETURN false;
  END IF;
  UPDATE identity.email_verifications SET consumed_at=stamp WHERE id=p_challenge;
  UPDATE identity.password_credentials SET state='CONFIRMED',provisional_expires_at=NULL,changed_at=stamp WHERE user_id=target;
  UPDATE identity.users SET status='ACTIVE',email_verified_at=stamp,updated_at=stamp WHERE id=target;
  INSERT INTO audit.security_events(id,subject_user_id,request_id,event_code,outcome)
    VALUES(gen_random_uuid(),target,p_challenge,'REGISTRATION_CONFIRMED','SUCCESS');
  RETURN true;
END;
$fn$;

DO $acl$
DECLARE signature text; migrator name := current_user;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'identity.registration_budget(bytea,bytea,text)',
    'identity.prepare_registration(text,text,text,uuid,bytea,bytea)',
    'identity.resend_registration(uuid,bytea,bytea)',
    'identity.registration_delivery(uuid,bytea,boolean)',
    'identity.confirm_registration(uuid,bytea,bytea)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO lapape_registration_executor',signature);
    SET LOCAL ROLE lapape_registration_executor;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO lapape_auth_runtime',signature);
    EXECUTE format('SET LOCAL ROLE %I',migrator);
    IF EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl
      WHERE p.oid=to_regprocedure(signature)
        AND acl.grantee NOT IN ('lapape_auth_runtime'::regrole,'lapape_registration_executor'::regrole)) THEN
      RAISE EXCEPTION 'Unexpected default registration function ACL';
    END IF;
  END LOOP;
END;
$acl$;
REVOKE CREATE ON SCHEMA identity FROM lapape_registration_executor;
REVOKE lapape_registration_executor FROM CURRENT_USER;
COMMIT;
