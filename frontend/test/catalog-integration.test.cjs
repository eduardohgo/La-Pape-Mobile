const assert = require('node:assert/strict');
const test = require('node:test');
const { createCatalogService } = require('../.test-build/services/servicio-catalogo.js');
const { createHttpCatalogRepository } = require('../.test-build/features/catalogo/datos/repositorio-http.js');
const { createCatalogViewModel, createProductDetailViewModel } = require('../.test-build/features/catalogo/presentacion/viewmodels.js');

const ID = 'e9096108-10c1-4483-9a3c-f61283d3c24f';
const SECOND = '155b7072-240d-459e-a843-fc2ca3502169';
const product = { id: ID, sku: 'TEST-001', name: 'Fixture', category_id: ID,
  category_name: 'Prueba', brand_id: ID, brand_name: 'Prueba', price: '59.00', currency: 'MXN', image_url: null };
const config = { baseUrl: 'https://example.invalid', environment: 'production', timeoutMs: 500 };
const page = (products, nextCursor = null) => Response.json({ data: products, page: { hasMore: nextCursor !== null, nextCursor } });
const build = transport => createHttpCatalogRepository(createCatalogService(config, transport), 'commercial');

test('integration: ViewModel -> use case -> Repository -> HTTP validates paginated products and observer states', async () => {
  const calls = [];
  const repository = build(async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    if (url.endsWith('/categories')) return Response.json({ data: [{ id: ID, name: 'Prueba', description: null }] });
    if (url.endsWith('/products?limit=50')) return page([product], ID);
    assert.ok(url.endsWith('/products?limit=50&after=' + ID));
    return page([{ ...product, id: SECOND, sku: 'TEST-002' }]);
  });
  const model = createCatalogViewModel(() => repository); const states = [];
  const stop = model.subscribe(() => states.push(model.getSnapshot().status));
  await model.retry(); stop();
  assert.deepEqual(states, ['loading', 'loaded']);
  assert.equal(calls.length, 3);
  assert.deepEqual(model.getSnapshot().products.map(p => [p.id, p.price, p.image_url]), [[ID, '59.00', null], [SECOND, '59.00', null]]);
});

test('integration: actual HTTP empty responses become loaded-empty, never demo or errors', async () => {
  const repository = build(async url => url.endsWith('/categories') ? Response.json({ data: [] }) : page([]));
  const model = createCatalogViewModel(() => repository); await model.retry();
  assert.deepEqual(model.getSnapshot(), { status: 'loaded', categories: [], products: [] });
});

test('integration: malformed remote product is rejected before the ViewModel publishes data', async () => {
  const repository = build(async url => url.endsWith('/categories') ? Response.json({ data: [] }) : page([{ ...product, id: 'invalid', price: 59 }]));
  const model = createCatalogViewModel(() => repository); await model.retry();
  assert.deepEqual(model.getSnapshot(), { status: 'error' });
});

test('integration: HTTP 503 produces sanitized error and retry can recover through all layers', async () => {
  let unavailable = true;
  const repository = build(async url => unavailable ? Response.json({ secret: 'do-not-reflect' }, { status: 503 })
    : url.endsWith('/categories') ? Response.json({ data: [] }) : page([product]));
  const model = createCatalogViewModel(() => repository); await model.retry();
  assert.deepEqual(model.getSnapshot(), { status: 'error' });
  unavailable = false; await model.retry();
  assert.equal(model.getSnapshot().products[0].price, '59.00');
});

test('integration: detail distinguishes 200, 404 and invalid successful JSON', async () => {
  for (const [response, expected] of [
    [() => Response.json({ data: { ...product, description: 'Texto' } }), 'loaded'],
    [() => Response.json({ error: 'private' }, { status: 404 }), 'not-found'],
    [() => Response.json({ data: product }), 'error'],
  ]) {
    const repository = build(async url => { assert.equal(url, config.baseUrl + '/products/' + ID); return response(); });
    const model = createProductDetailViewModel(ID, () => repository); await model.retry();
    assert.equal(model.getSnapshot().status, expected);
    if (expected === 'loaded') assert.equal(model.getSnapshot().product.description, 'Texto');
  }
});

test('integration: cancelling a detail aborts HTTP and prevents late observer publication', async () => {
  let resolveResponse, requestSignal;
  const repository = build((_url, options) => { requestSignal = options.signal; return new Promise(resolve => { resolveResponse = resolve; }); });
  const model = createProductDetailViewModel(ID, () => repository); const states = [];
  const stop = model.subscribe(() => states.push(model.getSnapshot().status));
  const pending = model.retry(); model.cancel();
  assert.equal(requestSignal.aborted, true);
  resolveResponse(Response.json({ data: { ...product, description: 'Late' } })); await pending; stop();
  assert.deepEqual(states, ['loading']);
});

test('integration: repeated pagination cursor is bounded and becomes a UI error', async () => {
  let calls = 0;
  const repository = build(async url => {
    if (url.endsWith('/categories')) return Response.json({ data: [] });
    calls++; return page([product], ID);
  });
  const model = createCatalogViewModel(() => repository); await model.retry();
  assert.equal(model.getSnapshot().status, 'error'); assert.equal(calls, 2);
});

test('Observer permits removal during notification without calling the removed listener', async () => {
  const model = createCatalogViewModel(() => ({ list: async () => ({ products: [], categories: [] }) }));
  let removedCalls = 0, stopSecond;
  const stopFirst = model.subscribe(() => stopSecond());
  stopSecond = model.subscribe(() => removedCalls++);
  await model.retry(); stopFirst(); stopSecond();
  assert.equal(removedCalls, 0);
});
