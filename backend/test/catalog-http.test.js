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

test('product listing defaults to 20, accepts limit=5, and preserves the UUID filters', async t => {
  const calls = [];
  const rows = Array.from({ length: 21 }, (_, index) => ({
    id: 'e9096108-10c1-4483-9a3c-' + String(index).padStart(12, '0'),
  }));
  const base = await serve(t, true, {
    async listProducts(categoryId, after, limit) {
      calls.push([categoryId, after, limit]);
      return rows.slice(0, limit + 1);
    },
  });
  for (const [query, expectedLimit] of [['', 20], ['?limit=5', 5]]) {
    const response = await fetch(base + '/products' + query);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.data.length, expectedLimit);
    assert.deepEqual(result.page, { hasMore: true, nextCursor: rows[expectedLimit - 1].id });
  }
  const filtered = await fetch(base + '/products?categoryId=' + ID + '&after=' + rows[4].id + '&limit=5');
  assert.equal(filtered.status, 200);
  assert.deepEqual(calls, [[null, null, 20], [null, null, 5], [ID, rows[4].id, 5]]);
});

test('product listing rejects unknown raw keys and duplicate or nested filters before querying', async t => {
  let calls = 0;
  const base = await serve(t, true, { async listProducts() { calls++; return []; } });
  const paths = [
    '/products?__proto__=extra',
    '/products?limit=5&%6cimit=5',
    '/products?limit%5B0%5D=5',
    '/products??limit=5',
    '/products?categoryId=' + ID + '&categoryId=' + ID,
    '/products?after=' + ID + '&after=' + ID,
    '/products?limit=',
  ];
  for (const path of paths) {
    const response = await fetch(base + path);
    assert.equal(response.status, 400, path);
    assert.deepEqual(await response.json(), { error: 'Parámetros inválidos' });
  }
  assert.equal(calls, 0);
});

test('database failures do not expose secrets in API response', async t => {
  const base = await serve(t, true, { getProduct: async () => { throw new Error('postgresql://secret:token@host'); } });
  const response = await fetch(base + '/products/' + ID);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret|token|postgresql/);
});
