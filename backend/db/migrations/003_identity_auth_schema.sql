-- DRAFT FOR REVIEW ONLY. NOT AUTHORIZED FOR EXECUTION, INCLUDING IN NEON.
-- PostgreSQL 18, lapape_mobile_dev; additive to 001 and 002, never rerun them.
-- No users, credentials or tokens are imported. No HTTP/service code is enabled.
-- Future executor: dedicated migration owner, never the application/catalog reader.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL standard_conforming_strings = on;
SET LOCAL search_path = pg_catalog;

DO $preflight$
DECLARE
  item record;
  actual_columns text[];
BEGIN
  IF current_database() <> 'lapape_mobile_dev'
     OR current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 THEN
    RAISE EXCEPTION 'Unexpected database or PostgreSQL major version';
  END IF;
  IF current_user = 'lapape_catalog_reader' THEN
    RAISE EXCEPTION 'A separate migration owner is required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN ('identity', 'audit')) THEN
    RAISE EXCEPTION 'Identity/audit already exists: review migration history and drift; do not overwrite';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'catalog' AND c.relkind IN ('r', 'p', 'f', 'v', 'm')) <> 3
     OR (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'demo' AND c.relkind IN ('r', 'p', 'f', 'v', 'm')) <> 1 THEN
    RAISE EXCEPTION 'Expected the three catalog tables and one demo table from 001/002';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('catalog.categories', ARRAY['id','name','description','is_active','created_at','updated_at']),
    ('catalog.brands', ARRAY['id','name','created_at','updated_at']),
    ('catalog.products', ARRAY['id','sku','name','description','category_id','brand_id','price','currency','image_url','is_published','reviewed_at','created_at','updated_at']),
    ('demo.product_previews', ARRAY['id','source_sku','name','category_id','category_name','price','currency','image_url','is_demo','is_for_sale','created_at'])
  ) AS expected(table_name, column_names)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
                   WHERE oid = pg_catalog.to_regclass(item.table_name) AND relkind = 'r') THEN
      RAISE EXCEPTION 'Expected ordinary table %', item.table_name;
    END IF;
    SELECT array_agg(attname::text ORDER BY attnum) INTO actual_columns
      FROM pg_catalog.pg_attribute
      WHERE attrelid = pg_catalog.to_regclass(item.table_name) AND attnum > 0 AND NOT attisdropped;
    IF actual_columns IS DISTINCT FROM item.column_names THEN
      RAISE EXCEPTION 'Column drift in %', item.table_name;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
                   WHERE attrelid = pg_catalog.to_regclass(item.table_name) AND attname = 'id'
                     AND atttypid = 'uuid'::regtype AND attnotnull)
       OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                      WHERE conrelid = pg_catalog.to_regclass(item.table_name) AND contype = 'p'
                        AND conkey = ARRAY[1]::smallint[]) THEN
      RAISE EXCEPTION 'Primary key/type drift in %', item.table_name;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_catalog.pg_constraint
      WHERE conrelid = 'catalog.products'::regclass AND contype = 'f' AND convalidated
        AND ((conname = 'products_category_fk' AND confrelid = 'catalog.categories'::regclass
              AND conkey = ARRAY[5]::smallint[] AND confkey = ARRAY[1]::smallint[])
          OR (conname = 'products_brand_fk' AND confrelid = 'catalog.brands'::regclass
              AND conkey = ARRAY[6]::smallint[] AND confkey = ARRAY[1]::smallint[]))
        AND confdeltype = 'r' AND confupdtype = 'r') <> 2
     OR (SELECT count(*) FROM pg_catalog.pg_constraint
         WHERE conrelid = 'catalog.products'::regclass AND contype = 'f') <> 2 THEN
    RAISE EXCEPTION 'Catalog foreign key drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'catalog.products'::regclass
                 AND attname = 'image_url' AND atttypid = 'text'::regtype AND NOT attnotnull)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'demo.product_previews'::regclass
                    AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION 'Catalog/demo prerequisites differ from reviewed baseline';
  END IF;
END;
$preflight$;

CREATE SCHEMA identity;
CREATE SCHEMA audit;
REVOKE ALL ON SCHEMA identity, audit FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA identity REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit REVOKE ALL ON TABLES FROM PUBLIC;
-- Per-schema default REVOKE cannot remove globally granted EXECUTE (including
-- PostgreSQL's built-in PUBLIC default). Do not change global defaults here.
-- Each future restricted function MUST be created and have EXECUTE revoked from
-- PUBLIC in the SAME transaction, then granted only to its authorized role.
-- Inspect inherited/default ACLs and owner privileges as well; this creates no functions.

CREATE TABLE identity.roles (
  code text COLLATE "C" PRIMARY KEY,
  CONSTRAINT roles_fixed_codes CHECK (code IN ('CLIENTE','TRABAJADOR','ADMIN','DUENO'))
);
-- Static policy vocabulary only, not user/import data or PostgreSQL login roles.
INSERT INTO identity.roles(code) VALUES ('CLIENTE'),('TRABAJADOR'),('ADMIN'),('DUENO');

CREATE TABLE identity.users (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  email varchar(254) COLLATE "C" NOT NULL CHECK (email ~ '^[!-~]+$'),
  email_key text COLLATE "C" GENERATED ALWAYS AS (lower(email COLLATE "C")) STORED NOT NULL,
  role_code text COLLATE "C" NOT NULL DEFAULT 'CLIENTE'
    REFERENCES identity.roles(code) ON UPDATE RESTRICT ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DISABLED')),
  email_verified_at timestamptz,
  security_version bigint NOT NULL DEFAULT 1 CHECK (security_version > 0),
  registration_version bigint NOT NULL DEFAULT 1 CHECK (registration_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT users_email_key_unique UNIQUE (email_key),
  CHECK (updated_at >= created_at),
  CHECK (email_verified_at IS NULL OR (email_verified_at >= created_at AND email_verified_at <= updated_at)),
  CHECK (status <> 'ACTIVE' OR email_verified_at IS NOT NULL)
  -- Row-local only: this CHECK cannot establish credential state across tables.
  -- Future activation MUST atomically consume the current REGISTER challenge,
  -- confirm the credential and verify email/versions before setting ACTIVE.
  -- Login AND session validation must deny missing/PROVISIONAL credentials,
  -- even for an ACTIVE user. No generic runtime DML is authorized by this draft.
);

CREATE TABLE identity.password_credentials (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  password_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('PROVISIONAL','CONFIRMED')),
  policy_version integer NOT NULL CHECK (policy_version > 0),
  registration_version bigint NOT NULL CHECK (registration_version > 0),
  provisional_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- PHC shape + broad storage ceilings ONLY, NOT cryptographic assurance or a
  -- production cost policy. Validate decoded salt/tag and approved resource
  -- profiles BEFORE calling the future library on any untrusted hash.
  -- m is KiB; ceilings permit tuning, not permission to allocate 1 GiB per login.
  -- CASE guards casts: separate CHECKs/AND do not guarantee evaluation order.
  CONSTRAINT credentials_argon2id_phc CHECK (
    CASE WHEN octet_length(password_hash) <= 512 AND password_hash ~
      '^\$argon2id\$v=19\$m=[1-9][0-9]{0,6},t=[1-9][0-9]?,p=[1-9][0-9]?\$[A-Za-z0-9+/]{22,86}\$[A-Za-z0-9+/]{43,86}$'
    THEN substring(split_part(split_part(password_hash, '$', 4), ',', 1) FROM 3)::integer
           BETWEEN 8 * substring(split_part(split_part(password_hash, '$', 4), ',', 3) FROM 3)::integer AND 1048576
      AND substring(split_part(split_part(password_hash, '$', 4), ',', 2) FROM 3)::integer BETWEEN 1 AND 20
      AND substring(split_part(split_part(password_hash, '$', 4), ',', 3) FROM 3)::integer BETWEEN 1 AND 16
    ELSE false END),
  CHECK (changed_at >= created_at),
  CHECK ((state = 'PROVISIONAL' AND provisional_expires_at IS NOT NULL
          AND provisional_expires_at > created_at AND provisional_expires_at <= created_at + interval '7 days')
      OR (state = 'CONFIRMED' AND provisional_expires_at IS NULL))
);

CREATE TABLE identity.email_verifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('REGISTER','EMAIL_CHANGE')),
  target_email varchar(254) COLLATE "C" NOT NULL CHECK (target_email ~ '^[!-~]+$'),
  target_email_key text COLLATE "C" GENERATED ALWAYS AS (lower(target_email COLLATE "C")) STORED NOT NULL,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  request_secret_hash bytea,
  registration_version bigint NOT NULL CHECK (registration_version > 0),
  security_version bigint NOT NULL CHECK (security_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (purpose <> 'REGISTER' OR request_secret_hash IS NOT NULL),
  CHECK (request_secret_hash IS NULL OR octet_length(request_secret_hash) = 32),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours'),
  CHECK (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX email_verifications_user_open_idx ON identity.email_verifications(user_id, purpose)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX email_verifications_expiry_idx ON identity.email_verifications(expires_at);

CREATE TABLE identity.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  secret_hash bytea NOT NULL UNIQUE CHECK (octet_length(secret_hash) = 32),
  transport text NOT NULL CHECK (transport IN ('MOBILE_BEARER','WEB_COOKIE')),
  role_at_issue text COLLATE "C" NOT NULL REFERENCES identity.roles(code) ON UPDATE RESTRICT ON DELETE RESTRICT,
  security_version bigint NOT NULL CHECK (security_version > 0),
  idle_timeout_minutes smallint NOT NULL CHECK (idle_timeout_minutes BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  absolute_expires_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IN ('LOGOUT','LOGOUT_ALL','PASSWORD_CHANGE','PASSWORD_RESET','EMAIL_CHANGE','ROLE_CHANGE','ACCOUNT_DISABLED','SECURITY')),
  CHECK (role_at_issue NOT IN ('ADMIN','DUENO') OR idle_timeout_minutes <= 15),
  CHECK (absolute_expires_at > created_at AND absolute_expires_at <= created_at + interval '120 minutes'),
  CHECK (last_activity_at >= created_at AND last_activity_at < absolute_expires_at),
  CHECK (idle_expires_at > last_activity_at AND idle_expires_at <= absolute_expires_at
         AND idle_expires_at <= last_activity_at + idle_timeout_minutes * interval '1 minute'),
  CHECK ((revoked_at IS NULL AND revocation_reason IS NULL)
      OR (revoked_at IS NOT NULL AND revoked_at >= created_at AND revocation_reason IS NOT NULL))
);
CREATE INDEX sessions_user_open_idx ON identity.sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_expiry_idx ON identity.sessions(absolute_expires_at);

CREATE TABLE identity.password_resets (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  security_version bigint NOT NULL CHECK (security_version > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CHECK (consumed_at IS NULL OR (consumed_at >= created_at AND consumed_at < expires_at)),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX password_resets_user_open_idx ON identity.password_resets(user_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;
CREATE INDEX password_resets_expiry_idx ON identity.password_resets(expires_at);

CREATE TABLE audit.security_events (
  id uuid PRIMARY KEY,
  actor_user_id uuid REFERENCES identity.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  subject_user_id uuid REFERENCES identity.users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  -- Correlation only: no FK, so expired sessions can eventually be purged.
  session_id uuid,
  event_code text NOT NULL CHECK (event_code IN ('REGISTRATION_REQUESTED','REGISTRATION_CONFIRMED','EMAIL_CHALLENGE_ISSUED','EMAIL_CHANGED','LOGIN_SUCCEEDED','LOGIN_FAILED','LOGIN_THROTTLED','SESSION_REVOKED','PASSWORD_CHANGED','PASSWORD_RESET_REQUESTED','PASSWORD_RESET_COMPLETED','ROLE_CHANGED','ACCESS_DENIED','ACCOUNT_STATUS_CHANGED','PENDING_CREDENTIAL_EXPIRED')),
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE','DENIED')),
  reason_code varchar(64) CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  -- Deliberately no arbitrary JSON, request body, email, password or token columns.
);
CREATE INDEX security_events_subject_time_idx ON audit.security_events(subject_user_id, occurred_at DESC);
CREATE INDEX security_events_actor_time_idx ON audit.security_events(actor_user_id, occurred_at DESC);
CREATE INDEX security_events_request_idx ON audit.security_events(request_id);
CREATE INDEX security_events_time_idx ON audit.security_events(occurred_at);

-- Operational state, not audit history. Keys are HMACs, including nonexistent accounts.
-- Parallel bounded arrays retain exact rolling-window failures and reservation leases.
-- Their semantic validation/pruning/atomic updates require the future auth service.
CREATE TABLE identity.auth_rate_limits (
  scope text NOT NULL CHECK (scope IN ('ACCOUNT','ORIGIN','ACCOUNT_ORIGIN')),
  subject_key bytea NOT NULL CHECK (octet_length(subject_key) = 32),
  failure_times timestamptz[] NOT NULL DEFAULT '{}',
  reservation_ids uuid[] NOT NULL DEFAULT '{}',
  reservation_deadlines timestamptz[] NOT NULL DEFAULT '{}',
  blocked_until timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, subject_key),
  CHECK (cardinality(failure_times) <= CASE WHEN scope = 'ORIGIN' THEN 30 ELSE 5 END),
  CHECK (cardinality(reservation_ids) <= 30
         AND cardinality(reservation_ids) = cardinality(reservation_deadlines)),
  CHECK (coalesce(array_ndims(failure_times), 1) = 1
         AND coalesce(array_ndims(reservation_ids), 1) = 1
         AND coalesce(array_ndims(reservation_deadlines), 1) = 1),
  CHECK (coalesce(array_lower(failure_times, 1), 1) = 1
         AND coalesce(array_lower(reservation_ids, 1), 1) = 1
         AND coalesce(array_lower(reservation_deadlines, 1), 1) = 1),
  CHECK (array_position(failure_times, NULL) IS NULL
         AND array_position(reservation_ids, NULL) IS NULL
         AND array_position(reservation_deadlines, NULL) IS NULL),
  CHECK (scope <> 'ACCOUNT' OR blocked_until IS NULL),
  CHECK (blocked_until IS NULL OR blocked_until <= expires_at),
  CHECK (expires_at > updated_at)
);
CREATE INDEX auth_rate_limits_expiry_idx ON identity.auth_rate_limits(expires_at);

REVOKE ALL ON ALL TABLES IN SCHEMA identity, audit FROM PUBLIC;
-- Fail closed: NO runtime GRANT, LOGIN role, SECURITY DEFINER function or account.
-- In particular no GRANT to lapape_catalog_reader. Roles seed does not authorize registration.
-- A later reviewed permission/function migration must expose fixed-CLIENTE registration,
-- activation, session creation/revocation and separate administrative operations.
-- Owner/superuser bypass remains a deployment responsibility, not an app permission.
COMMENT ON SCHEMA identity IS 'DRAFT 003 identity model; runtime access must be provisioned separately after review';
COMMENT ON SCHEMA audit IS 'Security events; future runtime INSERT only, retention by separate maintenance principal';
COMMENT ON COLUMN identity.users.email_key IS 'ASCII canonical key corresponding to validated emailKey; email syntax remains validated in backend';
COMMENT ON COLUMN identity.sessions.role_at_issue IS 'Policy snapshot only, NEVER authority; compare current user role, state and security_version on every request';
COMMENT ON TABLE identity.auth_rate_limits IS 'Future atomic limiter storage; array CHECKs are structural, not enforcement of five failures in fifteen minutes';
COMMIT;
