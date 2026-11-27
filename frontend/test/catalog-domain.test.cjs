const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isCategoryResponse, isProductResponse, isCatalogProductDetailResponse,
  isDemoCatalogResponse, isDemoProductDetailResponse,
} = require('../.test-build/services/servicio-catalogo.js');
const { ProductNotFoundError } = require('../.test-build/features/catalogo/dominio/modelos.js');
const { loadCatalog, loadProduct } = require('../.test-build/features/catalogo/dominio/casos-uso.js');

// Synthetic fixtures, never application catalog data.
const ID = 'e9096108-10c1-4483-9a3c-f61283d3c24f';
const category = { id: ID, name: 'Categoría de prueba', description: null };
const product = {
  id: ID, category_id: ID, brand_id: ID, sku: 'TEST-001', name: 'Producto de prueba',
  category_name: category.name, brand_name: 'Marca de prueba', price: '59.00',
  currency: 'MXN', image_url: null,
};
const page = item => ({ data: [item], page: { hasMore: false, nextCursor: null } });
const signal = () => new AbortController().signal;

test('model runtime contracts accept UUID, nullable images and exact decimal text without mutation', () => {
  for (const image_url of [null, 'https://example.invalid/authorized.png']) {
    const item = { ...product, image_url };
    const before = JSON.stringify(item);
    assert.equal(isProductResponse(page(item)), true);
    assert.equal(isCatalogProductDetailResponse({ data: { ...item, description: '' } }), true);
    assert.equal(JSON.stringify(item), before);
  }
  assert.equal(isCategoryResponse({ data: [category, { ...category, description: 'Descripción' }] }), true);
});

test('model runtime contracts reject malformed envelopes and category fields', () => {
  for (const value of [null, [], {}, { data: null }, { data: [null] }]) {
    assert.equal(isCategoryResponse(value), false);
    assert.equal(isProductResponse(value), false);
  }
  for (const mutation of [{ id: 'invalid' }, { id: 1 }, { name: '' }, { name: '  ' }, { description: 12 }]) {
    assert.equal(isCategoryResponse({ data: [{ ...category, ...mutation }] }), false, JSON.stringify(mutation));
  }
});

test('commercial product guards exercise every required field failure branch', () => {
  const mutations = [
    { id: 'not-uuid' }, { id: 12 }, { category_id: 'invalid' }, { category_id: null },
    { brand_id: 'invalid' }, { brand_id: 12 }, { sku: '' }, { sku: null },
    { name: '  ' }, { category_name: '' }, { brand_name: '' }, { price: 59 },
    { price: '-1.00' }, { price: '1.0' }, { price: '01.00' }, { price: '100000000.00' },
    { currency: 'USD' }, { image_url: 42 }, { image_url: 'http://example.invalid/photo.png' },
  ];
  for (const mutation of mutations) assert.equal(isProductResponse(page({ ...product, ...mutation })), false, JSON.stringify(mutation));
  for (const key of Object.keys(product)) {
    const missing = { ...product }; delete missing[key];
    assert.equal(isProductResponse(page(missing)), false, key);
  }
});

test('pagination model distinguishes final pages, continuing pages and invalid cursors', () => {
  assert.equal(isProductResponse({ data: [], page: { hasMore: false, nextCursor: null } }), true);
  assert.equal(isProductResponse({ data: [product], page: { hasMore: true, nextCursor: ID } }), true);
  for (const pagination of [null, {}, { hasMore: 1, nextCursor: null },
    { hasMore: true, nextCursor: null }, { hasMore: true, nextCursor: 'invalid' },
    { hasMore: false, nextCursor: ID }]) {
    assert.equal(isProductResponse({ data: [product], page: pagination }), false);
  }
});

test('detail model requires a string description and all base product fields', () => {
  for (const value of [null, {}, { data: null }, { data: product },
    { data: { ...product, description: 42 } }, { data: { ...product, description: 'Texto', sku: '' } }]) {
    assert.equal(isCatalogProductDetailResponse(value), false);
  }
  assert.equal(isCatalogProductDetailResponse({ data: { ...product, description: 'Texto' } }), true);
});

test('demo model guards reject each altered safety flag and missing presentation field', () => {
  const demo = { ...product, is_demo: true, is_for_sale: false };
  const envelope = item => ({ mode: 'demo', purchasable: false, data: [item] });
  assert.equal(isDemoCatalogResponse(envelope(demo)), true);
  for (const mutation of [{ id: 1 }, { id: 'bad' }, { category_id: null }, { category_id: 'bad' },
    { sku: '' }, { name: '' }, { category_name: '' }, { price: 1 }, { price: 'bad' },
    { currency: 'USD' }, { image_url: 'https://example.invalid/photo.png' },
    { is_demo: false }, { is_for_sale: true }]) {
    assert.equal(isDemoCatalogResponse(envelope({ ...demo, ...mutation })), false, JSON.stringify(mutation));
  }
  for (const invalid of [null, {}, { ...envelope(demo), mode: 'commercial' },
    { ...envelope(demo), purchasable: true }, { ...envelope(demo), data: null },
    { ...envelope(demo), data: Array(21).fill(demo) }]) assert.equal(isDemoCatalogResponse(invalid), false);
  assert.equal(isDemoProductDetailResponse({ mode: 'demo', purchasable: false, data: demo }), true);
  for (const invalid of [null, {}, { data: null }, { mode: 'demo', purchasable: true, data: demo }]) {
    assert.equal(isDemoProductDetailResponse(invalid), false);
  }
});

test('domain error retains Error identity and a generic message without attaching input', () => {
  const error = new ProductNotFoundError();
  assert.ok(error instanceof Error);
  assert.equal(error.name, 'ProductNotFoundError');
  assert.equal(error.message, 'Producto no encontrado');
  assert.equal(error.cause, undefined);
});

test('loadCatalog accepts empty data and propagates the original repository failure', async () => {
  assert.deepEqual(await loadCatalog({ list: async () => ({ products: [], categories: [] }) }, signal()), { products: [], categories: [] });
  const failure = new Error('simulated');
  await assert.rejects(loadCatalog({ list: async () => { throw failure; } }, signal()), error => error === failure);
});

test('loadProduct forwards the UUID and signal and freezes a copy without mutating repository data', async () => {
  const original = { ...product, description: 'Texto' }; const current = signal();
  const result = await loadProduct({ detail: async (id, passedSignal) => {
    assert.equal(id, ID); assert.equal(passedSignal, current); return original;
  } }, ID, current);
  assert.deepEqual(result.product, original);
  assert.notEqual(result.product, original);
  assert.equal(Object.isFrozen(result.product), true);
  assert.equal(Object.isFrozen(original), false);
  original.name = 'Changed fixture';
  assert.equal(result.product.name, product.name);
});

test('loadProduct propagates both domain not-found and unrelated repository errors unchanged', async () => {
  for (const failure of [new ProductNotFoundError(), new Error('simulated')]) {
    await assert.rejects(loadProduct({ detail: async () => { throw failure; } }, ID, signal()), error => error === failure);
  }
});
