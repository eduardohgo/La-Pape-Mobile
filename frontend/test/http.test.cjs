const assert = require('node:assert/strict');
const test = require('node:test');
const { randomBytes } = require('node:crypto');
const { getCatalogRepository } = require('../.test-build/features/catalogo/composicion.js');
const { createAuthService } = require('../.test-build/features/auth/servicio-auth.js');
const { createHttpClient } = require('../.test-build/services/http/cliente-http.js');
const { ApiError } = require('../.test-build/services/http/errores-http.js');
const { getApiConfig, getCatalogApiConfig, parseApiConfig } = require('../.test-build/config/configuracion-api.js');
const { isHealthResponse } = require('../.test-build/services/servicio-salud-api.js');
const config = parseApiConfig({ url: 'http://127.0.0.1:3000' }, true);
const matchError = (kind, status) => (error) => error instanceof ApiError && error.kind === kind && error.status === status;

test('configuration permits LAN HTTP only in a development build/environment', () => {
  for (const host of ['10.0.0.2', '172.16.0.2', '192.168.1.2', 'localhost', '[::1]']) {
    assert.equal(parseApiConfig({ url: `http://${host}:3000/` }, true).baseUrl, `http://${host}:3000`);
  }
  assert.equal(parseApiConfig({ url: 'https://example.invalid', environment: 'production' }, false).environment, 'production');
  for (const env of [
    {}, { url: 'not-a-url' }, { url: 'http://example.invalid' }, { url: 'https://user:private@example.invalid' },
    { url: 'https://example.invalid/api' }, { url: 'https://example.invalid?secret=example' },
    { url: 'https://example.invalid#fragment' }, { url: 'http://192.168.1.2', environment: 'staging' },
    { url: 'https://example.invalid', environment: 'unknown' },
    { url: 'https://example.invalid', timeoutMs: '1e3' }, { url: 'https://example.invalid', timeoutMs: '0' },
  ]) assert.throws(() => parseApiConfig(env, true), matchError('configuration'));
  assert.throws(() => parseApiConfig({ url: 'http://192.168.1.2' }, false), matchError('configuration'));
  assert.throws(() => parseApiConfig({ url: 'https://example.invalid', environment: 'development' }, false), matchError('configuration'));
});

test('the actual health contract is validated at runtime', () => {
  assert.ok(isHealthResponse({ ok: true, ts: Date.now() }));
  for (const value of [null, [], {}, { ok: false, ts: 1 }, { ok: true, ts: '1' }, { ok: true, ts: NaN }, { ok: true, ts: -1 }, { ok: true, ts: 1.5 }]) {
    assert.equal(isHealthResponse(value), false);
  }
});

test('GET health uses the root route, no credentials, and validates the response', async () => {
  const response = { ok: true, ts: 42 };
  let calls = 0;
  const client = createHttpClient(config, async (url, options) => {
    calls += 1;
    assert.equal(url, 'http://127.0.0.1:3000/health');
    assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(response);
  });
  assert.deepEqual(await client.get('/health', isHealthResponse), response);
  assert.equal(calls, 1);
  for (const path of ['https://example.invalid', '//example.invalid', '/health?private=value', '/health#value']) {
    await assert.rejects(client.get(path, isHealthResponse), matchError('configuration'));
  }
  assert.equal(calls, 1);
});

test('HTTP errors retain status, do not reflect server secrets, and do not retry', async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    let calls = 0;
    const client = createHttpClient(config, async () => { calls += 1; return Response.json({ secret: 'private-body' }, { status }); });
    await assert.rejects(client.get('/health', isHealthResponse), (error) => matchError('http', status)(error) && !error.message.includes('private-body'));
    assert.equal(calls, 1);
  }
});

test('unexpected body types, malformed JSON and invalid shape are rejected', async () => {
  for (const response of [new Response('html'), new Response('{', { headers: { 'content-type': 'application/json' } }), Response.json({ ok: false, ts: 1 })]) {
    await assert.rejects(createHttpClient(config, async () => response).get('/health', isHealthResponse), matchError('invalid-response'));
  }
});

test('network errors are sanitized', async () => {
  await assert.rejects(createHttpClient(config, async () => { throw new Error('private-url-or-token'); }).get('/health', isHealthResponse),
    (error) => matchError('network')(error) && !error.message.includes('private-url-or-token'));
});

test('timeout aborts a request and also bounds a stalled JSON body', async () => {
  let signal;
  const client = createHttpClient({ ...config, timeoutMs: 20 }, async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  await assert.rejects(client.get('/health', isHealthResponse), matchError('timeout'));
  assert.ok(signal.aborted);
  const stalledBody = createHttpClient({ ...config, timeoutMs: 20 }, async () => ({
    ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: () => new Promise(() => {}),
  }));
  await assert.rejects(stalledBody.get('/health', isHealthResponse), matchError('timeout'));
});

test('external cancellation is distinct and pre-cancelled requests never fetch', async () => {
  const controller = new AbortController();
  let calls = 0;
  let internalSignal;
  const client = createHttpClient(config, async (_url, options) => { calls += 1; internalSignal = options.signal; return new Promise(() => {}); });
  const pending = client.get('/health', isHealthResponse, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, matchError('cancelled'));
  assert.ok(internalSignal.aborted);
  await assert.rejects(client.get('/health', isHealthResponse, { signal: controller.signal }), matchError('cancelled'));
  assert.equal(calls, 1);
});


const { createCatalogService, getCatalogService, isCategoryResponse, isProductResponse } = require('../.test-build/services/servicio-catalogo.js');
const PRODUCT_ID = 'e9096108-10c1-4483-9a3c-f61283d3c24f';
const BRAND_ID = 'de3f0474-45fa-4bf8-bb53-7c47227eeb9d';
const CATEGORY_ID = '155b7072-240d-459e-a843-fc2ca3502169';
const TEST_PRODUCT = {
  id: PRODUCT_ID, sku: 'LAP-CUA-001', name: 'Cuaderno',
  category_id: CATEGORY_ID, category_name: 'Cuadernos',
  brand_id: BRAND_ID, brand_name: 'Scribe',
  price: '89.90', currency: 'MXN', image_url: null,
};

test('catalog contract validates remote data and nullable photos', () => {
  assert.equal(isCategoryResponse({ data: [{ id: CATEGORY_ID, name: 'Cuadernos', description: null }] }), true);
  assert.equal(isProductResponse({ data: [TEST_PRODUCT], page: { hasMore: false, nextCursor: null } }), true);
  assert.equal(isProductResponse({ data: [{ ...TEST_PRODUCT, price: 'invalid' }], page: { hasMore: false, nextCursor: null } }), false);
  assert.equal(isProductResponse({ data: [{ ...TEST_PRODUCT, image_url: 'http://unsafe.test/item.png' }], page: { hasMore: false, nextCursor: null } }), false);
  assert.equal(isProductResponse({ data: [TEST_PRODUCT], page: { hasMore: true, nextCursor: null } }), false);
});

test('catalog gets products and categories from HTTP; never substitutes local demo items', async () => {
  const called = [];
  const service = createCatalogService(config, async (url, options) => {
    called.push(url);
    assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    if (url.endsWith('/categories')) return Response.json({ data: [] });
    if (url.endsWith('/products?limit=50')) {
      return Response.json({ data: [], page: { hasMore: false, nextCursor: null } });
    }
    throw new Error('Unexpected route');
  });
  assert.deepEqual(await service.categories(), []);
  assert.deepEqual(await service.products(), []);
  assert.deepEqual(called, [
    'http://127.0.0.1:3000/categories',
    'http://127.0.0.1:3000/products?limit=50',
  ]);
});

test('catalog follows server cursors and avoids duplicate page fetches', async () => {
  const calls = [];
  const service = createCatalogService(config, async (url) => {
    calls.push(url);
    if (calls.length === 1) return Response.json({
      data: [TEST_PRODUCT], page: { hasMore: true, nextCursor: PRODUCT_ID },
    });
    return Response.json({
      data: [], page: { hasMore: false, nextCursor: null },
    });
  });
  const products = await service.products();
  assert.equal(products.length, 1);
  assert.equal(products[0].image_url, null);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], `http://127.0.0.1:3000/products?limit=50&after=${PRODUCT_ID}`);
});

test('catalog does not confuse API failures with an empty catalog', async () => {
  const service = createCatalogService(config, async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await assert.rejects(service.products(), matchError('http', 503));
});


test('demo preview from Neon is explicitly non-purchasable and has no brand field', async () => {
  const { createCatalogService, isDemoCatalogResponse } = require('../.test-build/services/servicio-catalogo.js');
  const item = {
    id: 'e9096108-10c1-4483-9a3c-f61283d3c24f',
    sku: 'LAP-CUA-001',
    name: 'Cuaderno profesional cuadriculado',
    category_id: '155b7072-240d-459e-a843-fc2ca3502169',
    category_name: 'Cuadernos',
    price: '89.90', currency: 'MXN', image_url: null,
    is_demo: true, is_for_sale: false,
  };
  const payload = { mode: 'demo', purchasable: false, data: [item] };
  assert.equal(isDemoCatalogResponse(payload), true);
  assert.equal(isDemoCatalogResponse({ ...payload, purchasable: true }), false);
  assert.equal(isDemoCatalogResponse({ ...payload, data: [{ ...item, is_for_sale: true }] }), false);
  assert.equal(isDemoCatalogResponse({ ...payload, data: [{ ...item, is_demo: false }] }), false);
  assert.equal(isDemoCatalogResponse({ ...payload, data: [{ ...item, image_url: 'https://unverified.example/photo.jpg' }] }), false);

  let calls = 0;
  const service = createCatalogService(config, async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:3000/demo/products');
    assert.equal(options.method, 'GET');
    calls += 1;
    return Response.json(payload);
  });
  const rows = await service.demoProducts();
  assert.deepEqual(rows, [item]);
  assert.equal(calls, 1);
});

test('demo preview rejects server errors instead of using the ten static fixtures', async () => {
  const { createCatalogService } = require('../.test-build/services/servicio-catalogo.js');
  const service = createCatalogService(config, async () =>
    Response.json({ error: 'demo unavailable' }, { status: 503 }));
  await assert.rejects(service.demoProducts(), matchError('http', 503));
});


test('demo detail validates identity and reads only the requested item from the API', async () => {
  const { createCatalogService, isDemoProductDetailResponse } = require('../.test-build/services/servicio-catalogo.js');
  const preview = {
    id: PRODUCT_ID, sku: 'LAP-CUA-001', name: 'Cuaderno profesional cuadriculado',
    category_id: CATEGORY_ID, category_name: 'Cuadernos',
    price: '89.90', currency: 'MXN', image_url: null,
    is_demo: true, is_for_sale: false,
  };
  const payload = { mode: 'demo', purchasable: false, data: preview };
  assert.equal(isDemoProductDetailResponse(payload), true);
  for (const invalid of [
    { ...payload, purchasable: true },
    { ...payload, data: { ...preview, is_for_sale: true } },
    { ...payload, data: { ...preview, is_demo: false } },
    { ...payload, data: { ...preview, price: 'invalid' } },
    { ...payload, data: { ...preview, image_url: 'https://unverified.example/photo.png' } },
  ]) assert.equal(isDemoProductDetailResponse(invalid), false);

  let calls = 0;
  const service = createCatalogService(config, async (url, options) => {
    assert.equal(url, `http://127.0.0.1:3000/demo/products/${PRODUCT_ID}`);
    assert.equal(options.method, 'GET');
    calls += 1;
    return Response.json(payload);
  });
  assert.deepEqual(await service.demoProduct(PRODUCT_ID), preview);
  assert.equal(calls, 1);
  await assert.rejects(service.demoProduct('../products'), matchError('configuration'));
  assert.equal(calls, 1);
});

test('commercial detail validates description but does not mark merchandise as demo', async () => {
  const { createCatalogService, isCatalogProductDetailResponse } = require('../.test-build/services/servicio-catalogo.js');
  const item = { ...TEST_PRODUCT, description: 'Cuaderno de 100 hojas' };
  assert.equal(isCatalogProductDetailResponse({ data: item }), true);
  assert.equal(isCatalogProductDetailResponse({ data: TEST_PRODUCT }), false);
  assert.equal(isCatalogProductDetailResponse({ data: { ...item, price: 89.9 } }), false);
  const service = createCatalogService(config, async (url) => {
    assert.equal(url, `http://127.0.0.1:3000/products/${PRODUCT_ID}`);
    return Response.json({ data: item });
  });
  assert.deepEqual(await service.product(PRODUCT_ID), item);
});

test('missing demo details return 404 and invalid remote contracts do not produce fake products', async () => {
  const { createCatalogService } = require('../.test-build/services/servicio-catalogo.js');
  const missing = createCatalogService(config, async () => Response.json({ error: 'not found' }, { status: 404 }));
  await assert.rejects(missing.demoProduct(PRODUCT_ID), matchError('http', 404));
  const invalid = createCatalogService(config, async () =>
    Response.json({ mode: 'demo', purchasable: false, data: { name: 'fake' } }));
  await assert.rejects(invalid.demoProduct(PRODUCT_ID), matchError('invalid-response'));
});

function setApiOrigins(t) {
  const env = {
    EXPO_PUBLIC_API_URL: 'https://172.20.10.2:3443',
    EXPO_PUBLIC_CATALOG_API_URL: 'https://catalog.example.test',
    EXPO_PUBLIC_API_ENV: 'development',
    EXPO_PUBLIC_CATALOG_MODE: 'commercial',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  const previousDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousDev) Object.defineProperty(globalThis, '__DEV__', previousDev);
    else delete globalThis.__DEV__;
  });
  globalThis.__DEV__ = true;
  Object.assign(process.env, env);
  return { local: env.EXPO_PUBLIC_API_URL, catalog: env.EXPO_PUBLIC_CATALOG_API_URL };
}

test('catalog configuration uses its explicit HTTPS origin and preserves the legacy fallback', (t) => {
  const { local, catalog } = setApiOrigins(t);
  assert.equal(getApiConfig().baseUrl, local);
  assert.equal(getCatalogApiConfig().baseUrl, catalog);

  delete process.env.EXPO_PUBLIC_API_URL;
  assert.equal(getCatalogApiConfig().baseUrl, catalog);
  assert.throws(() => getApiConfig(), matchError('configuration'));
  process.env.EXPO_PUBLIC_API_URL = local;

  for (const invalid of ['http://172.20.10.2:3443', 'http://catalog.example.test',
    'https://user:example@catalog.example.test', 'https://catalog.example.test/api']) {
    process.env.EXPO_PUBLIC_CATALOG_API_URL = invalid;
    assert.throws(() => getCatalogApiConfig(), matchError('configuration'));
    assert.equal(getApiConfig().baseUrl, local);
  }

  delete process.env.EXPO_PUBLIC_CATALOG_API_URL;
  assert.equal(getCatalogApiConfig().baseUrl, local);
});

test('home, catalog and detail use public GETs while login, session and logout stay local', async (t) => {
  const { local, catalog } = setApiOrigins(t);
  const token = randomBytes(32).toString('base64url');
  const credentials = { email: 'client@example.test', password: 'fixture-password' };
  const session = {
    user: { id: PRODUCT_ID, email: credentials.email, name: 'Cliente de prueba', role: 'CLIENTE' },
    expiresAt: '2030-01-01T00:00:00Z',
    idleExpiresAt: '2029-12-31T23:59:00Z',
  };
  const catalogCategory = { id: CATEGORY_ID, name: 'Cuadernos', description: null };
  const detail = { ...TEST_PRODUCT, description: 'Detalle de prueba' };
  const routes = new Map([
    [catalog + '/products?limit=50', { data: [TEST_PRODUCT], page: { hasMore: false, nextCursor: null } }],
    [catalog + '/categories', { data: [catalogCategory] }],
    [catalog + '/products/' + PRODUCT_ID, { data: detail }],
    [local + '/auth/login', { ...session, tokenType: 'Bearer', accessToken: token }],
    [local + '/auth/me', session],
    [local + '/auth/logout', null],
  ]);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(routes.has(url));
    requests.push({ url, ...options });
    const payload = routes.get(url);
    return payload === null ? new Response(null, { status: 204 }) : Response.json(payload);
  });

  const auth = createAuthService(getApiConfig());
  const login = await auth.login(credentials);
  const signal = new AbortController().signal;
  const leakedOptions = { signal, bearer: login.token, query: { email: credentials.email } };
  assert.deepEqual(await getCatalogService().products(leakedOptions), [TEST_PRODUCT]);
  const repository = getCatalogRepository();
  assert.deepEqual(await repository.list(signal), { categories: [catalogCategory], products: [TEST_PRODUCT] });
  assert.deepEqual(await repository.detail(PRODUCT_ID, signal), detail);
  assert.deepEqual(await auth.me(login.token), session);
  await auth.logout(login.token);

  const catalogRequests = requests.filter(({ url }) => new URL(url).origin === catalog);
  const authRequests = requests.filter(({ url }) => new URL(url).origin === local);
  assert.deepEqual(catalogRequests.map(({ url }) => url).sort(), [
    catalog + '/categories',
    catalog + '/products/' + PRODUCT_ID,
    catalog + '/products?limit=50',
    catalog + '/products?limit=50',
  ].sort());
  for (const request of catalogRequests) {
    assert.equal(request.method, 'GET');
    assert.deepEqual(request.headers, { Accept: 'application/json' });
    assert.equal(request.credentials, 'omit');
    assert.equal(request.body, undefined);
  }

  assert.deepEqual(authRequests.map(({ url, method }) => [new URL(url).pathname, method]), [
    ['/auth/login', 'POST'], ['/auth/me', 'GET'], ['/auth/logout', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(authRequests[0].body), credentials);
  assert.equal(authRequests[0].headers.Authorization, undefined);
  for (const request of authRequests.slice(1)) {
    assert.equal(request.headers.Authorization, 'Bearer ' + token);
    assert.equal(request.body, undefined);
  }
});

test('demo preview keeps using the local origin when the public catalog is configured', async (t) => {
  const { local } = setApiOrigins(t);
  const transport = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ mode: 'demo', purchasable: false, data: [] }));
  assert.deepEqual(await getCatalogService('demo').demoProducts(), []);
  assert.equal(transport.mock.calls[0].arguments[0], local + '/demo/products');
});
