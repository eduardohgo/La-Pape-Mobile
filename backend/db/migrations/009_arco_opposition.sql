BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, pg_temp;

DO $guard$
BEGIN
  IF current_database() <> 'lapape_mobile_dev'
     OR current_setting('server_version_num')::int / 10000 <> 18
     OR to_regprocedure('privacy.suppress_account_data()') IS NULL THEN
    RAISE EXCEPTION 'Expected PostgreSQL 18 and migration 008';
  END IF;
END
$guard$;

CREATE ROLE lapape_arco_reviewer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT lapape_privacy_executor TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE lapape_privacy_executor;

ALTER TABLE privacy.arco_requests
  DROP CONSTRAINT arco_requests_status_check,
  ADD CONSTRAINT arco_request_status CHECK (status IN ('RECEIVED', 'IN_REVIEW', 'RESOLVED', 'REJECTED')),
  ADD COLUMN request_key uuid,
  ADD COLUMN reason text,
  ADD COLUMN determination text,
  ADD COLUMN responded_at timestamptz,
  ADD CONSTRAINT arco_request_retry UNIQUE (user_id, request_key),
  ADD CONSTRAINT arco_request_reason CHECK (
    reason IS NULL OR (char_length(btrim(reason)) BETWEEN 1 AND 240 AND reason !~ '[[:cntrl:]]')),
  ADD CONSTRAINT arco_request_opposition CHECK (request_key IS NULL OR (
    kind = 'OPPOSITION' AND purpose IN ('promotions','account_management','account_security')
    AND (purpose = 'promotions' OR reason IS NOT NULL))),
  ADD CONSTRAINT arco_request_determination CHECK (
    (determination IS NULL AND responded_at IS NULL AND status <> 'REJECTED' AND (request_key IS NULL OR status <> 'RESOLVED'))
    OR (determination IS NOT NULL AND char_length(btrim(determination)) BETWEEN 1 AND 500
      AND determination !~ '[[:cntrl:]]' AND responded_at IS NOT NULL
      AND responded_at BETWEEN created_at AND updated_at AND status IN ('RESOLVED','REJECTED')));

-- History is a child of the request. The 008 suppression still deletes the
-- request and now also its own transitions. It does not change audit events.
CREATE TABLE privacy.arco_request_events (
  folio uuid NOT NULL REFERENCES privacy.arco_requests(folio) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('RECEIVED','IN_REVIEW','RESOLVED','REJECTED')),
  recorded_at timestamptz NOT NULL,
  reviewer name,
  PRIMARY KEY (folio, status),
  CHECK ((reviewer IS NULL) = (status = 'RECEIVED'))
);

CREATE FUNCTION privacy.arco_public_row(r privacy.arco_requests, include_history boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT jsonb_build_object('folio', r.folio, 'purpose', r.purpose, 'status', r.status,
    'createdAt', r.created_at, 'respondedAt', r.responded_at)
    || CASE WHEN include_history THEN jsonb_build_object('reason', r.reason, 'determination', r.determination,
      'history', coalesce((SELECT jsonb_agg(jsonb_build_object('status', e.status, 'recordedAt', e.recorded_at)
        ORDER BY e.recorded_at, CASE e.status WHEN 'RECEIVED' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END)
        FROM privacy.arco_request_events e WHERE e.folio = r.folio), '[]'::jsonb))
       ELSE '{}'::jsonb END
$fn$;

CREATE FUNCTION privacy.create_my_opposition(p_token bytea, p_key uuid, p_purpose text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  session_data jsonb := identity.read_mobile_session(p_token);
  requester uuid;
  request_row privacy.arco_requests;
  stamp timestamptz := clock_timestamp();
BEGIN
  IF session_data IS NULL THEN RETURN NULL; END IF;
  IF p_key IS NULL THEN RAISE EXCEPTION 'Request key required' USING ERRCODE = '22023'; END IF;
  requester := (session_data #>> '{user,id}')::uuid;

  INSERT INTO privacy.arco_requests(user_id, kind, purpose, request_key, reason, created_at, updated_at)
    VALUES (requester, 'OPPOSITION', p_purpose, p_key, p_reason, stamp, stamp)
    ON CONFLICT (user_id, request_key) DO NOTHING RETURNING * INTO request_row;
  IF FOUND THEN
    INSERT INTO privacy.arco_request_events(folio, status, recorded_at)
      VALUES (request_row.folio, 'RECEIVED', stamp);
    RETURN jsonb_build_object('created', true, 'request', privacy.arco_public_row(request_row, true));
  END IF;

  SELECT * INTO STRICT request_row FROM privacy.arco_requests WHERE user_id = requester AND request_key = p_key;
  IF (request_row.purpose, request_row.reason) IS DISTINCT FROM (p_purpose, p_reason) THEN
    RETURN jsonb_build_object('conflict', true);
  END IF;
  RETURN jsonb_build_object('created', false, 'request', privacy.arco_public_row(request_row, true));
END
$fn$;

CREATE FUNCTION privacy.list_my_oppositions(p_token bytea, p_before uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  session_data jsonb := identity.read_mobile_session(p_token);
  requester uuid;
  cursor_date timestamptz;
  result jsonb;
BEGIN
  IF session_data IS NULL THEN RETURN NULL; END IF;
  requester := (session_data #>> '{user,id}')::uuid;
  IF p_before IS NOT NULL THEN
    SELECT created_at INTO cursor_date FROM privacy.arco_requests
      WHERE user_id = requester AND folio = p_before AND kind = 'OPPOSITION' AND request_key IS NOT NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('missing', true); END IF;
  END IF;
  WITH page AS (
    SELECT r AS entry, row_number() OVER (ORDER BY r.created_at DESC, r.folio DESC) AS pos
    FROM privacy.arco_requests r WHERE r.user_id = requester AND r.kind = 'OPPOSITION' AND r.request_key IS NOT NULL
      AND (p_before IS NULL OR (r.created_at, r.folio) < (cursor_date, p_before))
    ORDER BY r.created_at DESC, r.folio DESC LIMIT 51
  )
  SELECT jsonb_build_object('items', coalesce(jsonb_agg(privacy.arco_public_row(entry) ORDER BY pos)
    FILTER (WHERE pos <= 50), '[]'::jsonb), 'nextCursor',
    CASE WHEN count(*) > 50 THEN (array_agg((entry).folio ORDER BY pos) FILTER (WHERE pos = 50))[1] END)
  INTO result FROM page;
  RETURN result;
END
$fn$;

CREATE FUNCTION privacy.read_my_opposition(p_token bytea, p_folio uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  session_data jsonb := identity.read_mobile_session(p_token);
  result jsonb;
BEGIN
  IF session_data IS NULL THEN RETURN NULL; END IF;
  SELECT privacy.arco_public_row(r, true) INTO result FROM privacy.arco_requests r
    WHERE r.folio = p_folio AND r.user_id = (session_data #>> '{user,id}')::uuid
      AND r.kind = 'OPPOSITION' AND r.request_key IS NOT NULL;
  RETURN coalesce(result, jsonb_build_object('missing', true));
END
$fn$;

CREATE FUNCTION privacy.read_my_preferences(p_token bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  session_data jsonb := identity.read_mobile_session(p_token);
  current_version text;
  decision privacy.consent_events;
BEGIN
  IF session_data IS NULL THEN RETURN NULL; END IF;
  SELECT version INTO current_version FROM privacy.legal_documents
    WHERE kind = 'notice' AND status = 'PUBLISHED';
  SELECT * INTO decision FROM privacy.consent_events WHERE decision_type = 'promotions'
    AND user_id = (session_data #>> '{user,id}')::uuid ORDER BY recorded_at DESC, id DESC LIMIT 1;
  RETURN jsonb_build_object('noticeVersion', current_version,
    'promotions', coalesce(decision.granted AND decision.document_version = current_version, false),
    'recordedAt', decision.recorded_at);
END
$fn$;

-- This is an operator function. The runtime and the mobile client have no
-- membership or EXECUTE grant. Record the named database login for review.
CREATE FUNCTION privacy.review_opposition(p_folio uuid, p_status text, p_determination text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  request_row privacy.arco_requests;
  stamp timestamptz;
  is_final boolean;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('IN_REVIEW','RESOLVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid opposition status' USING ERRCODE = '22023';
  END IF;
  is_final := p_status IN ('RESOLVED','REJECTED');
  IF (is_final AND (p_determination IS NULL OR char_length(btrim(p_determination)) NOT BETWEEN 1 AND 500
      OR p_determination ~ '[[:cntrl:]]')) OR (NOT is_final AND p_determination IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid determination for this state' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO request_row FROM privacy.arco_requests
    WHERE folio = p_folio AND kind = 'OPPOSITION' AND request_key IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF (request_row.status, request_row.determination) IS NOT DISTINCT FROM (p_status, btrim(p_determination)) THEN
    RETURN privacy.arco_public_row(request_row, true);
  END IF;
  IF NOT ((request_row.status = 'RECEIVED' AND p_status = 'IN_REVIEW')
      OR (request_row.status = 'IN_REVIEW' AND is_final)) THEN
    RAISE EXCEPTION 'Invalid opposition transition' USING ERRCODE = '22023';
  END IF;
  stamp := greatest(clock_timestamp(), request_row.updated_at);
  UPDATE privacy.arco_requests SET status = p_status, determination = btrim(p_determination),
    responded_at = CASE WHEN is_final THEN stamp END,
    resolved_at = CASE WHEN p_status = 'RESOLVED' THEN stamp END, updated_at = stamp
    WHERE folio = p_folio RETURNING * INTO request_row;
  INSERT INTO privacy.arco_request_events(folio, status, recorded_at, reviewer)
    VALUES (request_row.folio, p_status, stamp, session_user);
  RETURN privacy.arco_public_row(request_row, true);
END
$fn$;

CREATE FUNCTION privacy.pending_oppositions() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT coalesce(jsonb_agg(to_jsonb(queue) ORDER BY queue.created_at, queue.folio), '[]'::jsonb)
  FROM (SELECT folio, purpose, reason, status, created_at FROM privacy.arco_requests
    WHERE status IN ('RECEIVED','IN_REVIEW') AND kind = 'OPPOSITION' AND request_key IS NOT NULL
    ORDER BY created_at, folio LIMIT 100) AS queue
$fn$;

REVOKE ALL ON FUNCTION privacy.arco_public_row(privacy.arco_requests,boolean),
  privacy.create_my_opposition(bytea,uuid,text,text), privacy.list_my_oppositions(bytea,uuid),
  privacy.read_my_opposition(bytea,uuid), privacy.read_my_preferences(bytea),
  privacy.review_opposition(uuid,text,text), privacy.pending_oppositions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION privacy.create_my_opposition(bytea,uuid,text,text),
  privacy.list_my_oppositions(bytea,uuid), privacy.read_my_opposition(bytea,uuid),
  privacy.read_my_preferences(bytea) TO lapape_auth_runtime;
GRANT USAGE ON SCHEMA privacy TO lapape_arco_reviewer;
GRANT EXECUTE ON FUNCTION privacy.review_opposition(uuid,text,text), privacy.pending_oppositions() TO lapape_arco_reviewer;
RESET ROLE;
REVOKE lapape_privacy_executor FROM CURRENT_USER;
COMMIT;
