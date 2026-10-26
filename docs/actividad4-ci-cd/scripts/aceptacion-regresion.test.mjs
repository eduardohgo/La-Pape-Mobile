import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createApp } from '../../../backend/src/app.js';
import { loadConfig } from '../../../backend/src/config/variables-entorno.js';
import { stopServer } from '../../../backend/src/server.js';
const require = createRequire(import.meta.url);
const { filterCatalogProducts } = require('../../../frontend/.test-build/utils/busqueda-catalogo.js');
const { createHttpClient } = require('../../../frontend/.test-build/services/http/cliente-http.js');
const { parseApiConfig } = require('../../../frontend/.test-build/config/configuracion-api.js');
const { isHealthResponse } = require('../../../frontend/.test-build/services/servicio-salud-api.js');
async function local(t) {
  const config = loadConfig({ NODE_ENV: 'test' });
  assert.equal(config.database, null);
  assert.equal(config.catalogApiEnabled, false);
  const server = createApp(config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  return `http://127.0.0.1:${server.address().port}`;
}
test('A1 aceptación técnica: cliente Mobile confirma salud HTTP local sin BD', async t => {
  const base = await local(t);
  const client = createHttpClient(parseApiConfig({ url: base, timeoutMs: '2000' }, true));
  assert.equal((await client.get('/health', isHealthResponse)).ok, true);
});
test('A2 aceptación lógica: buscar, filtrar y vaciar búsqueda conserva datos', () => {
  const items = Object.freeze([
    Object.freeze({ name:'Cuadérno prueba', sku:'TEST-01', category_name:'Escolar', category_id:'a' }),
    Object.freeze({ name:'Lápiz prueba', sku:'TEST-02', category_name:'Arte', category_id:'b' }),
  ]);
  assert.deepEqual(filterCatalogProducts(items, 'cuaderno', 'a'), [items[0]]);
  assert.deepEqual(filterCatalogProducts(items, 'cuaderno', 'b'), []);
  assert.deepEqual(filterCatalogProducts(items, '', 'all'), items);
  assert.equal(items[0].name, 'Cuadérno prueba');
});
test('R1 regresión: contrato, caché y rutas deshabilitadas permanecen', async t => {
  const base = await local(t);
  for (let i=0; i<3; i++) {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['ok','ts']);
    assert.equal(body.ok, true);
    assert.ok(Number.isSafeInteger(body.ts));
  }
  for (const route of ['/products','/auth/login','/gaming','/rush']) {
    const response = await fetch(`${base}${route}`, { signal: AbortSignal.timeout(2000) });
    assert.equal(response.status,404);
    assert.deepEqual(await response.json(), { error:'Ruta no encontrada' });
  }
});
test('R2 regresión: después de un origen rechazado salud sigue disponible', async t => {
  const base = await local(t);
  assert.equal((await fetch(`${base}/health`, { headers:{ Origin:'https://untrusted.invalid' }, signal:AbortSignal.timeout(2000) })).status,403);
  assert.equal((await fetch(`${base}/health`, { signal:AbortSignal.timeout(2000) })).status,200);
});
