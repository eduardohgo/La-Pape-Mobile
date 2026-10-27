const assert = require('node:assert/strict');
const test = require('node:test');
const { createHttpCatalogRepository } = require('../.test-build/features/catalogo/datos/repositorio-http.js');
const { createCatalogScope } = require('../.test-build/features/catalogo/composicion.js');
const { loadCatalog, loadProduct } = require('../.test-build/features/catalogo/dominio/casos-uso.js');
const { ProductNotFoundError } = require('../.test-build/features/catalogo/dominio/modelos.js');
const { createCatalogViewModel, createProductDetailViewModel } = require('../.test-build/features/catalogo/presentacion/viewmodels.js');
const { createCatalogService } = require('../.test-build/services/servicio-catalogo.js');
const { ApiError } = require('../.test-build/services/http/errores-http.js');

const ID = 'e9096108-10c1-4483-9a3c-f61283d3c24f';
const CATEGORY = '155b7072-240d-459e-a843-fc2ca3502169';
const product = Object.freeze({
  id: ID, sku: 'TEST-CUA-001', name: 'Cuaderno', category_id: CATEGORY,
  category_name: 'Cuadernos', brand_id: 'de3f0474-45fa-4bf8-bb53-7c47227eeb9d',
  brand_name: 'Scribe', price: '59.00', currency: 'MXN', image_url: null,
});
const detail = Object.freeze({ ...product, description: 'Descripción de prueba.' });
const data = { products: [product], categories: [{ id: CATEGORY, name: 'Cuadernos', description: null }] };
const signal = () => new AbortController().signal;
const repo = (overrides = {}) => ({ list: async () => data, detail: async () => detail, ...overrides });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('Repository commercial adapter delegates reads, identity and cancellation without demo calls', async () => {
  const calls = [];
  const service = {
    categories: async options => { calls.push(['categories', options.signal]); return data.categories; },
    products: async options => { calls.push(['products', options.signal]); return data.products; },
    product: async (id, options) => { calls.push([id, options.signal]); return detail; },
    demoProducts: () => assert.fail('commercial must never fetch demo'),
    demoProduct: () => assert.fail('commercial must never fetch demo detail'),
  };
  const repository = createHttpCatalogRepository(service, 'commercial');
  const current = signal();
  assert.deepEqual(await repository.list(current), data);
  assert.equal(await repository.detail(ID, current), detail);
  assert.deepEqual(calls.map(call => call[0]), ['categories', 'products', ID]);
  assert.ok(calls.every(call => call[1] === current));
});

test('Repository demo adapter derives unique categories and stays separate from commercial', async () => {
  const demo = { ...product, is_demo: true, is_for_sale: false };
  const repository = createHttpCatalogRepository({
    demoProducts: async () => [demo, { ...demo, id: 'second' }],
    demoProduct: async id => { assert.equal(id, ID); return demo; },
    products: () => assert.fail('must not fetch commercial'),
    categories: () => assert.fail('must not fetch commercial'),
    product: () => assert.fail('must not fetch commercial detail'),
  }, 'demo');
  assert.equal((await repository.list(signal())).categories.length, 1);
  assert.equal(await repository.detail(ID, signal()), demo);
});

test('Repository maps 404 to domain not-found and does not disguise outages or fall back', async () => {
  for (const mode of ['commercial', 'demo']) {
    for (const status of [404, 503]) {
      const failure = new ApiError('http', status);
      const fail = async () => { throw failure; };
      const repository = createHttpCatalogRepository({ product: fail, demoProduct: fail, products: fail, demoProducts: fail, categories: fail }, mode);
      await assert.rejects(repository.detail(ID, signal()), error => status === 404 ? error instanceof ProductNotFoundError : error === failure);
      await assert.rejects(repository.list(signal()), error => error === failure);
    }
  }
});

test('Factory builds independent HTTP services and adapters using injected transports', async () => {
  const calls = [];
  const config = { baseUrl: 'https://example.invalid', timeoutMs: 100, environment: 'production' };
  const build = marker => createCatalogService(config, async url => {
    calls.push(marker);
    return Response.json(url.endsWith('/categories') ? { data: data.categories } : { data: [product], page: { hasMore: false, nextCursor: null } });
  });
  const first = build('first'), second = build('second');
  assert.notEqual(first, second);
  const left = createHttpCatalogRepository(first, 'commercial');
  const right = createHttpCatalogRepository(second, 'commercial');
  assert.notEqual(left, right);
  assert.deepEqual((await left.list(signal())).products, [product]);
  assert.deepEqual(calls, ['first', 'first']);
  await right.list(signal());
  assert.deepEqual(calls, ['first', 'first', 'second', 'second']);
});

test('Singleton is lazy, built once per scope and isolated between application/test scopes', () => {
  let builds = 0;
  const scope = createCatalogScope(() => { builds++; return repo(); });
  assert.equal(builds, 0);
  const first = scope.getRepository();
  assert.equal(scope.getRepository(), first);
  assert.equal(builds, 1);
  assert.notEqual(createCatalogScope(() => repo()).getRepository(), first);
});

test('Singleton does not cache a failed construction', () => {
  let builds = 0;
  const scope = createCatalogScope(() => { if (++builds === 1) throw new Error('configuration'); return repo(); });
  assert.throws(() => scope.getRepository());
  assert.ok(scope.getRepository());
  assert.equal(builds, 2);
});

test('loadCatalog sorts categories without mutating input and preserves official fields and null images', async () => {
  const source = { products: [product], categories: [{ id: '2', name: 'Oficina', description: null }, ...data.categories] };
  const before = JSON.stringify(source);
  const loaded = await loadCatalog(repo({ list: async () => source }), signal());
  assert.deepEqual(loaded.categories.map(item => item.name), ['Cuadernos', 'Oficina']);
  assert.deepEqual(loaded.products, [product]);
  assert.equal(JSON.stringify(source), before);
  assert.ok(Object.isFrozen(loaded.products));
  assert.ok(Object.isFrozen(loaded.products[0]));
});

test('loadProduct rejects malformed UUID before repository I/O and preserves valid detail', async () => {
  const repository = repo({ detail: async () => assert.fail('invalid UUID reached repository') });
  for (const id of ['', '../products', undefined]) {
    await assert.rejects(loadProduct(repository, id, signal()), ProductNotFoundError);
  }
  assert.deepEqual(await loadProduct(repo(), ID, signal()), { product: detail });
});

test('use cases reject pre-cancelled work without repository calls', async () => {
  const controller = new AbortController(); controller.abort();
  const repository = repo({ list: () => assert.fail('cancelled list'), detail: () => assert.fail('cancelled detail') });
  await assert.rejects(loadCatalog(repository, controller.signal), { name: 'AbortError' });
  await assert.rejects(loadProduct(repository, ID, controller.signal), { name: 'AbortError' });
});

test('use cases discard results if cancellation happens during repository work', async () => {
  for (const kind of ['catalog', 'detail']) {
    const controller = new AbortController();
    const repository = repo({ list: async () => { controller.abort(); return data; }, detail: async () => { controller.abort(); return detail; } });
    await assert.rejects(kind === 'catalog' ? loadCatalog(repository, controller.signal) : loadProduct(repository, ID, controller.signal), { name: 'AbortError' });
  }
});

test('Observer emits loading/loaded, keeps snapshots stable and removes duplicate subscriptions safely', async () => {
  const model = createCatalogViewModel(() => repo());
  const initial = model.getSnapshot();
  assert.equal(initial, model.getSnapshot());
  assert.equal(initial, model.getInitialSnapshot());
  const states = [];
  const listener = () => states.push(model.getSnapshot().status);
  const unsubscribe = model.subscribe(listener), duplicate = model.subscribe(listener);
  await model.retry();
  assert.deepEqual(states, ['loading', 'loaded']);
  assert.ok(Object.isFrozen(model.getSnapshot()));
  assert.equal(model.getSnapshot(), model.getSnapshot());
  unsubscribe(); unsubscribe();
  await model.retry();
  assert.equal(states.length, 4); // second subscription still owns its registration
  duplicate(); duplicate();
  await model.retry();
  assert.equal(states.length, 4);
});

test('catalog ViewModel distinguishes loaded-empty from error and retries successfully', async () => {
  let attempts = 0;
  const model = createCatalogViewModel(() => repo({ list: async () => {
    if (++attempts === 1) throw new Error('private-server-value');
    return attempts === 2 ? { products: [], categories: [] } : data;
  } }));
  await model.retry();
  assert.deepEqual(model.getSnapshot(), { status: 'error' });
  assert.ok(!JSON.stringify(model.getSnapshot()).includes('private-server-value'));
  await model.retry();
  assert.equal(model.getSnapshot().status, 'loaded');
  assert.deepEqual(model.getSnapshot().products, []);
  await model.retry();
  assert.deepEqual(model.getSnapshot().products, [product]);
});

test('cancel aborts the active signal and suppresses late success and late failure notifications', async () => {
  for (const rejects of [false, true]) {
    const pending = deferred(); let activeSignal;
    const model = createCatalogViewModel(() => repo({ list: current => { activeSignal = current; return pending.promise; } }));
    let notifications = 0;
    const unsubscribe = model.subscribe(() => notifications++);
    const request = model.retry();
    const before = model.getSnapshot();
    model.cancel(); model.cancel(); unsubscribe();
    assert.equal(activeSignal.aborted, true);
    if (rejects) pending.reject(new Error('late')); else pending.resolve(data);
    await request;
    assert.equal(model.getSnapshot(), before);
    assert.equal(notifications, 1);
  }
});

test('retry aborts earlier requests and an out-of-order result cannot replace the current result', async () => {
  const old = deferred(); const recent = deferred(); const signals = [];
  const model = createCatalogViewModel(() => repo({ list: current => { signals.push(current); return signals.length === 1 ? old.promise : recent.promise; } }));
  const first = model.retry(), second = model.retry();
  assert.equal(signals[0].aborted, true);
  recent.resolve(data); await second;
  const expected = model.getSnapshot();
  old.resolve({ products: [], categories: [] }); await first;
  assert.equal(model.getSnapshot(), expected);
  assert.deepEqual(expected.products, [product]);
});

test('ViewModel survives effect cleanup and restart, with no callbacks after all unsubscribes', async () => {
  const model = createCatalogViewModel(() => repo());
  let notifications = 0;
  for (let index = 0; index < 30; index++) {
    const unsubscribe = model.subscribe(() => notifications++);
    await model.retry();
    unsubscribe(); model.cancel();
  }
  assert.equal(notifications, 60);
  await model.retry();
  assert.equal(notifications, 60);
});

test('separate screen ViewModels share only the repository, not request state or cancellation', async () => {
  const pending = deferred();
  const repository = repo({ list: () => pending.promise });
  const left = createCatalogViewModel(() => repository);
  const right = createProductDetailViewModel(ID, () => repository);
  const request = left.retry();
  await right.retry(); left.cancel(); pending.resolve(data); await request;
  assert.equal(left.getSnapshot().status, 'loading');
  assert.deepEqual(right.getSnapshot(), { status: 'loaded', product: detail });
});

test('detail ViewModel maps invalid identity, missing product and outages to distinct states', async () => {
  let calls = 0;
  const invalid = createProductDetailViewModel('../products', () => repo({ detail: async () => { calls++; return detail; } }));
  await invalid.retry(); assert.deepEqual(invalid.getSnapshot(), { status: 'not-found' });
  assert.equal(calls, 0);
  for (const [failure, status] of [[new ProductNotFoundError(), 'not-found'], [new Error('private'), 'error']]) {
    const model = createProductDetailViewModel(ID, () => repo({ detail: async () => { throw failure; } }));
    await model.retry(); assert.deepEqual(model.getSnapshot(), { status });
  }
});

test('detail cancellation, retry and UUID changes cannot display stale product data', async () => {
  const pending = deferred(); let active;
  const old = createProductDetailViewModel(ID, () => repo({ detail: (_id, current) => { active = current; return pending.promise; } }));
  const request = old.retry(); old.cancel();
  const nextId = '155b7072-240d-459e-a843-fc2ca3502169';
  const next = createProductDetailViewModel(nextId, () => repo({ detail: async id => ({ ...detail, id }) }));
  await next.retry(); pending.resolve(detail); await request;
  assert.equal(active.aborted, true);
  assert.equal(old.getSnapshot().status, 'loading');
  assert.equal(next.getSnapshot().product.id, nextId);
  await next.retry(); assert.equal(next.getSnapshot().product.id, nextId);
});

test('detail retries recover from both missing products and temporary errors', async () => {
  for (const failure of [new ProductNotFoundError(), new Error('outage')]) {
    let attempts = 0;
    const model = createProductDetailViewModel(ID, () => repo({ detail: async () => {
      if (++attempts === 1) throw failure;
      return detail;
    } }));
    await model.retry();
    assert.notEqual(model.getSnapshot().status, 'loaded');
    await model.retry();
    assert.deepEqual(model.getSnapshot(), { status: 'loaded', product: detail });
  }
});

test('configuration failure becomes sanitized UI error and can be retried', async () => {
  let attempts = 0;
  const model = createCatalogViewModel(() => { if (++attempts === 1) throw new Error('private-config'); return repo(); });
  await model.retry(); assert.deepEqual(model.getSnapshot(), { status: 'error' });
  await model.retry(); assert.equal(model.getSnapshot().status, 'loaded');
});

test('failed parallel reads are aborted when the ViewModel finishes with an error', async () => {
  let active;
  const repository = createHttpCatalogRepository({
    categories: async () => { throw new Error('outage'); },
    products: current => { active = current.signal; return new Promise(() => {}); },
  }, 'commercial');
  const model = createCatalogViewModel(() => repository);
  await model.retry();
  assert.equal(model.getSnapshot().status, 'error');
  assert.equal(active.aborted, true);
});
