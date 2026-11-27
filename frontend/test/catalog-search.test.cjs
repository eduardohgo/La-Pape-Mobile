const assert = require('node:assert/strict');
const test = require('node:test');
const { filterCatalogProducts } = require('../.test-build/utils/busqueda-catalogo.js');
const { CATALOG_PAGE_SIZE, paginateCatalogProducts } = require('../.test-build/features/catalogo/presentacion/paginacion.js');

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

// Synthetic UUID/SKU rows only for pagination tests; not commercial inventory.
const pagedProducts = Object.freeze(Array.from({ length: 109 }, (_, index) => Object.freeze({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  name: `Cuaderno de prueba ${index + 1}`,
  sku: `TEST-PAG-${String(index + 1).padStart(3, '0')}`,
  category_id: index % 2 === 0 ? 'category-notebooks' : 'category-art',
  category_name: index % 2 === 0 ? 'Cuadernos' : 'Arte',
  price: '59.00', currency: 'MXN', image_url: null,
})));

test('pagination: first page contains exactly ten products and has no previous page', () => {
  const page = paginateCatalogProducts(pagedProducts, 1);
  assert.equal(CATALOG_PAGE_SIZE, 10);
  assert.deepEqual(page.items, pagedProducts.slice(0, 10));
  assert.equal(page.page, 1);
  assert.equal(page.totalPages, 11);
  assert.equal(page.totalItems, 109);
  assert.equal(page.firstItem, 1);
  assert.equal(page.lastItem, 10);
  assert.equal(page.hasPrevious, false);
  assert.equal(page.hasNext, true);
});

test('pagination: next and previous pages preserve API order without overlap', () => {
  const first = paginateCatalogProducts(pagedProducts, 1);
  const second = paginateCatalogProducts(pagedProducts, first.page + 1);
  assert.deepEqual(second.items.map(p => p.id), pagedProducts.slice(10, 20).map(p => p.id));
  assert.equal(second.firstItem, 11);
  assert.equal(second.lastItem, 20);
  assert.equal(second.hasPrevious, true);
  assert.equal(second.hasNext, true);
  assert.equal(second.items.some(p => first.items.some(previous => previous.id === p.id)), false);
  assert.deepEqual(paginateCatalogProducts(pagedProducts, second.page - 1).items, first.items);
});

test('pagination: last partial page contains nine real rows and blocks advancing', () => {
  const last = paginateCatalogProducts(pagedProducts, 11);
  assert.equal(last.items.length, 9);
  assert.deepEqual(last.items, pagedProducts.slice(100));
  assert.equal(last.firstItem, 101);
  assert.equal(last.lastItem, 109);
  assert.equal(last.hasNext, false);
  assert.equal(last.hasPrevious, true);
  assert.deepEqual(paginateCatalogProducts(pagedProducts, 12), last);
});

test('pagination: exact multiples and a single product never create an empty extra page', () => {
  const ten = paginateCatalogProducts(pagedProducts.slice(0, 10), 2);
  assert.equal(ten.page, 1);
  assert.equal(ten.totalPages, 1);
  assert.equal(ten.items.length, 10);
  assert.equal(ten.hasNext, false);
  assert.equal(paginateCatalogProducts(pagedProducts.slice(0, 20), 3).page, 2);
  const one = paginateCatalogProducts(pagedProducts.slice(0, 1), 1);
  assert.equal(one.items.length, 1);
  assert.equal(one.hasPrevious, false);
  assert.equal(one.hasNext, false);
});

test('pagination: empty results expose no phantom range or enabled arrows', () => {
  assert.deepEqual(paginateCatalogProducts([], 8), {
    items: [], page: 1, totalPages: 1, totalItems: 0,
    firstItem: 0, lastItem: 0, hasPrevious: false, hasNext: false,
  });
});

test('pagination: invalid or out-of-range page requests remain bounded', () => {
  for (const value of [0, -3, NaN, Infinity, -Infinity]) {
    assert.equal(paginateCatalogProducts(pagedProducts, value).page, 1);
  }
  assert.equal(paginateCatalogProducts(pagedProducts, 2.9).page, 2);
  assert.equal(paginateCatalogProducts(pagedProducts, 999).page, 11);
});

test('pagination: searching and filtering operate on the whole catalog before slicing', () => {
  const search = paginateCatalogProducts(filterCatalogProducts(pagedProducts, 'TEST-PAG-109', 'all'), 1);
  assert.deepEqual(search.items, [pagedProducts[108]]);
  assert.equal(search.totalItems, 1);
  const category = paginateCatalogProducts(filterCatalogProducts(pagedProducts, '', 'category-art'), 2);
  assert.equal(category.totalItems, 54);
  assert.equal(category.totalPages, 6);
  assert.equal(category.items.length, 10);
  assert.ok(category.items.every(p => p.category_id === 'category-art'));
  const shrunk = paginateCatalogProducts(filterCatalogProducts(pagedProducts, 'TEST-PAG-109', 'all'), 11);
  assert.equal(shrunk.page, 1);
  assert.deepEqual(shrunk.items, [pagedProducts[108]]);
});

test('pagination: traversing all pages returns every UUID exactly once', () => {
  const rows = [];
  let current = paginateCatalogProducts(pagedProducts, 1);
  while (true) {
    assert.ok(current.items.length <= 10);
    rows.push(...current.items);
    if (!current.hasNext) break;
    current = paginateCatalogProducts(pagedProducts, current.page + 1);
  }
  assert.equal(rows.length, 109);
  assert.equal(new Set(rows.map(p => p.id)).size, 109);
  assert.deepEqual(rows, pagedProducts);
});

test('pagination: UUID, SKU, MXN prices and null images are preserved without mutation', () => {
  const before = JSON.stringify(pagedProducts);
  const page = paginateCatalogProducts(pagedProducts, 2);
  assert.equal(page.items[0], pagedProducts[10]);
  assert.equal(page.items[0].sku, 'TEST-PAG-011');
  assert.equal(page.items[0].price, '59.00');
  assert.equal(page.items[0].currency, 'MXN');
  assert.equal(page.items[0].image_url, null);
  page.items.pop();
  assert.equal(pagedProducts.length, 109);
  assert.equal(JSON.stringify(pagedProducts), before);
});
