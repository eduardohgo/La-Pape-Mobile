import assert from 'node:assert/strict';
import test from 'node:test';
import { generateApprovedCatalogSql, readCatalogReview, sqlLiteral, validateCatalogReview, validateSku } from '../scripts/catalog-review.js';

const original = await readCatalogReview();
const fresh = () => structuredClone(original);

function approveOne(manifest, sku = 'LAP-CUA-001') {
  const product = manifest.products.find((candidate) => candidate.sku === sku);
  product.catalog.imageUrl = 'https://assets.example.invalid/review-fixture.jpg';
  product.review = {
    approved: true, price: true, brand: true, image: true, category: true, content: true,
    imagePendingAccepted: false,
    reviewedBy: 'review-fixture', reviewedAt: '2026-10-12T12:00:00.000Z',
  };
  return product;
}

test('actual manifest preserves ten pending UUIDs, three categories and six brands without approval', () => {
  const { approvedProducts, ...summary } = validateCatalogReview(original);
  assert.deepEqual(summary, {
    candidateCount: 10, approvedCount: 0, pendingCount: 10, categoryCount: 3, brandCount: 6,
    pendingPhotoCount: 10, approvedWithoutPhotoCount: 0,
    excludedSyntheticProducts: 200, inventoryImported: false, personalDataImported: false,
  });
  assert.deepEqual(approvedProducts, []);
  assert.ok(original.products.every((product) => product.catalog.imageUrl === null
    && product.review.image === false && product.review.imagePendingAccepted === false));
  assert.ok(original.products.every((product) => typeof product.source.imageUrl === 'string'
    && product.source.imageUrl.length > 0));
});

test('pending catalog cannot generate any import SQL', () => {
  assert.throws(() => generateApprovedCatalogSql(original), /No approved products/);
});

test('an approved record still requires all independent review criteria', () => {
  const manifest = fresh();
  const product = approveOne(manifest);
  product.review.brand = false;
  assert.throws(() => generateApprovedCatalogSql(manifest), /outstanding review criteria/);
});

test('approved records require both reviewer identity and canonical UTC review timestamp', () => {
  for (const [key, invalid] of [['reviewedBy', null], ['reviewedAt', null], ['reviewedAt', '2026-10-12']]) {
    const manifest = fresh();
    approveOne(manifest).review[key] = invalid;
    assert.throws(() => validateCatalogReview(manifest), /requires/);
  }
});

test('local images and credential-bearing URLs cannot be approved', () => {
  for (const url of ['/products/cuaderno.jpg', 'http://assets.example.invalid/x.jpg', 'https://user:password@example.invalid/x.jpg', 'https://example.invalid/x.jpg?token=fixture', 'https://example.invalid/x.jpg#fragment',
    'https:///example.invalid/x.jpg', 'https://example.invalid/x.jpg?', 'https://example.invalid/x.jpg#', 'https://example.invalid:65536/x.jpg', 'https://example.invalid\\x.jpg', 'https://example.invalid/a b.jpg', '']) {
    const manifest = fresh();
    approveOne(manifest).catalog.imageUrl = url;
    assert.throws(() => validateCatalogReview(manifest), /image/);
  }
});

test('a reviewed missing photograph requires a separate explicit absence acceptance', () => {
  const manifest = fresh();
  const product = approveOne(manifest);
  product.catalog.imageUrl = null;
  assert.throws(() => validateCatalogReview(manifest), /imagePendingAccepted/);
  product.review.imagePendingAccepted = true;
  const result = validateCatalogReview(manifest);
  assert.equal(result.approvedCount, 1);
  assert.equal(result.approvedWithoutPhotoCount, 1);
  const sql = generateApprovedCatalogSql(manifest);
  assert.match(sql, /E'MXN', NULL, true, E'2026-10-12T12:00:00\.000Z'::timestamptz/);
  assert.ok(!sql.includes(product.source.imageUrl));
});

test('missing-photo acceptance cannot masquerade as a verified HTTPS photograph or skip image review', () => {
  for (const mutation of [
    (product) => { product.review.imagePendingAccepted = true; },
    (product) => { product.catalog.imageUrl = null; product.review.imagePendingAccepted = true; product.review.image = false; },
  ]) {
    const manifest = fresh();
    mutation(approveOne(manifest));
    assert.throws(() => validateCatalogReview(manifest), /pending image/);
  }
});

test('NULL photograph alone neither approves a pending candidate nor supplies a publication decision', () => {
  const manifest = fresh();
  manifest.products[0].review.image = true;
  assert.throws(() => validateCatalogReview(manifest), /imagePendingAccepted/);
  manifest.products[0].review.imagePendingAccepted = true;
  assert.equal(validateCatalogReview(manifest).approvedCount, 0);
  assert.throws(() => generateApprovedCatalogSql(manifest), /No approved products/);
});

test('general catalog SKU accepts real canonical codes without requiring the LAP pattern', () => {
  for (const sku of ['ABC123', 'SKU-2026', 'AB.CD', 'AB_CD', '0', '9'.repeat(60), 'LAP-CUA-001']) {
    assert.equal(validateSku(sku), true, sku);
  }
  for (const sku of ['', 'aBC123', 'AB CD', 'AB/CD', '_ABC', '-ABC', '.ABC', 'A'.repeat(61), 'ÉBC', 'ABC\n', null,
    'SYN-ECBD-0001', 'SYNTHETIC-001', 'SINTETICO-01']) {
    assert.equal(validateSku(sku), false, String(sku));
  }
});

test('a valid future SKU still cannot replace an allowlisted source import identity', () => {
  const manifest = fresh();
  manifest.products[0].sku = 'ABC123';
  assert.throws(() => validateCatalogReview(manifest), /candidate allowlist/);
});

test('candidate allowlist excludes synthetic SKU, arbitrary UUID, duplicates and missing candidates', () => {
  for (const mutation of [
    (manifest) => { manifest.products[0].sku = 'SYN-ECBD-0001'; },
    (manifest) => { manifest.products[0].id = '00000000-0000-0000-0000-000000000001'; },
    (manifest) => { manifest.products[1] = structuredClone(manifest.products[0]); },
    (manifest) => { manifest.products.pop(); },
  ]) {
    const manifest = fresh();
    mutation(manifest);
    assert.throws(() => validateCatalogReview(manifest), /candidate|duplicate|synthetic/);
  }
});

test('relationships reject both orphaned foreign keys and unexpected reference records', () => {
  for (const mutation of [
    (manifest) => { manifest.products[0].catalog.categoryId = '00000000-0000-0000-0000-000000000001'; },
    (manifest) => { manifest.products[0].source.brandId = '00000000-0000-0000-0000-000000000001'; },
    (manifest) => { manifest.categories[0].id = '00000000-0000-0000-0000-000000000001'; },
    (manifest) => { manifest.brands.pop(); },
  ]) {
    const manifest = fresh();
    mutation(manifest);
    assert.throws(() => validateCatalogReview(manifest), /reference|UUID|count/);
  }
});

test('inventory, personal fields and unknown manifest fields are rejected rather than silently discarded', () => {
  for (const [location, key, value] of [
    ['source', 'stock', '5'], ['source', 'branch_id', 'not-importable'],
    ['catalog', 'email', 'not-importable'], ['review', 'password', 'not-importable'],
  ]) {
    const manifest = fresh();
    manifest.products[0][location][key] = value;
    assert.throws(() => validateCatalogReview(manifest), /unexpected or missing fields/);
  }
});

test('source provenance and explicit inventory exclusion cannot drift silently', () => {
  const manifest = fresh();
  manifest.source.inventoryImported = true;
  assert.throws(() => validateCatalogReview(manifest), /provenance or exclusions/);
  manifest.source.inventoryImported = false;
  manifest.source.sqlSha256 = '0'.repeat(64);
  assert.throws(() => validateCatalogReview(manifest), /provenance or exclusions/);
});

test('decimal prices reject rounding, floating values, negatives, zero, overflow and NaN', () => {
  for (const value of ['89.999', 89.9, '-1.00', '0.00', '100000000.00', 'NaN', 'Infinity', '1e2']) {
    const manifest = fresh();
    manifest.products[0].catalog.price = value;
    assert.throws(() => validateCatalogReview(manifest), /Price/);
  }
});

test('source and proposed descriptions reject synthetic markers', () => {
  const manifest = fresh();
  manifest.products[0].catalog.description = '[SINTETICO_ECBD]';
  assert.throws(() => validateCatalogReview(manifest), /synthetic data/);
});

test('a legitimate synthetic-material description is not confused with a fixture marker', () => {
  const manifest = fresh();
  approveOne(manifest).catalog.description = 'Papel sintético resistente al agua para uso escolar.';
  assert.equal(validateCatalogReview(manifest).approvedCount, 1);
});

test('generated SQL contains only approved products and their exact dependent categories and brands', () => {
  const manifest = fresh();
  const approved = approveOne(manifest);
  const sql = generateApprovedCatalogSql(manifest);
  assert.equal((sql.match(/INSERT INTO catalog.products /g) ?? []).length, 1);
  assert.equal((sql.match(/INSERT INTO catalog.categories /g) ?? []).length, 1);
  assert.equal((sql.match(/INSERT INTO catalog.brands /g) ?? []).length, 1);
  assert.ok(sql.includes(approved.id));
  for (const pending of manifest.products.filter((product) => !product.review.approved)) {
    assert.ok(!sql.includes(pending.id));
  }
  assert.match(sql, /lapape_mobile_dev/);
  assert.match(sql, /PostgreSQL 18 required/);
  assert.match(sql, /^COMMIT;\n$/m);
  assert.ok(!/ON CONFLICT|DROP TABLE|TRUNCATE|catalog\.inventory|catalog\.users/.test(sql));
});

test('generation is deterministic across array reordering and preserves decimal strings', () => {
  const manifest = fresh();
  approveOne(manifest);
  approveOne(manifest, 'LAP-MAR-005');
  const first = generateApprovedCatalogSql(manifest);
  manifest.categories.reverse();
  manifest.brands.reverse();
  manifest.products.reverse();
  assert.equal(generateApprovedCatalogSql(manifest), first);
  assert.match(first, /E'89\.90'::numeric\(10,2\)/);
});

test('SQL escaping preserves apostrophes, backslashes and newline inside string literals', () => {
  assert.equal(sqlLiteral("A'B\\C\nD"), "E'A''B\\\\C\nD'");
  assert.equal(sqlLiteral(null), 'NULL');
  assert.throws(() => sqlLiteral('A\0B'), /null bytes/);
  const manifest = fresh();
  approveOne(manifest).catalog.description = "Texto '); DROP TABLE catalog.products; -- \\ literal";
  const sql = generateApprovedCatalogSql(manifest);
  assert.ok(sql.includes("E'Texto ''); DROP TABLE catalog.products; -- \\\\ literal'"));
});
