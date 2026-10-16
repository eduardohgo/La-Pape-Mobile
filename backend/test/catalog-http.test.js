import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';

const ID = 'e9096108-10c1-4483-9a3c-f61283d3c24f';
async function serve(t, enabled, repository) {
  const config = { ...loadConfig({}), catalogApiEnabled: enabled };
  const server = createApp(config, { catalogRepository: repository }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return `http://127.0.0.1:${server.address().port}`;
}

test('catalog routes are disabled until explicitly enabled', async t => {
  const base = await serve(t, false);
  assert.equal((await fetch(base + '/products')).status, 404);
});

test('public catalog reads preserve nullable photograph and decimal price text', async t => {
  const base = await serve(t, true, {
    listCategories: async () => [{ id: ID, name: 'Cuadernos' }],
    listProducts: async () => [{ id: ID, image_url: null, price: '89.90' }],
    getProduct: async id => id === ID ? { id, image_url: null, price: '89.90' } : null,
  });
  assert.equal((await (await fetch(base + '/categories')).json()).data[0].name, 'Cuadernos');
  assert.deepEqual((await (await fetch(base + '/products')).json()).page, { hasMore: false, nextCursor: null });
  assert.equal((await (await fetch(base + '/products/' + ID)).json()).data.price, '89.90');
  assert.equal((await fetch(base + '/products/00000000-0000-4000-8000-000000000000')).status, 404);
});

test('invalid query never reaches repository', async t => {
  const base = await serve(t, true, { listProducts: () => { throw new Error('must not execute'); } });
  for (const path of ['/products?limit=0', '/products?limit=51', '/products?limit=abc', '/products?limit=2&limit=3', '/products?categoryId=bad', '/products?unexpected=1']) {
    assert.equal((await fetch(base + path)).status, 400, path);
  }
});

test('database failures do not expose secrets in API response', async t => {
  const base = await serve(t, true, { getProduct: async () => { throw new Error('postgresql://secret:token@host'); } });
  const response = await fetch(base + '/products/' + ID);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|token|postgresql/);
});
