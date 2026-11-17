import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { startConfiguredServer, stopServer } from '../src/server.js';

function env() {
  return {
    NODE_ENV: 'production', APP_RUNTIME: 'render', PORT: '10000',
    AUTH_ENABLED: 'true', AUTH_MODE: 'hosted', RENDER_TRUSTED_PROXY_IPS: '127.0.0.2',
    AUTH_DATABASE_HOST: 'ep-auth.region.aws.neon.tech',
    AUTH_DATABASE_URL: 'postgresql://lapape_auth_runtime:fixture-only@ep-auth.region.aws.neon.tech/lapape_mobile_dev?sslmode=verify-full',
    AUTH_RATE_LIMIT_KEY: randomBytes(32).toString('base64url'),
    CATALOG_API_ENABLED: 'true',
    DATABASE_URL: 'postgresql://lapape_catalog_render:fixture-only@ep-catalog-pooler.region.aws.neon.tech/lapape_mobile_dev?sslmode=verify-full',
    FRONTEND_ORIGINS: 'https://shop.example.test',
  };
}

test('Render consumes PORT, uses separate verified pools, and leaves demo disabled', () => {
  const config = loadConfig({ ...env(), PORT: '10678', CATALOG_DEMO_API_ENABLED: 'true' });
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.port, 10678);
  assert.equal(config.auth.hosted, true);
  assert.equal(config.auth.allowLoopbackHttp, false);
  assert.equal(config.auth.database.ssl.rejectUnauthorized, true);
  assert.equal(config.database.ssl.rejectUnauthorized, true);
  assert.equal(config.catalogDemoApiEnabled, false);
  assert.deepEqual(config.allowedOrigins, ['https://shop.example.test']);
  assert.doesNotMatch(JSON.stringify(config), /fixture-only/);
});

test('insecure or ambiguous hosted configuration is rejected without reflecting sensitive values', () => {
  const valid = env();
  const bad = [
    { NODE_ENV: 'development' }, { APP_RUNTIME: 'local' }, { PORT: '' }, { HOST: '127.0.0.1' },
    { AUTH_MODE: 'pilot' }, { TRUST_PROXY: '1' }, { RENDER_TRUSTED_PROXY_IPS: '' },
    { RENDER_TRUSTED_PROXY_IPS: '10.0.0.0/8' }, { RENDER_TRUSTED_PROXY_IPS: '0.0.0.0' },
    { AUTH_ALLOW_LOOPBACK_HTTP: 'true' }, { AUTH_DATABASE_HOST: 'ep-other.region.aws.neon.tech' },
    { AUTH_DATABASE_URL: '' }, { AUTH_RATE_LIMIT_KEY: Buffer.alloc(32).toString('base64url') },
    { AUTH_DATABASE_URL: valid.AUTH_DATABASE_URL.replace('lapape_auth_runtime', 'owner') },
    { DATABASE_URL: valid.DATABASE_URL.replace('lapape_catalog_render', 'owner') },
    { DATABASE_URL: valid.DATABASE_URL.replace('lapape_catalog_render', 'lapape_catalog_reader') },
    { DATABASE_URL: valid.DATABASE_URL.replace('ep-catalog-pooler', 'ep-auth-pooler') },
    { DATABASE_URL: valid.DATABASE_URL.replace('verify-full', 'disable') },
    { FRONTEND_ORIGINS: 'http://shop.example.test' },
  ];
  for (const override of bad) {
    assert.throws(() => loadConfig({ ...valid, ...override }), error => !error.message.includes('fixture-only'));
  }
});

function send(port, peer, headers, path = '/auth/login') {
  const body = JSON.stringify({ email: 'cliente@example.test', password: 'fixture' });
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port, localAddress: peer, path, method: path === '/auth/login' ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('only an approved TCP peer can authorize forwarded HTTPS and provide the login client address', async t => {
  const verifiedClients = [];
  const config = loadConfig({ ...env(), CATALOG_API_ENABLED: 'false', RATE_LIMIT_MAX: '3' });
  const app = createApp(config, { authService: {
    async login(_credentials, origin) {
      verifiedClients.push(origin);
      return { status: 'ok', data: { user: { role: 'CLIENTE' } } };
    },
  } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  const port = server.address().port;
  const edge = {
    'X-Forwarded-Proto': 'https',
    'CF-Connecting-IP': '203.0.113.34',
  };
  assert.equal(await send(port, '127.0.0.1', edge), 403);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'X-Forwarded-Proto': 'http' }), 403);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'X-Forwarded-Proto': 'https,http' }), 403);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'CF-Connecting-IP': '203.0.113.35,203.0.113.36' }), 403);
  assert.deepEqual(verifiedClients, []);

  assert.equal(await send(port, '127.0.0.2', { ...edge, 'X-Forwarded-For': '203.0.113.101' }), 200);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'X-Forwarded-For': '203.0.113.102' }), 200);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'X-Forwarded-For': '203.0.113.103' }), 200);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'X-Forwarded-For': '203.0.113.104' }), 429);
  assert.equal(await send(port, '127.0.0.2', { ...edge, 'CF-Connecting-IP': '203.0.113.35' }), 200);
  assert.deepEqual(verifiedClients, ['203.0.113.34', '203.0.113.34', '203.0.113.34', '203.0.113.35']);
});

function runtimeRepositories(catalogAllowed = true) {
  const events = [];
  const repository = (name, allowed) => ({
    async verifyPermissions() { events.push('verify-' + name); return allowed; },
    async close() { events.push('close-' + name); },
  });
  return { events, authRepository: repository('auth', true), catalogRepository: repository('catalog', catalogAllowed) };
}

test('hosted startup verifies both roles before listening and drains both pools exactly once', async () => {
  const config = { ...loadConfig(env()), port: 0 };
  const dependencies = runtimeRepositories();
  const server = await startConfiguredServer(config, dependencies);
  if (!server.listening) await once(server, 'listening');
  assert.deepEqual(dependencies.events, ['verify-auth', 'verify-catalog']);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/health`)).status, 200);
  await Promise.all([stopServer(server), stopServer(server)]);
  assert.equal(server.listening, false);
  assert.deepEqual(dependencies.events, ['verify-auth', 'verify-catalog', 'close-auth', 'close-catalog']);
});

test('failed hosted privilege checks close both pools and prevent startup', async () => {
  const dependencies = runtimeRepositories(false);
  await assert.rejects(startConfiguredServer(loadConfig(env()), dependencies), /arranque rechazada/);
  assert.deepEqual(dependencies.events, ['verify-auth', 'verify-catalog', 'close-auth', 'close-catalog']);
});
