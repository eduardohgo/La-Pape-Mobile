-- Preparation only: this file has NOT been applied to Neon.
-- Target: project twilight-moon-02635569, branch development,
--         database lapape_mobile_dev, PostgreSQL 18.
-- Reviewed projection of the source catalog: no accounts, suppliers,
-- branch data, inventory, orders, payments, or synthetic records.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL standard_conforming_strings = on;

DO $guard$
BEGIN
  IF current_database() <> 'lapape_mobile_dev' THEN
    RAISE EXCEPTION 'Wrong database: expected lapape_mobile_dev';
  END IF;
  IF current_setting('server_version_num')::integer < 180000
     OR current_setting('server_version_num')::integer >= 190000 THEN
    RAISE EXCEPTION 'This migration requires PostgreSQL 18';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p', 'f', 'm', 'v', 'S')
      AND n.nspname <> 'information_schema'
      AND n.nspname !~ '^pg_'
  ) THEN
    RAISE EXCEPTION 'Initial migration requires an empty database';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'catalog') THEN
    RAISE EXCEPTION 'catalog already exists; review schema drift before proceeding';
  END IF;
END
$guard$;

CREATE SCHEMA catalog;
COMMENT ON SCHEMA catalog IS
  'La Pape reviewed catalog projection, migration 001; source SQL SHA256 b03c2111ad3245c9cfee7f823cd770c6ce14d7e76883fc2e518d345674eb908f';

CREATE TABLE catalog.categories (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categories_name_nonempty CHECK (btrim(name) <> '')
);

CREATE TABLE catalog.brands (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT brands_name_nonempty CHECK (btrim(name) <> '')
);

CREATE TABLE catalog.products (
  id uuid PRIMARY KEY,
  sku varchar(60) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  description text NOT NULL,
  category_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  price numeric(10, 2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'MXN',
  image_url text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT products_category_fk FOREIGN KEY (category_id)
    REFERENCES catalog.categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT products_brand_fk FOREIGN KEY (brand_id)
    REFERENCES catalog.brands(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT products_sku_catalog_only CHECK (sku ~ '^LAP-[A-Z]{3}-[0-9]{3}$'),
  CONSTRAINT products_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT products_description_nonempty CHECK (btrim(description) <> ''),
  CONSTRAINT products_price_positive CHECK (price > 0 AND price < 100000000.00),
  CONSTRAINT products_currency_mxn CHECK (currency = 'MXN'),
  CONSTRAINT products_image_https CHECK (image_url ~ '^https://[^[:space:]@?#]+$'),
  CONSTRAINT products_review_required CHECK (NOT is_published OR reviewed_at IS NOT NULL)
);

CREATE INDEX products_category_published_idx
  ON catalog.products(category_id, id) WHERE is_published;
CREATE INDEX products_brand_idx ON catalog.products(brand_id);

REVOKE ALL ON SCHEMA catalog FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA catalog FROM PUBLIC;

-- Runtime access must be granted separately to an approved read-only Neon role.
-- No rows are inserted by this migration. No automatic startup migration exists.
COMMIT;
