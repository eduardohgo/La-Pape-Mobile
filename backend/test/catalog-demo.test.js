import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const ID = 'e9096108-10c1-4483-9a3c-f61283d3c24f';

async function serve(t, config, repository) {
  const server = createApp(config, { catalogRepository: repository }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())));
  return 'http://127.0.0.1:' + server.address().port;
}

test('demo API is off by default even while commercial read routes are on', async (t) => {
  const config = loadConfig({ NODE_ENV: 'development', CATALOG_API_ENABLED: 'true' });
  const base = await serve(t, config, { listDemoProducts: () => { throw new Error('Should not be called'); } });
  assert.equal((await fetch(base + '/demo/products')).status, 404);
});

test('demo API returns hard-coded non-purchasable envelope without modifying published catalog', async (t) => {
  const config = loadConfig({ NODE_ENV: 'development', CATALOG_API_ENABLED: 'true', CATALOG_DEMO_API_ENABLED: 'true' });
  const demo = {
    id: ID, sku: 'LAP-CUA-001', name: 'Cuaderno profesional cuadriculado',
    category_id: ID, category_name: 'Cuadernos', price: '89.90',
    currency: 'MXN', image_url: null, is_demo: true, is_for_sale: false,
  };
  const base = await serve(t, config, {
    listDemoProducts: async () => [demo],
    listCategories: async () => [],
    listProducts: async () => [],
  });
  const response = await fetch(base + '/demo/products');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { mode: 'demo', purchasable: false, data: [demo] });
  assert.equal((await (await fetch(base + '/products')).json()).data.length, 0);
  assert.equal((await fetch(base + '/demo/products?all=true')).status, 400);
});

test('demo API stays off in production and test even if its flag is supplied', async (t) => {
  for (const env of ['production', 'test']) {
    const config = loadConfig({
      NODE_ENV: env, CATALOG_API_ENABLED: 'true', CATALOG_DEMO_API_ENABLED: 'true',
    });
    assert.equal(config.catalogDemoApiEnabled, false);
    const base = await serve(t, config, { listDemoProducts: async () => [] });
    assert.equal((await fetch(base + '/demo/products')).status, 404);
  }
});

test('demo API still rejects production config objects manually requesting it', async (t) => {
  const config = { ...loadConfig({ NODE_ENV: 'production', CATALOG_API_ENABLED: 'true' }), catalogDemoApiEnabled: true };
  const base = await serve(t, config, { listDemoProducts: async () => [] });
  assert.equal((await fetch(base + '/demo/products')).status, 404);
});

test('demo errors are sanitized and do not reveal internal Postgres secrets', async (t) => {
  const config = loadConfig({
    NODE_ENV: 'development', CATALOG_API_ENABLED: 'true', CATALOG_DEMO_API_ENABLED: 'true',
  });
  const base = await serve(t, config, {
    listDemoProducts: async () => { throw new Error('postgresql://private:token@internal'); },
  });
  const response = await fetch(base + '/demo/products');
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.doesNotMatch(body, /token|private|postgresql/);
});
