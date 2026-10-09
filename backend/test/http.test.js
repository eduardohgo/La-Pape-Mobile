import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { errorHandler } from '../src/middlewares/errors.js';
import { startServer, stopServer } from '../src/server.js';

async function localServer(t, env = {}) {
  const server = startServer({ ...loadConfig(env), port: 0 });
  await once(server, 'listening');
  t.after(() => stopServer(server));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health reports HTTP liveness without consuming database services', async (t) => {
  const config = loadConfig({ DATABASE_URL: 'postgresql://example.invalid/lapape' });
  const app = createApp({ ...config, get database() { throw new Error('Health must not inspect the database'); } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'ts']);
  assert.equal(body.ok, true);
  assert.ok(Number.isSafeInteger(body.ts));
  assert.ok(Math.abs(Date.now() - body.ts) < 5000);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('CORS supports explicit Expo web origins and native clients, rejecting unknown origins', async (t) => {
  const base = await localServer(t);
  for (const origin of ['http://localhost:8081', 'http://localhost:19006']) {
    const response = await fetch(`${base}/health`, { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const denied = await fetch(`${base}/health`, { headers: { Origin: 'https://untrusted.invalid' } });
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: 'Origen no permitido' });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(`${base}/health`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/);
});

test('unknown routes do not reflect URL contents and no business API is mounted', async (t) => {
  const base = await localServer(t);
  for (const path of ['/unknown?private=do-not-reflect', '/auth/login', '/products', '/test-email']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Ruta no encontrada' });
  }
});

test('malformed JSON and oversized bodies have bounded sanitized responses', async (t) => {
  const base = await localServer(t, { JSON_BODY_LIMIT_BYTES: '32' });
  const badJson = await fetch(`${base}/unknown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"private":"do-not-reflect"' });
  assert.equal(badJson.status, 400);
  assert.deepEqual(await badJson.json(), { error: 'JSON inválido' });
  const large = await fetch(`${base}/unknown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(64) }) });
  assert.equal(large.status, 413);
  assert.deepEqual(await large.json(), { error: 'Cuerpo de solicitud demasiado grande' });
});

test('rate limit rejects repeated requests with JSON and security headers', async (t) => {
  const base = await localServer(t, { RATE_LIMIT_MAX: '2' });
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/health`)).status, 200);
  const limited = await fetch(`${base}/health`);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: 'Demasiadas peticiones, intenta más tarde' });
  assert.ok(limited.headers.has('retry-after'));
  assert.equal(limited.headers.get('x-content-type-options'), 'nosniff');
});

test('unexpected exceptions never disclose their messages', async (t) => {
  const server = createServer((_req, res) => errorHandler(new Error('private-message-do-not-reflect'), {}, {
    headersSent: false,
    status(code) { res.statusCode = code; return this; },
    json(body) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); },
  }, () => assert.fail('The response has not started')));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Error interno del servidor' });
});

test('the HTTP server can close without leaving a listener running', async () => {
  const server = startServer({ ...loadConfig({}), port: 0 });
  await once(server, 'listening');
  await stopServer(server);
  assert.equal(server.listening, false);
});
