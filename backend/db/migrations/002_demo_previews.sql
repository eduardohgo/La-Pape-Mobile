-- PREPARED ONLY; DO NOT RUN WITHOUT SEPARATE EXPLICIT USER APPROVAL.
-- La Pape Mobile: independent developer-only demonstration dataset.
-- Source: "10 (1).zip" / 10/02_Base_Datos/Respaldo_BD_LaPape_Sin_Datos_Sensibles.sql
-- Source SQL SHA256: b03c2111ad3245c9cfee7f823cd770c6ce14d7e76883fc2e518d345674eb908f
-- Target: project twilight-moon-02635569, branch development, DB lapape_mobile_dev.
-- This migration DOES NOT alter catalog.* or migration 001.
-- 10 chosen legacy candidate products; 200 synthetic + 2 junk are excluded.
-- Prices are DEMONSTRATION ONLY; brand/photo/inventory/commercial approval absent.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $demo_guard$
BEGIN
  IF current_database() <> 'lapape_mobile_dev' THEN
    RAISE EXCEPTION 'Wrong destination database';
  END IF;
  IF current_setting('server_version_num')::integer NOT BETWEEN 180000 AND 189999 THEN
    RAISE EXCEPTION 'PostgreSQL 18 required';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'demo') THEN
    RAISE EXCEPTION 'demo schema already exists; do not rerun or overwrite';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'catalog') THEN
    RAISE EXCEPTION 'Migration 001 must exist first';
  END IF;
  IF EXISTS (SELECT 1 FROM catalog.products) THEN
    RAISE EXCEPTION 'Catalog contains records: verify production separation first';
  END IF;
END;
$demo_guard$;

CREATE SCHEMA demo;
COMMENT ON SCHEMA demo IS 'DEVELOPMENT ONLY: ten unverified example products from historical La Pape ZIP; never sell or publish as commercial catalog';

CREATE TABLE demo.product_previews (
  id uuid PRIMARY KEY,
  source_sku varchar(60) COLLATE "C" NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  category_id uuid NOT NULL,
  category_name varchar(120) NOT NULL,
  price numeric(10,2) NOT NULL CHECK (price > 0),
  currency char(3) NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  image_url text DEFAULT NULL CHECK (image_url IS NULL),
  is_demo boolean NOT NULL DEFAULT true CHECK (is_demo = true),
  is_for_sale boolean NOT NULL DEFAULT false CHECK (is_for_sale = false),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT demo_sku_canonical CHECK (source_sku ~ '^LAP-[A-Z0-9._-]+$'),
  CONSTRAINT demo_name_nonempty CHECK (btrim(name) <> ''),
  CONSTRAINT demo_category_nonempty CHECK (btrim(category_name) <> '')
);
COMMENT ON TABLE demo.product_previews IS 'Unverified legacy ZIP candidates. Source may be visible only behind explicit development-only demo API; separate from catalog.products';

INSERT INTO demo.product_previews (
  id, source_sku, name, category_id, category_name, price, currency, image_url, is_demo, is_for_sale
) VALUES
  ('8eab1681-b5c6-46d2-9850-60847744982f'::uuid, 'LAP-CAR-030', 'Cartulina iris surtida', '45c6147f-f513-42f9-bc39-cd54c45095c4'::uuid, 'Arte', 18.50::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('709f77eb-bcc7-47ac-8206-e5073c4a8c3d'::uuid, 'LAP-COL-011', 'Colores de madera 24 piezas', '45c6147f-f513-42f9-bc39-cd54c45095c4'::uuid, 'Arte', 94.00::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('e9096108-10c1-4483-9a3c-f61283d3c24f'::uuid, 'LAP-CUA-001', 'Cuaderno profesional cuadriculado', '155b7072-240d-459e-a843-fc2ca3502169'::uuid, 'Cuadernos', 89.90::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('1f909359-adf7-4d93-878e-62427f6179a3'::uuid, 'LAP-ENG-040', 'Engrapadora metálica mediana', '7aa5a281-18cf-4401-a705-f764c892fa3a'::uuid, 'Oficina', 119.00::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('cd53aaff-60e8-439f-a36a-50abea1ec3d9'::uuid, 'LAP-FOM-050', 'Foami carta colores surtidos', '45c6147f-f513-42f9-bc39-cd54c45095c4'::uuid, 'Arte', 42.50::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('231bf429-8ac9-4500-aff9-80145d1895c6'::uuid, 'LAP-HOJ-020', 'Paquete hojas blancas carta 500', '7aa5a281-18cf-4401-a705-f764c892fa3a'::uuid, 'Oficina', 129.00::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('b22d9345-4fa9-46f0-9f07-039aa2374b7b'::uuid, 'LAP-MAR-005', 'Marcadores permanentes 5 piezas', '45c6147f-f513-42f9-bc39-cd54c45095c4'::uuid, 'Arte', 75.00::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('e6644bc8-9525-4689-8c64-2fa9af0d5bc1'::uuid, 'LAP-PEG-015', 'Pegamento escolar 125 g', '45c6147f-f513-42f9-bc39-cd54c45095c4'::uuid, 'Arte', 24.90::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('2f2942bf-c6fa-40a0-8c61-f542691af02e'::uuid, 'LAP-PLU-010', 'Plumas gel azules 10 piezas', '7aa5a281-18cf-4401-a705-f764c892fa3a'::uuid, 'Oficina', 68.50::numeric(10,2), 'MXN', NULL, TRUE, FALSE),
  ('82d42caf-646e-4db5-a3f0-071bcf55564a'::uuid, 'LAP-TIN-060', 'Tinta para sellos azul 30 ml', '7aa5a281-18cf-4401-a705-f764c892fa3a'::uuid, 'Oficina', 54.00::numeric(10,2), 'MXN', NULL, TRUE, FALSE);

REVOKE ALL ON SCHEMA demo FROM PUBLIC;
REVOKE ALL ON TABLE demo.product_previews FROM PUBLIC;
-- Grant read-only visibility to the existing dedicated reader role.
-- Do NOT grant credentials or privileged access to React Native.
GRANT USAGE ON SCHEMA demo TO lapape_catalog_reader;
GRANT SELECT ON demo.product_previews TO lapape_catalog_reader;

DO $demo_validate$
BEGIN
  IF (SELECT count(*) FROM demo.product_previews) <> 10 OR
     (SELECT count(*) FROM catalog.products) <> 0 OR
     (SELECT count(*) FROM demo.product_previews WHERE NOT is_demo OR is_for_sale OR image_url IS NOT NULL) <> 0 THEN
    RAISE EXCEPTION 'Demo import postflight failed';
  END IF;
END;
$demo_validate$;
COMMIT;
