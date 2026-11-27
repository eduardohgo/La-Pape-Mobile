import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../db/catalog-review.json', import.meta.url), 'utf8'));
const sql = readFileSync(new URL('../db/migrations/002_demo_previews.sql', import.meta.url), 'utf8');
const query = readFileSync(new URL('../db/queries/demo-products.sql', import.meta.url), 'utf8');
const detailQuery = readFileSync(new URL('../db/queries/demo-product-detail.sql', import.meta.url), 'utf8');

test('prepared demonstration migration contains the exact ten legacy ZIP identities and decimal prices', () => {
  assert.equal(manifest.source.archive, '10 (1).zip');
  assert.equal(manifest.source.candidateCount, 10);
  assert.equal(manifest.source.excludedSyntheticProducts, 200);
  assert.equal(manifest.products.length, 10);
  const sourceIds = new Set();
  const skus = new Set();
  for (const product of manifest.products) {
    assert.equal(product.review.approved, false);
    assert.equal(product.catalog.imageUrl, null);
    assert.ok(!sourceIds.has(product.id));
    assert.ok(!skus.has(product.sku));
    sourceIds.add(product.id);
    skus.add(product.sku);
    const entry = `('${product.id}'::uuid, '${product.sku}', '${product.catalog.name}', '${product.catalog.categoryId}'::uuid,`;
    assert.ok(sql.includes(entry), `missing source identity: ${product.sku}`);
    assert.ok(sql.includes(`${product.catalog.price}::numeric(10,2), 'MXN', NULL, TRUE, FALSE)`), 'demo price or restriction missing');
  }
  const inserted = [...sql.matchAll(/\('[0-9a-f-]{36}'::uuid, 'LAP-[A-Z0-9-]+'/g)];
  assert.equal(inserted.length, 10);
});

test('demo migration is isolated, gated and does not publish commercial catalog products', () => {
  // The DO blocks must be valid PL/pgSQL with a statement terminator before the closing dollar quote.
  assert.match(sql, /DO \$demo_guard\$[\s\S]*?END;\s*\$demo_guard\$;/);
  assert.match(sql, /DO \$demo_validate\$[\s\S]*?END;\s*\$demo_validate\$;/);
  assert.match(sql, /CREATE SCHEMA demo;/);
  assert.match(sql, /CREATE TABLE demo\.product_previews/);
  assert.match(sql, /is_demo boolean NOT NULL DEFAULT true CHECK \(is_demo = true\)/);
  assert.match(sql, /is_for_sale boolean NOT NULL DEFAULT false CHECK \(is_for_sale = false\)/);
  assert.match(sql, /GRANT SELECT ON demo\.product_previews TO lapape_catalog_reader;/);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+catalog\.products\b/i);
  assert.doesNotMatch(sql, /CREATE\s+TABLE\s+catalog\./i);
  assert.match(query, /FROM demo\.product_previews/);
  assert.match(query, /WHERE is_demo = true/);
  assert.match(query, /AND is_for_sale = false/);
  assert.doesNotMatch(query, /JOIN\s+catalog\./i);
});


test('demo detail SQL selects only one safe read-only demo product by UUID', () => {
  assert.match(detailQuery, /SELECT[\s\S]*FROM demo\.product_previews/);
  assert.match(detailQuery, /WHERE id = \$1::uuid/);
  assert.match(detailQuery, /AND is_demo = true/);
  assert.match(detailQuery, /AND is_for_sale = false/);
  assert.match(detailQuery, /LIMIT 1/);
  assert.doesNotMatch(detailQuery, /JOIN\s+catalog\.|\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
});
