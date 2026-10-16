const assert = require('node:assert/strict');
const test = require('node:test');
const { filterCatalogProducts } = require('../.test-build/utils/busqueda-catalogo.js');

// Minimal fixtures for search behavior only; never used as application catalog data.
const products = Object.freeze([
  Object.freeze({ name: 'Cuadérno escolar', category_name: 'Cuadernos', sku: 'TEST-CUA-01', category_id: 'category-notebooks', marker: 'first' }),
  Object.freeze({ name: 'Lápices de dibujo', category_name: 'Arte', sku: 'TEST-ART-02', category_id: 'category-art', marker: 'second' }),
  Object.freeze({ name: 'Regla [A-Z] + pequeña', category_name: 'Oficina', sku: 'TEST-OFC-03', category_id: 'category-office', marker: 'third' }),
]);

test('empty or whitespace-only search returns the selected category in API order', () => {
  assert.deepEqual(filterCatalogProducts(products, '', 'all'), products);
  assert.deepEqual(filterCatalogProducts(products, ' \n\t ', 'category-art'), [products[1]]);
  assert.deepEqual(filterCatalogProducts(products, '', 'unknown-category'), []);
});

test('search matches name, category and SKU independently without case or accent sensitivity', () => {
  assert.deepEqual(filterCatalogProducts(products, 'CUADERNO', 'all'), [products[0]]);
  assert.deepEqual(filterCatalogProducts(products, 'ARTE', 'all'), [products[1]]);
  assert.deepEqual(filterCatalogProducts(products, 'test-ofc-03', 'all'), [products[2]]);
  assert.deepEqual(filterCatalogProducts(products, 'pequena', 'all'), [products[2]]);
  assert.deepEqual(filterCatalogProducts(products, 'LÁPICES', 'all'), [products[1]]);
});

test('search normalizes decomposed accents and repeated whitespace', () => {
  assert.deepEqual(filterCatalogProducts(products, '  la\u0301pices\t\n dibujo  ', 'all'), [products[1]]);
  const spaced = [{ ...products[0], name: 'Cuaderno   escolar' }];
  assert.deepEqual(filterCatalogProducts(spaced, 'CUADERNO escolar', 'all'), spaced);
});

test('every query term must match, allowing terms across different searchable fields', () => {
  assert.deepEqual(filterCatalogProducts(products, 'dibujo arte ART-02', 'all'), [products[1]]);
  assert.deepEqual(filterCatalogProducts(products, 'dibujo oficina', 'all'), []);
  assert.deepEqual(filterCatalogProducts(products, 'cuaderno inexistente', 'all'), []);
});

test('category selection and search combine with AND instead of expanding results', () => {
  assert.deepEqual(filterCatalogProducts(products, 'test', 'category-office'), [products[2]]);
  assert.deepEqual(filterCatalogProducts(products, 'lapices', 'category-office'), []);
  assert.deepEqual(filterCatalogProducts(products, 'lapices', 'category-art'), [products[1]]);
});

test('user punctuation is literal and never interpreted as a regular expression', () => {
  assert.deepEqual(filterCatalogProducts(products, '[A-Z] +', 'all'), [products[2]]);
  assert.deepEqual(filterCatalogProducts(products, '[', 'all'), [products[2]]);
  assert.deepEqual(filterCatalogProducts(products, '.*', 'all'), []);
  assert.deepEqual(filterCatalogProducts(products, '(', 'all'), []);
  assert.deepEqual(filterCatalogProducts(products, 'a|cuaderno', 'all'), []);
});

test('filtering never alters API rows, preserves references and returns a separate array', () => {
  const snapshot = JSON.stringify(products);
  const all = filterCatalogProducts(products, '', 'all');
  const selected = filterCatalogProducts(products, 'lapices', 'all');
  assert.notEqual(all, products);
  assert.equal(selected[0], products[1]);
  assert.equal(selected[0].marker, 'second');
  all.pop();
  assert.equal(products.length, 3);
  assert.equal(JSON.stringify(products), snapshot);
});

test('empty data and unmatched queries produce empty results without fabricated products', () => {
  assert.deepEqual(filterCatalogProducts([], '', 'all'), []);
  assert.deepEqual(filterCatalogProducts([], 'cuaderno', 'category-notebooks'), []);
  assert.deepEqual(filterCatalogProducts(products, 'unknown-item', 'all'), []);
});

test('the all-category key only affects selection and is not a magic search query', () => {
  assert.deepEqual(filterCatalogProducts(products, 'all', 'all'), []);
  assert.deepEqual(filterCatalogProducts(products, '', 'CATEGORY-ART'), []);
});
