import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REVIEW_PATH = fileURLToPath(new URL('../db/catalog-review.json', import.meta.url));
export const SOURCE_SQL_SHA256 = 'b03c2111ad3245c9cfee7f823cd770c6ce14d7e76883fc2e518d345674eb908f';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PRICE = /^(?:0|[1-9][0-9]{0,7})\.[0-9]{2}$/;
// Recognize audited fixture markers, not legitimate materials such as synthetic paper.
const SYNTHETIC = /\[SINT[EÉ]TICO_ECBD\]|SYN-ECBD-|synthetic_batch_id/i;
const SOURCE_SKUS = new Map([
  ['e9096108-10c1-4483-9a3c-f61283d3c24f', 'LAP-CUA-001'],
  ['b22d9345-4fa9-46f0-9f07-039aa2374b7b', 'LAP-MAR-005'],
  ['231bf429-8ac9-4500-aff9-80145d1895c6', 'LAP-HOJ-020'],
  ['e6644bc8-9525-4689-8c64-2fa9af0d5bc1', 'LAP-PEG-015'],
  ['2f2942bf-c6fa-40a0-8c61-f542691af02e', 'LAP-PLU-010'],
  ['709f77eb-bcc7-47ac-8206-e5073c4a8c3d', 'LAP-COL-011'],
  ['8eab1681-b5c6-46d2-9850-60847744982f', 'LAP-CAR-030'],
  ['1f909359-adf7-4d93-878e-62427f6179a3', 'LAP-ENG-040'],
  ['cd53aaff-60e8-439f-a36a-50abea1ec3d9', 'LAP-FOM-050'],
  ['82d42caf-646e-4db5-a3f0-071bcf55564a', 'LAP-TIN-060'],
]);
const CATEGORY_IDS = new Set([
  '155b7072-240d-459e-a843-fc2ca3502169',
  '45c6147f-f513-42f9-bc39-cd54c45095c4',
  '7aa5a281-18cf-4401-a705-f764c892fa3a',
]);
const BRAND_IDS = new Set([
  'de3f0474-45fa-4bf8-bb53-7c47227eeb9d',
  '1a91f9f3-7c48-43dc-8f05-bed503985c0d',
  '0a22b840-80cc-4f7c-8615-36d6a7de15ef',
  '55f050f2-f0a2-4e0b-b1cf-7ae5fc72797b',
  'd4725249-798a-4a36-ae55-6620f3071d0a',
  '0e533000-7779-4e5f-8c35-281d45b9c2f5',
]);
const FLAGS = ['price', 'brand', 'image', 'category', 'content'];
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;
const SYNTHETIC_SKU = /^(?:SYN-|SYNTHETIC|SINTETICO)/;
const IMAGE_URL = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:\/[^\s@?#\\]*)?$/;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(object, keys, label) {
  requireCondition(object && typeof object === 'object' && !Array.isArray(object), `${label}: expected an object`);
  const actual = Object.keys(object);
  requireCondition(actual.length === keys.length && actual.every((key) => keys.includes(key)), `${label}: unexpected or missing fields`);
}

function text(value, maximum, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  requireCondition(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !value.includes('\0'), `${label}: invalid text`);
  requireCondition(!SYNTHETIC.test(value), `${label}: synthetic data is forbidden`);
}

function validImage(value) {
  if (typeof value !== 'string' || !IMAGE_URL.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash && !/\s/.test(value);
  } catch {
    return false;
  }
}

// General catalog rule. The initial source import additionally requires its exact
// UUID/SKU allowlist; a valid future SKU must never bypass that source review.
export function validateSku(value) {
  return typeof value === 'string' && SKU.test(value) && !SYNTHETIC_SKU.test(value);
}

function references(items, expectedIds, label, keys) {
  requireCondition(Array.isArray(items) && items.length === expectedIds.size, `${label}: unexpected count`);
  const ids = new Set();
  const names = new Set();
  for (const item of items) {
    exactKeys(item, keys, label);
    requireCondition(UUID.test(item.id) && expectedIds.has(item.id) && !ids.has(item.id), `${label}: invalid, unexpected or duplicate UUID`);
    text(item.name, 120, `${label}.name`);
    requireCondition(!names.has(item.name), `${label}: duplicate name`);
    if ('description' in item) text(item.description, 1000, `${label}.description`, { nullable: true });
    ids.add(item.id);
    names.add(item.name);
  }
  return ids;
}

export async function readCatalogReview(path = DEFAULT_REVIEW_PATH) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export function validateCatalogReview(manifest) {
  exactKeys(manifest, ['formatVersion', 'target', 'source', 'categories', 'brands', 'products'], 'manifest');
  requireCondition(manifest.formatVersion === 2, 'Unsupported manifest version');
  exactKeys(manifest.target, ['projectId', 'branch', 'database', 'postgresqlMajor'], 'target');
  requireCondition(manifest.target.projectId === 'twilight-moon-02635569'
    && manifest.target.branch === 'development'
    && manifest.target.database === 'lapape_mobile_dev'
    && manifest.target.postgresqlMajor === 18, 'Unexpected target');
  exactKeys(manifest.source, ['archive', 'sqlEntry', 'sqlSha256', 'candidateCount', 'excludedSyntheticProducts', 'excludedOtherProducts', 'inventoryImported', 'personalDataImported'], 'source');
  requireCondition(manifest.source.archive === '10 (1).zip'
    && manifest.source.sqlEntry === '10/02_Base_Datos/Respaldo_BD_LaPape_Sin_Datos_Sensibles.sql'
    && manifest.source.sqlSha256 === SOURCE_SQL_SHA256
    && manifest.source.candidateCount === 10
    && manifest.source.excludedSyntheticProducts === 200
    && manifest.source.excludedOtherProducts === 2
    && manifest.source.inventoryImported === false
    && manifest.source.personalDataImported === false, 'Unexpected source provenance or exclusions');
  const categories = references(manifest.categories, CATEGORY_IDS, 'categories', ['id', 'name', 'description']);
  const brands = references(manifest.brands, BRAND_IDS, 'brands', ['id', 'name']);
  requireCondition(Array.isArray(manifest.products) && manifest.products.length === SOURCE_SKUS.size, 'Exactly ten reviewed candidates are required');
  const productIds = new Set();
  const approved = [];
  for (const product of manifest.products) {
    exactKeys(product, ['id', 'sku', 'source', 'catalog', 'review', 'notes'], 'product');
    requireCondition(validateSku(product.sku), 'Product SKU is invalid or synthetic');
    requireCondition(UUID.test(product.id) && SOURCE_SKUS.get(product.id) === product.sku && !productIds.has(product.id), 'Product outside candidate allowlist or duplicate');
    productIds.add(product.id);
    exactKeys(product.source, ['name', 'description', 'categoryId', 'brandId', 'price', 'imageUrl', 'sqlLine'], 'product.source');
    exactKeys(product.catalog, ['name', 'description', 'categoryId', 'brandId', 'price', 'currency', 'imageUrl'], 'product.catalog');
    for (const projection of [product.source, product.catalog]) {
      text(projection.name, 160, 'product.name');
      text(projection.description, 4000, 'product.description');
      requireCondition(categories.has(projection.categoryId) && brands.has(projection.brandId), 'Product contains a broken category or brand reference');
      requireCondition(typeof projection.price === 'string' && PRICE.test(projection.price) && projection.price !== '0.00', 'Price must be a positive numeric(10,2) decimal string');
    }
    requireCondition(typeof product.source.imageUrl === 'string' && product.source.imageUrl.length <= 2048 && !product.source.imageUrl.includes('\0'), 'Invalid source image reference');
    requireCondition(Number.isSafeInteger(product.source.sqlLine) && product.source.sqlLine > 0, 'Invalid source SQL line');
    requireCondition(product.catalog.currency === 'MXN', 'Only reviewed MXN prices are supported');
    requireCondition(product.catalog.imageUrl === null || (typeof product.catalog.imageUrl === 'string' && product.catalog.imageUrl.length <= 2048 && validImage(product.catalog.imageUrl)), 'Catalog image must be null, or HTTPS without credentials, query parameters or fragments');
    requireCondition(Array.isArray(product.notes), 'Review notes must be an array');
    for (const note of product.notes) text(note, 1000, 'product.notes');
    exactKeys(product.review, ['approved', ...FLAGS, 'imagePendingAccepted', 'reviewedBy', 'reviewedAt'], 'product.review');
    requireCondition(typeof product.review.approved === 'boolean'
      && typeof product.review.imagePendingAccepted === 'boolean'
      && FLAGS.every((flag) => typeof product.review[flag] === 'boolean'), 'Review decisions must be explicit booleans');
    // image=true resolves the review decision. It does not itself assert that a
    // photograph exists. Missing photographs require a separate explicit choice.
    if (product.review.imagePendingAccepted) {
      requireCondition(product.catalog.imageUrl === null && product.review.image, 'Accepting a pending image requires null imageUrl and an explicit image review');
    }
    if (product.catalog.imageUrl === null && product.review.image) {
      requireCondition(product.review.imagePendingAccepted, 'Missing image requires explicit imagePendingAccepted approval');
    }
    if (product.review.approved) {
      requireCondition(FLAGS.every((flag) => product.review[flag]), 'Approved product has outstanding review criteria');
      requireCondition(typeof product.review.reviewedBy === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(product.review.reviewedBy), 'Approved product requires a reviewer handle');
      const date = new Date(product.review.reviewedAt);
      requireCondition(typeof product.review.reviewedAt === 'string' && Number.isFinite(date.getTime()) && date.toISOString() === product.review.reviewedAt, 'Approved product requires an explicit canonical UTC review timestamp');
      requireCondition(product.catalog.imageUrl !== null || product.review.imagePendingAccepted, 'Approved product without image requires explicit absence acceptance');
      approved.push(product);
    } else {
      requireCondition(product.review.reviewedBy === null && product.review.reviewedAt === null, 'Pending products must not imply final approval metadata');
    }
  }
  return {
    candidateCount: manifest.products.length,
    approvedCount: approved.length,
    pendingCount: manifest.products.length - approved.length,
    pendingPhotoCount: manifest.products.filter((product) => product.catalog.imageUrl === null).length,
    approvedWithoutPhotoCount: approved.filter((product) => product.catalog.imageUrl === null).length,
    categoryCount: categories.size,
    brandCount: brands.size,
    excludedSyntheticProducts: 200,
    inventoryImported: false,
    personalDataImported: false,
    approvedProducts: approved,
  };
}

export function sqlLiteral(value) {
  if (value === null) return 'NULL';
  requireCondition(typeof value === 'string' && !value.includes('\0'), 'SQL literals require strings without null bytes');
  return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

export function generateApprovedCatalogSql(manifest) {
  const result = validateCatalogReview(manifest);
  requireCondition(result.approvedCount > 0, 'No approved products: SQL import generation is blocked');
  const products = [...result.approvedProducts].sort((a, b) => a.sku.localeCompare(b.sku, 'en'));
  const categoryIds = new Set(products.map((product) => product.catalog.categoryId));
  const brandIds = new Set(products.map((product) => product.catalog.brandId));
  const categories = manifest.categories.filter((category) => categoryIds.has(category.id)).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const brands = manifest.brands.filter((brand) => brandIds.has(brand.id)).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const statements = [
    '-- Generated offline from explicitly approved catalog-review.json records.',
    '-- This file requires human SQL review and separate authorization before execution.',
    '-- Target Neon project twilight-moon-02635569, branch development.',
    `-- Source SQL SHA256 ${SOURCE_SQL_SHA256}`,
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '30s';",
    'SET LOCAL standard_conforming_strings = on;',
    'DO $guard$',
    'BEGIN',
    "  IF current_database() <> 'lapape_mobile_dev' THEN RAISE EXCEPTION 'Wrong database'; END IF;",
    "  IF current_setting('server_version_num')::integer < 180000 OR current_setting('server_version_num')::integer >= 190000 THEN RAISE EXCEPTION 'PostgreSQL 18 required'; END IF;",
    "  IF obj_description('catalog'::regnamespace, 'pg_namespace') IS DISTINCT FROM 'La Pape reviewed catalog projection, migration 001; source SQL SHA256 b03c2111ad3245c9cfee7f823cd770c6ce14d7e76883fc2e518d345674eb908f' THEN RAISE EXCEPTION 'Migration 001 marker missing'; END IF;",
    'END',
    '$guard$;',
    'LOCK TABLE catalog.categories, catalog.brands, catalog.products IN ACCESS EXCLUSIVE MODE;',
    'DO $empty_guard$',
    'BEGIN',
    '  IF EXISTS (SELECT 1 FROM catalog.products) OR EXISTS (SELECT 1 FROM catalog.categories) OR EXISTS (SELECT 1 FROM catalog.brands) THEN',
    "    RAISE EXCEPTION 'Initial approved catalog import requires empty catalog tables';",
    '  END IF;',
    'END',
    '$empty_guard$;',
  ];
  for (const category of categories) {
    statements.push(`INSERT INTO catalog.categories (id, name, description, is_active) VALUES (${sqlLiteral(category.id)}::uuid, ${sqlLiteral(category.name)}, ${sqlLiteral(category.description)}, true);`);
  }
  for (const brand of brands) {
    statements.push(`INSERT INTO catalog.brands (id, name) VALUES (${sqlLiteral(brand.id)}::uuid, ${sqlLiteral(brand.name)});`);
  }
  for (const product of products) {
    const data = product.catalog;
    const values = [
      `${sqlLiteral(product.id)}::uuid`, sqlLiteral(product.sku), sqlLiteral(data.name), sqlLiteral(data.description),
      `${sqlLiteral(data.categoryId)}::uuid`, `${sqlLiteral(data.brandId)}::uuid`, `${sqlLiteral(data.price)}::numeric(10,2)`,
      sqlLiteral(data.currency), sqlLiteral(data.imageUrl), 'true', `${sqlLiteral(product.review.reviewedAt)}::timestamptz`,
    ];
    statements.push(`INSERT INTO catalog.products (id, sku, name, description, category_id, brand_id, price, currency, image_url, is_published, reviewed_at) VALUES (${values.join(', ')});`);
  }
  statements.push('COMMIT;', '');
  return statements.join('\n');
}
