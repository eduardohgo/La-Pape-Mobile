BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;
SET LOCAL TIME ZONE 'UTC';

DO $guard$
BEGIN
  IF current_database() <> 'lapape_mobile_dev'
     OR current_setting('server_version_num')::int / 10000 <> 18
     OR to_regprocedure('identity.delete_mobile_account(bytea,text,bigint)') IS NULL
     OR to_regprocedure('identity.confirm_registration(uuid,bytea,bytea)') IS NULL THEN
    RAISE EXCEPTION 'Expected PostgreSQL 18 and migrations 006 and 007';
  END IF;
END
$guard$;

CREATE ROLE lapape_privacy_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT lapape_privacy_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA privacy AUTHORIZATION lapape_privacy_executor;
REVOKE ALL ON SCHEMA privacy FROM PUBLIC;
GRANT USAGE ON SCHEMA identity TO lapape_privacy_executor;
GRANT REFERENCES (id) ON identity.users, identity.email_verifications TO lapape_privacy_executor;
GRANT SELECT (id, name, updated_at, email_verified_at, created_at),
      UPDATE (name, updated_at) ON identity.users TO lapape_privacy_executor;
GRANT SELECT (secret_hash, user_id) ON identity.sessions TO lapape_privacy_executor;
GRANT EXECUTE ON FUNCTION identity.read_mobile_session(bytea),
  identity.prepare_registration(text,text,text,uuid,bytea,bytea) TO lapape_privacy_executor;

SET LOCAL ROLE lapape_privacy_executor;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE privacy.legal_documents (
  kind text NOT NULL CHECK (kind IN ('terms', 'notice')),
  version text NOT NULL CHECK (version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$'),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),
  specific_purpose text CHECK (specific_purpose IS NULL OR (kind = 'notice'
    AND specific_purpose ~ '^[a-z][a-z0-9_]{0,39}$'
    AND specific_purpose NOT IN ('promotions', 'service_terms', 'notice_presented'))),
  published_at timestamptz,
  PRIMARY KEY (kind, version),
  CHECK ((status = 'DRAFT') = (published_at IS NULL))
);
CREATE UNIQUE INDEX legal_document_current ON privacy.legal_documents (kind) WHERE status = 'PUBLISHED';
CREATE FUNCTION privacy.protect_document() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  IF OLD.published_at IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Published versions cannot be deleted'; END IF;
    IF (NEW.kind, NEW.version, NEW.body, NEW.specific_purpose, NEW.published_at)
        IS DISTINCT FROM (OLD.kind, OLD.version, OLD.body, OLD.specific_purpose, OLD.published_at)
        OR (OLD.status = 'RETIRED' AND NEW.status <> 'RETIRED') THEN
      RAISE EXCEPTION 'Published versions are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER protect_document BEFORE UPDATE OR DELETE ON privacy.legal_documents
  FOR EACH ROW EXECUTE FUNCTION privacy.protect_document();

-- The temporary evidence belongs only to the registration challenge. Deleting that
-- challenge (including via migration 007) removes only its pending decisions.
CREATE TABLE privacy.pending_registration (
  challenge_id uuid PRIMARY KEY REFERENCES identity.email_verifications(id) ON DELETE CASCADE,
  terms_kind text GENERATED ALWAYS AS ('terms') STORED,
  terms_version text NOT NULL,
  notice_kind text GENERATED ALWAYS AS ('notice') STORED,
  notice_version text NOT NULL,
  specific_purpose text,
  specific_granted boolean,
  promotions boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (terms_kind, terms_version) REFERENCES privacy.legal_documents(kind, version),
  FOREIGN KEY (notice_kind, notice_version) REFERENCES privacy.legal_documents(kind, version),
  CHECK ((specific_purpose IS NULL) = (specific_granted IS NULL))
);

CREATE TABLE privacy.consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  decision_type text NOT NULL CHECK (decision_type IN ('terms', 'notice', 'specific', 'promotions')),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_]{0,39}$'),
  granted boolean NOT NULL,
  document_kind text NOT NULL,
  document_version text NOT NULL,
  recorded_at timestamptz NOT NULL,
  FOREIGN KEY (document_kind, document_version) REFERENCES privacy.legal_documents(kind, version),
  UNIQUE (user_id, request_id, decision_type),
  CHECK ((decision_type = 'terms' AND purpose = 'service_terms' AND document_kind = 'terms' AND granted)
      OR (decision_type = 'notice' AND purpose = 'notice_presented' AND document_kind = 'notice' AND granted)
      OR (decision_type = 'promotions' AND purpose = 'promotions' AND document_kind = 'notice')
      OR (decision_type = 'specific' AND purpose NOT IN ('promotions','service_terms','notice_presented')
        AND document_kind = 'notice'))
);
CREATE INDEX consent_events_by_owner ON privacy.consent_events(user_id, recorded_at, id);

CREATE TABLE privacy.arco_requests (
  folio uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('ACCESS','RECTIFICATION','CANCELLATION','OPPOSITION')),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_]{0,39}$'),
  status text NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','IN_REVIEW','RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  CHECK (updated_at >= created_at),
  CHECK ((status = 'RESOLVED') = (resolved_at IS NOT NULL)),
  CHECK (resolved_at IS NULL OR resolved_at BETWEEN created_at AND updated_at)
);
CREATE INDEX arco_requests_by_owner ON privacy.arco_requests(user_id, created_at);

CREATE FUNCTION privacy.current_documents() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT jsonb_build_object('terms', jsonb_build_object('version', t.version, 'body', t.body),
    'notice', jsonb_build_object('version', n.version, 'body', n.body, 'specificPurpose', n.specific_purpose))
  FROM privacy.legal_documents t CROSS JOIN privacy.legal_documents n
  WHERE t.kind = 'terms' AND n.kind = 'notice' AND t.status = 'PUBLISHED' AND n.status = 'PUBLISHED'
$fn$;

CREATE FUNCTION privacy.prepare_registration(p_name text, p_email text, p_hash text, p_challenge uuid,
  p_proof bytea, p_code bytea, p_terms text, p_notice text, p_specific boolean, p_promotions boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  purpose text;
  account jsonb;
BEGIN
  PERFORM 1 FROM privacy.legal_documents WHERE kind = 'terms' AND version = p_terms AND status = 'PUBLISHED' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'documents_changed'); END IF;
  SELECT specific_purpose INTO purpose FROM privacy.legal_documents
    WHERE kind = 'notice' AND version = p_notice AND status = 'PUBLISHED' FOR SHARE;
  IF NOT FOUND OR (purpose IS NULL) <> (p_specific IS NULL) OR p_promotions IS NULL THEN
    RETURN jsonb_build_object('status', 'documents_changed');
  END IF;
  account := identity.prepare_registration(p_name, p_email, p_hash, p_challenge, p_proof, p_code);
  IF account IS NOT NULL THEN
    INSERT INTO privacy.pending_registration(challenge_id, terms_version, notice_version, specific_purpose,
      specific_granted, promotions) VALUES (p_challenge, p_terms, p_notice, purpose, p_specific, p_promotions);
  END IF;
  RETURN jsonb_build_object('account', account);
END
$fn$;

-- The OTP update and the evidence commit in the same transaction. Legacy
-- challenges have no pending evidence and do not generate consent history.
CREATE FUNCTION privacy.finish_registration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  evidence privacy.pending_registration%ROWTYPE;
BEGIN
  DELETE FROM privacy.pending_registration WHERE challenge_id = NEW.id RETURNING * INTO evidence;
  IF FOUND AND NEW.consumed_at IS NOT NULL THEN
    INSERT INTO privacy.consent_events(user_id, request_id, decision_type, purpose,
      granted, document_kind, document_version, recorded_at)
    SELECT NEW.user_id, NEW.id, decision_type, purpose, granted, document_kind, version, evidence.recorded_at
    FROM (VALUES
      ('terms', 'service_terms', true, 'terms', evidence.terms_version),
      ('notice', 'notice_presented', true, 'notice', evidence.notice_version),
      ('specific', evidence.specific_purpose, evidence.specific_granted, 'notice', evidence.notice_version),
      ('promotions', 'promotions', evidence.promotions, 'notice', evidence.notice_version)
    ) AS decisions(decision_type, purpose, granted, document_kind, version)
    WHERE purpose IS NOT NULL;
  END IF;
  RETURN NULL;
END
$fn$;

CREATE FUNCTION privacy.read_my_data(p_token bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  session_data jsonb := identity.read_mobile_session(p_token);
  owner_id uuid;
BEGIN
  IF session_data IS NULL THEN RETURN NULL; END IF;
  owner_id := (session_data #>> '{user,id}')::uuid;
  RETURN jsonb_build_object('account', session_data->'user',
    'createdAt', (SELECT created_at FROM identity.users WHERE id = owner_id),
    'emailVerifiedAt', (SELECT email_verified_at FROM identity.users WHERE id = owner_id),
    'decisions', coalesce((SELECT jsonb_agg(jsonb_build_object('type', decision_type, 'purpose', purpose,
      'granted', granted, 'documentVersion', document_version,
      'recordedAt', to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
      ORDER BY recorded_at, id) FROM privacy.consent_events WHERE user_id = owner_id), '[]'::jsonb));
END
$fn$;

CREATE FUNCTION privacy.update_my_name(p_token bytea, p_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  owner_id uuid;
  session_data jsonb;
BEGIN
  IF p_name IS NULL OR char_length(p_name) NOT BETWEEN 1 AND 120
     OR p_name <> btrim(p_name) OR p_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Invalid profile name' USING ERRCODE = '22023';
  END IF;
  SELECT user_id INTO owner_id FROM identity.sessions WHERE secret_hash = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- Lock the user before the password credential and session, as in 004/007.
  PERFORM 1 FROM identity.users WHERE id = owner_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  session_data := identity.read_mobile_session(p_token);
  IF session_data IS NULL OR (session_data #>> '{user,id}')::uuid IS DISTINCT FROM owner_id THEN
    RETURN NULL;
  END IF;
  UPDATE identity.users SET name = p_name, updated_at = greatest(updated_at, clock_timestamp())
    WHERE id = owner_id;
  RETURN jsonb_set(session_data, '{user,name}', to_jsonb(p_name));
END
$fn$;

CREATE FUNCTION privacy.record_my_promotions(p_token bytea, p_request uuid, p_notice text, p_granted boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  owner_id uuid;
  session_data jsonb;
  prior privacy.consent_events%ROWTYPE;
  current_notice boolean;
BEGIN
  IF p_request IS NULL OR p_granted IS NULL THEN RAISE EXCEPTION 'Missing consent decision'; END IF;

  -- Same order as enrollment. Locking this row also serializes publication changes.
  PERFORM 1 FROM privacy.legal_documents WHERE kind = 'notice' AND version = p_notice AND status = 'PUBLISHED' FOR SHARE;
  current_notice := FOUND;
  session_data := identity.read_mobile_session(p_token);
  IF session_data IS NULL THEN RETURN 'unauthorized'; END IF;
  owner_id := (session_data #>> '{user,id}')::uuid;

  -- Concurrent calls from different sessions can race for the same key. The
  -- unique constraint arbitrates, and the following SELECT checks the winner.
  INSERT INTO privacy.consent_events(user_id, request_id, decision_type, purpose, granted,
    document_kind, document_version, recorded_at)
  SELECT owner_id, p_request, 'promotions', 'promotions', p_granted, 'notice', p_notice, clock_timestamp()
  WHERE current_notice
  ON CONFLICT (user_id, request_id, decision_type) DO NOTHING;

  SELECT * INTO prior FROM privacy.consent_events
    WHERE user_id = owner_id AND request_id = p_request AND decision_type = 'promotions';
  IF NOT FOUND THEN RETURN 'documents_changed'; END IF;
  IF (prior.document_version, prior.granted) IS DISTINCT FROM (p_notice, p_granted) THEN RETURN 'conflict'; END IF;
  RETURN 'recorded';
END
$fn$;

-- Only the target owner's evidence and phase-1 requests are removed. Shared legal
-- documents and the unrelated audit trail remain. No retention exception is activated.
CREATE FUNCTION privacy.suppress_account_data() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
BEGIN
  DELETE FROM privacy.consent_events WHERE user_id = OLD.id;
  DELETE FROM privacy.arco_requests WHERE user_id = OLD.id;
  RETURN OLD;
END
$fn$;

GRANT USAGE ON SCHEMA privacy TO lapape_auth_runtime;
GRANT EXECUTE ON FUNCTION privacy.current_documents(), privacy.read_my_data(bytea),
  privacy.update_my_name(bytea,text), privacy.record_my_promotions(bytea,uuid,text,boolean),
  privacy.prepare_registration(text,text,text,uuid,bytea,bytea,text,text,boolean,boolean)
  TO lapape_auth_runtime;

RESET ROLE;
DO $acl$
DECLARE migrator name := current_user;
BEGIN
  SET LOCAL ROLE lapape_privacy_executor;
  EXECUTE format('GRANT EXECUTE ON FUNCTION privacy.finish_registration(), privacy.suppress_account_data() TO %I', migrator);
  EXECUTE format('SET LOCAL ROLE %I', migrator);
END
$acl$;
CREATE TRIGGER finish_privacy_registration AFTER UPDATE OF consumed_at, revoked_at ON identity.email_verifications
  FOR EACH ROW WHEN ((OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL)
    OR (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL))
  EXECUTE FUNCTION privacy.finish_registration();
CREATE TRIGGER suppress_privacy_on_account_delete BEFORE DELETE ON identity.users
  FOR EACH ROW EXECUTE FUNCTION privacy.suppress_account_data();
DO $acl$
DECLARE migrator name := current_user;
BEGIN
  SET LOCAL ROLE lapape_privacy_executor;
  EXECUTE format('REVOKE EXECUTE ON FUNCTION privacy.finish_registration(), privacy.suppress_account_data() FROM %I', migrator);
  EXECUTE format('SET LOCAL ROLE %I', migrator);
END
$acl$;
REVOKE REFERENCES (id) ON identity.users, identity.email_verifications FROM lapape_privacy_executor;
REVOKE lapape_privacy_executor FROM CURRENT_USER;
COMMIT;
