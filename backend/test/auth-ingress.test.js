import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { connect } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { clientAddress, hasTrustedRenderHttps, renderIngress } from '../src/middlewares/ingreso-render.js';
import { startConfiguredServer, stopServer } from '../src/server.js';

// Loopback and RFC 5737 addresses below are synthetic peers, never Render IPs.
const token = Buffer.alloc(32, 1).toString('base64url');
const otherToken = Buffer.alloc(32, 2).toString('base64url');
const endpoints = [['POST', '/auth/login'], ['GET', '/auth/me'], ['POST', '/auth/logout']];
const defaultBody = JSON.stringify({ email: 'synthetic@example.test', password: 'fixture-only-password' });

function environment(overrides = {}) {
  return {
    NODE_ENV: 'production', APP_RUNTIME: 'render', API_PROFILE: 'auth-only', PORT: '10000',
    AUTH_ENABLED: 'true', AUTH_MODE: 'hosted', RENDER_TRUSTED_PROXY_IPS: '127.0.0.1',
    AUTH_DATABASE_HOST: 'ep-auth.region.aws.neon.tech',
    AUTH_DATABASE_URL: 'postgresql://lapape_auth_runtime:fixture-only@ep-auth.region.aws.neon.tech/lapape_mobile_dev?sslmode=verify-full',
    AUTH_RATE_LIMIT_KEY: randomBytes(32).toString('base64url'),
    ...overrides,
  };
}

function edge(client = '203.0.113.34') {
  return [
    ['Host', 'fixture.test'], ['X-Forwarded-Proto', 'https'], ['CF-Connecting-IP', client],
    ['Authorization', 'Bearer ' + token], ['Content-Type', 'application/json'],
  ];
}

async function fixture(t, overrides = {}, configOverrides = {}) {
  const calls = [];
  const state = { expired: false, revoked: false, failure: false };
  const user = { id: 'a387ed1a-a62e-46be-95eb-dc06f12add12', name: 'Prueba', role: 'CLIENTE' };
  const app = createApp({ ...loadConfig(environment(overrides)), ...configOverrides }, {
    authService: {
      async login(_credentials, origin) {
        calls.push(['login', origin]);
        if (state.failure) throw new Error('fixture-private-detail');
        return { status: 'ok', data: { user, accessToken: token, tokenType: 'Bearer' } };
      },
      async session(secret) {
        calls.push(['session']);
        if (state.failure) throw new Error('fixture-private-detail');
        return !state.expired && !state.revoked && secret.toString('base64url') === token ? { user } : null;
      },
      async logout() {
        calls.push(['logout']);
        if (state.failure) throw new Error('fixture-private-detail');
        state.revoked = true;
      },
    },
    catalogRepository: {
      listProducts() { throw new Error('Catalog must never be queried'); },
      listCategories() { throw new Error('Catalog must never be queried'); },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));

  async function send(method = 'POST', path = '/auth/login', options = {}) {
    const headers = options.headers ?? edge();
    const body = options.body ?? (path === '/auth/login' ? defaultBody : '');
    const lengths = headers.some(([name]) => ['content-length', 'transfer-encoding'].includes(name.toLowerCase()))
      ? [] : [['Content-Length', String(Buffer.byteLength(body))]];
    const wire = [method + ' ' + path + ' HTTP/1.1',
      ...headers.concat(lengths, [['Connection', 'close']]).map(([name, value]) => name + ': ' + value),
      '', '',
    ].join('\r\n') + body;
    const response = await new Promise((resolve, reject) => {
      const socket = connect({
        host: '127.0.0.1', port: server.address().port, localAddress: options.peer ?? '127.0.0.1',
      }, () => socket.write(wire));
      let data = '';
      socket.setTimeout(3000, () => socket.destroy(new Error('Local fixture timeout')));
      socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });
    const boundary = response.indexOf('\r\n\r\n');
    const head = response.slice(0, boundary).split('\r\n');
    const responseHeaders = Object.fromEntries(head.slice(1).map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    }));
    return { status: Number(/^HTTP\/1\.1 (\d+)/.exec(head[0])?.[1]), headers: responseHeaders, body: response.slice(boundary + 4) };
  }
  return { app, calls, state, send };
}

for (const name of ['Authorization', 'Host', 'CF-Connecting-IP', 'X-Forwarded-Proto', 'Content-Type', 'Content-Length', 'Transfer-Encoding']) {
  test('duplicate ' + name + ' is rejected on all three auth endpoints without service calls', async t => {
    const f = await fixture(t);
    for (const [method, path] of endpoints) {
      let headers = edge();
      const first = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
      if (!first) headers = headers.concat([[name, name === 'Content-Length' ? '0' : 'chunked']]);
      const value = first?.[1] ?? (name === 'Content-Length' ? '0' : 'chunked');
      headers = headers.concat([[name.toLowerCase(), value]]);
      const result = await f.send(method, path, { headers, body: '' });
      assert.equal(result.status, 400, name + ' on ' + path);
      assert.doesNotMatch(result.body, /fixture-only|Bearer |synthetic@example/);
    }
    assert.deepEqual(f.calls, []);
  });
}

test('conflicting and differently cased Authorization duplicates are rejected regardless of order', async t => {
  const f = await fixture(t);
  for (const values of [[token, otherToken], ['invalid', token], [token, 'invalid']]) {
    const headers = edge().filter(([name]) => name !== 'Authorization').concat(
      [['Authorization', 'Bearer ' + values[0]], ['aUtHoRiZaTiOn', 'Bearer ' + values[1]]],
    );
    for (const [method, path] of endpoints) assert.equal((await f.send(method, path, { headers })).status, 400);
  }
  assert.deepEqual(f.calls, []);
});

test('duplicate headers are rejected before JSON parsing and errors never reflect their values', async t => {
  const f = await fixture(t);
  const response = await f.send('POST', '/auth/login', {
    headers: edge().concat([['Authorization', 'fixture-private-detail']]), body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(response.body), { error: 'Encabezados HTTP inválidos' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(f.calls, []);
});

test('single critical headers containing comma-separated or empty values are ambiguous', async t => {
  const f = await fixture(t);
  for (const name of ['Authorization', 'Host', 'CF-Connecting-IP', 'X-Forwarded-Proto', 'Content-Type']) {
    for (const value of ['', 'fixture,other']) {
      const headers = edge().map(([key, original]) => [key, key === name ? value : original]);
      assert.equal((await f.send('POST', '/auth/login', { headers })).status, 400, name);
    }
  }
  assert.deepEqual(f.calls, []);
});

test('malformed Host and missing HTTP/1.1 Host fail before authentication', async t => {
  const f = await fixture(t);
  for (const host of ['user@fixture.test', 'fixture.test/path', 'fixture.test?private', 'fixture.test:99999', 'fixture test']) {
    const headers = edge().map(([name, value]) => [name, name === 'Host' ? host : value]);
    assert.equal((await f.send('GET', '/auth/me', { headers })).status, 400);
  }
  assert.equal((await f.send('GET', '/auth/me', { headers: edge().filter(([name]) => name !== 'Host') })).status, 400);
  assert.deepEqual(f.calls, []);
});

test('untrusted TCP peers cannot authorize any auth endpoint with forged forwarding headers', async t => {
  const f = await fixture(t);
  for (const [method, path] of endpoints) {
    const result = await f.send(method, path, {
      peer: '127.0.0.2',
      headers: edge().concat([['Forwarded', 'for=203.0.113.34;proto=https'], ['X-Forwarded-For', '203.0.113.34']]),
    });
    assert.equal(result.status, 403);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
  assert.deepEqual(f.calls, []);
});

test('missing or invalid ingress proof rejects before parsing credentials or consulting sessions', async t => {
  const f = await fixture(t);
  const variants = [
    edge().filter(([name]) => name !== 'CF-Connecting-IP'),
    edge().filter(([name]) => name !== 'X-Forwarded-Proto'),
    edge().map(([name, value]) => [name, name === 'X-Forwarded-Proto' ? 'http' : value]),
    edge().map(([name, value]) => [name, name === 'X-Forwarded-Proto' ? 'HTTPS' : value]),
    edge('not-an-ip'), edge('fe80::1%eth0'), edge('203.0.113.34:443'),
  ];
  for (const headers of variants) {
    for (const [method, path] of endpoints) {
      assert.equal((await f.send(method, path, { headers, body: '{' })).status, 403);
    }
  }
  assert.deepEqual(f.calls, []);
});

test('untrusted or ambiguous requests do not consume a trusted client HTTP budget', async t => {
  const f = await fixture(t, { RATE_LIMIT_MAX: '1' });
  for (let i = 0; i < 4; i++) {
    assert.equal((await f.send('POST', '/auth/login', { peer: '127.0.0.2' })).status, 403);
    assert.equal((await f.send('GET', '/auth/me', { headers: edge().concat([['Authorization', 'invalid']]) })).status, 400);
  }
  assert.equal((await f.send()).status, 200);
  assert.equal((await f.send()).status, 429);
  assert.equal(f.calls.length, 1);
});

test('forged X-Forwarded-For, Forwarded and X-Real-IP cannot bypass the client limit', async t => {
  const f = await fixture(t, { RATE_LIMIT_MAX: '2' });
  for (let i = 0; i < 3; i++) {
    const headers = edge().concat([
      ['X-Forwarded-For', '198.51.100.' + (i + 1)], ['Forwarded', 'for=198.51.100.' + (i + 10) + ';proto=http'],
      ['X-Real-IP', '198.51.100.' + (i + 20)], ['X-Forwarded-Host', 'untrusted.test'],
    ]);
    assert.equal((await f.send('POST', '/auth/login', { headers })).status, i < 2 ? 200 : 429);
  }
  assert.deepEqual(f.calls, [['login', '203.0.113.34'], ['login', '203.0.113.34']]);
  assert.equal((await f.send('POST', '/auth/login', { headers: edge('203.0.113.35') })).status, 200);
  assert.equal(f.app.get('trust proxy'), false);
});

for (const addresses of [
  ['203.0.113.34', '::ffff:203.0.113.34'],
  ['2001:db8::1', '2001:0db8:0000:0000:0000:0000:0000:0001'],
]) {
  test('equivalent client addresses share the same HTTP budget: ' + addresses[0], async t => {
    const f = await fixture(t, { RATE_LIMIT_MAX: '1' });
    assert.equal((await f.send('POST', '/auth/login', { headers: edge(addresses[0]) })).status, 200);
    assert.equal((await f.send('POST', '/auth/login', { headers: edge(addresses[1]) })).status, 429);
    assert.equal(f.calls.length, 1);
  });
}

test('ingress discards forwarding fields after verification and never adopts X-Forwarded-For as fallback', () => {
  const req = {
    socket: { remoteAddress: '::ffff:127.0.0.1' }, ip: '::ffff:127.0.0.1',
    headers: { 'cf-connecting-ip': '203.0.113.34', 'x-forwarded-proto': 'https',
      'x-forwarded-for': '198.51.100.1', forwarded: 'for=198.51.100.2', authorization: 'fixture-only' },
  };
  let continued = 0;
  renderIngress(['127.0.0.1'])(req, {}, () => { continued++; });
  assert.equal(continued, 1);
  assert.equal(hasTrustedRenderHttps(req), true);
  assert.equal(clientAddress(req), '203.0.113.34');
  assert.deepEqual(req.headers, { authorization: 'fixture-only' });
  const untrusted = { socket: { remoteAddress: '127.0.0.2' }, ip: '127.0.0.2',
    headers: { 'cf-connecting-ip': '203.0.113.34', 'x-forwarded-proto': 'https' } };
  renderIngress(['127.0.0.1'])(untrusted, {}, () => {});
  assert.equal(hasTrustedRenderHttps(untrusted), false);
  assert.equal(clientAddress(untrusted), '127.0.0.2');
});

test('valid hosted session, expiration and idempotent logout retain their behavior', async t => {
  const f = await fixture(t);
  assert.equal((await f.send()).status, 200);
  const valid = await f.send('GET', '/auth/me');
  assert.equal(valid.status, 200);
  assert.equal(JSON.parse(valid.body).user.role, 'CLIENTE');
  f.state.expired = true;
  assert.equal((await f.send('GET', '/auth/me')).status, 401);
  f.state.expired = false;
  assert.equal((await f.send('POST', '/auth/logout')).status, 204);
  assert.equal((await f.send('POST', '/auth/logout')).status, 204);
  assert.equal((await f.send('GET', '/auth/me')).status, 401);
});

test('missing or malformed Bearer does not query a session or revoke anything', async t => {
  const f = await fixture(t);
  for (const value of [null, 'Basic fixture', 'Bearer invalid']) {
    const headers = edge().filter(([name]) => name !== 'Authorization');
    if (value !== null) headers.push(['Authorization', value]);
    for (const [method, path] of endpoints.slice(1)) assert.equal((await f.send(method, path, { headers })).status, 401);
  }
  assert.deepEqual(f.calls, []);
});

test('auth-only rejects non-contract methods including implicit HEAD without executing handlers', async t => {
  const f = await fixture(t);
  for (const [allowed, path] of endpoints) {
    const response = await f.send(allowed === 'GET' ? 'POST' : 'GET', path, { body: '' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, allowed);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  const head = await f.send('HEAD', '/auth/me', { body: '' });
  assert.equal(head.status, 405);
  assert.deepEqual(f.calls, []);
});

test('catalog, demo, registration, recovery, upload and administrative routes remain absent', async t => {
  const f = await fixture(t);
  for (const path of [
    '/categories', '/products', '/products/84fb5134-5792-4d3c-a4f0-53690ca9d72d',
    '/demo/products', '/auth/register', '/auth/password-recovery/request', '/auth/password-recovery/confirm',
    '/auth/admin', '/admin', '/internal', '/upload', '/test-email',
  ]) {
    for (const method of ['GET', 'POST']) {
      const result = await f.send(method, path, { body: '{' });
      assert.equal(result.status, 404, method + ' ' + path);
    }
  }
  assert.deepEqual(f.calls, []);
});

test('auth-only stays health-only without AUTH_ENABLED and does not parse disabled login payloads', async t => {
  const f = await fixture(t, {
    AUTH_ENABLED: 'false', AUTH_DATABASE_URL: '', AUTH_RATE_LIMIT_KEY: '', RENDER_TRUSTED_PROXY_IPS: '',
  });
  for (const [method, path] of endpoints) {
    assert.equal((await f.send(method, path, { headers: [['Host', 'fixture.test']], body: '{' })).status, 404);
  }
  const health = await f.send('GET', '/health', { headers: [['Host', 'fixture.test']] });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
  assert.deepEqual(f.calls, []);
});

test('health remains independent of ingress proof and auth HTTP rate limits', async t => {
  const f = await fixture(t, { RATE_LIMIT_MAX: '1' });
  assert.equal((await f.send()).status, 200);
  assert.equal((await f.send()).status, 429);
  for (let i = 0; i < 3; i++) {
    assert.equal((await f.send('GET', '/health', { headers: [['Host', 'fixture.test']], peer: '127.0.0.2' })).status, 200);
  }
});

test('hosted dependency failures use fixed messages and logs without reflecting request data', async t => {
  const f = await fixture(t);
  f.state.failure = true;
  const logs = [];
  t.mock.method(console, 'error', value => logs.push(value));
  for (const [method, path] of endpoints) {
    const response = await f.send(method, path);
    assert.equal(response.status, 503);
    assert.deepEqual(JSON.parse(response.body), { error: 'Servicio de autenticación no disponible' });
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.deepEqual(logs, Array(3).fill('{"level":"error","event":"auth_request_failed"}'));
});

test('auth-only is explicit, opt-in and rejects accidental activation of unrelated modules', () => {
  assert.equal(loadConfig({}).apiProfile, 'shared');
  const inactive = loadConfig({ API_PROFILE: 'auth-only' });
  assert.equal(inactive.apiProfile, 'auth-only');
  assert.equal(inactive.auth, null);
  assert.equal(inactive.database, null);
  assert.equal(inactive.catalogApiEnabled, false);
  for (const name of ['CATALOG_API_ENABLED', 'CATALOG_DEMO_API_ENABLED', 'CLOUDINARY_ENABLED',
    'AUTH_RECOVERY_ENABLED', 'AUTH_REGISTRATION_ENABLED']) {
    assert.throws(() => loadConfig({ API_PROFILE: 'auth-only', [name]: 'true' }), /auth-only/);
    assert.throws(() => loadConfig({ API_PROFILE: 'auth-only', [name]: 'invalid' }), /Configuración inválida/);
  }
  assert.throws(() => loadConfig({ API_PROFILE: 'auth-only', DATABASE_URL: 'fixture-private-detail' }),
    error => !error.message.includes('fixture-private-detail'));
  assert.throws(() => loadConfig({ API_PROFILE: 'unknown-private-value' }),
    error => error.message === 'Configuración inválida: API_PROFILE');
});

test('auth-only still requires verified peers, TLS, hosted mode and the dedicated runtime role', () => {
  for (const override of [
    { RENDER_TRUSTED_PROXY_IPS: '' }, { RENDER_TRUSTED_PROXY_IPS: '0.0.0.0/0' },
    { RENDER_TRUSTED_PROXY_IPS: '10.0.0.0/8' }, { TRUST_PROXY: '1' },
    { AUTH_ALLOW_LOOPBACK_HTTP: 'true' }, { AUTH_MODE: 'pilot' }, { AUTH_RATE_LIMIT_KEY: '' },
    { AUTH_DATABASE_HOST: 'ep-other.region.aws.neon.tech' },
    { AUTH_DATABASE_URL: environment().AUTH_DATABASE_URL.replace('lapape_auth_runtime', 'owner') },
    { AUTH_DATABASE_URL: environment().AUTH_DATABASE_URL.replace('verify-full', 'disable') },
  ]) {
    assert.throws(() => loadConfig(environment(override)), error => !error.message.includes('fixture-only'));
  }
});

test('auth-only blocks catalog even when an injected config bypasses environment validation', async t => {
  const f = await fixture(t, {}, { catalogApiEnabled: true, catalogDemoApiEnabled: true });
  assert.equal((await f.send('GET', '/products')).status, 404);
  assert.equal((await f.send('GET', '/categories')).status, 404);
  assert.equal((await f.send('GET', '/demo/products')).status, 404);
  assert.deepEqual(f.calls, []);
});

test('ambiguous Content-Length with Transfer-Encoding is rejected by the strict HTTP parser', async t => {
  const f = await fixture(t);
  const response = await f.send('POST', '/auth/login', {
    headers: edge().concat([['Content-Length', '5'], ['Transfer-Encoding', 'chunked']]), body: '0\r\n\r\n',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(f.calls, []);
});

test('excessive headers cannot hide a critical duplicate beyond parser limits', async t => {
  const f = await fixture(t);
  const response = await f.send('GET', '/auth/me', {
    headers: edge().concat(Array.from({ length: 2001 }, () => ['x', '']), [['Authorization', 'invalid']]),
  });
  assert.equal(response.status, 431);
  assert.deepEqual(f.calls, []);
});

test('valid auth endpoints consume the shared HTTP limiter exactly once per request', async t => {
  const f = await fixture(t, { RATE_LIMIT_MAX: '3' });
  assert.equal((await f.send()).status, 200);
  assert.equal((await f.send('GET', '/auth/me')).status, 200);
  assert.equal((await f.send('POST', '/auth/logout')).status, 204);
  assert.equal((await f.send('GET', '/auth/me')).status, 429);
  assert.equal(f.calls.length, 3);
});

test('production auth-only starts health-only without credentials or database permission checks', async t => {
  const config = {
    ...loadConfig({ NODE_ENV: 'production', APP_RUNTIME: 'render', API_PROFILE: 'auth-only', PORT: '10000' }),
    host: '127.0.0.1', port: 0,
  };
  const server = await startConfiguredServer(config, {
    authRepository: { verifyPermissions() { throw new Error('Authentication must stay off'); } },
    catalogRepository: { verifyPermissions() { throw new Error('Catalog must stay off'); } },
  });
  if (!server.listening) await once(server, 'listening');
  t.after(() => stopServer(server));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await fetch(base + '/auth/me')).status, 404);
  assert.equal((await fetch(base + '/products')).status, 404);
});

test('contradictory Host and ingress duplicates are rejected before all auth operations', async t => {
  const f = await fixture(t);
  for (const [name, value] of [
    ['Host', 'different.test'], ['CF-Connecting-IP', '203.0.113.35'], ['X-Forwarded-Proto', 'http'],
  ]) {
    for (const [method, path] of endpoints) {
      assert.equal((await f.send(method, path, { headers: edge().concat([[name, value]]) })).status, 400);
    }
  }
  assert.deepEqual(f.calls, []);
});

test('Render Free ingress opt-in is isolated and denied on other services or runtimes', () => {
  const approved = {
    ...environment({ RENDER_TRUSTED_PROXY_IPS: '' }),
    RENDER_FREE_PUBLIC_INGRESS: 'true',
    RENDER: 'true',
    RENDER_SERVICE_ID: 'srv-dc2rth7lk1mc73arpul0',
    RENDER_SERVICE_TYPE: 'web',
    RENDER_EXTERNAL_URL: 'https://la-pape-mobile-auth-tigre10.onrender.com',
  };
  const config = loadConfig(approved);
  assert.equal(config.managedFreeEdge, true);
  assert.equal(config.proxyIps.length, 0);
  assert.equal(config.expectedHost, 'la-pape-mobile-auth-tigre10.onrender.com');
  for (const change of [
    { RENDER: 'false' },
    { RENDER_SERVICE_ID: 'srv-other' },
    { RENDER_SERVICE_TYPE: 'private_service' },
    { RENDER_EXTERNAL_URL: 'https://other.onrender.com' },
    { RENDER_TRUSTED_PROXY_IPS: '127.0.0.1' },
    { NODE_ENV: 'development', APP_RUNTIME: 'local' },
    { API_PROFILE: 'shared' },
  ]) assert.throws(() => loadConfig({ ...approved, ...change }));
  assert.equal(loadConfig({ ...approved, RENDER_FREE_PUBLIC_INGRESS: 'false', RENDER_TRUSTED_PROXY_IPS: '127.0.0.1' }).managedFreeEdge, false);
});

test('Render Free public ingress rejects incorrect Host, scheme or missing CF client', () => {
  const check = renderIngress([], {
    managedFreeEdge: true, expectedHost: 'la-pape-mobile-auth-tigre10.onrender.com',
  });
  const valid = {
    socket: { remoteAddress: '10.1.2.3' }, ip: '10.1.2.3',
    headers: {
      host: 'la-pape-mobile-auth-tigre10.onrender.com',
      'cf-connecting-ip': '203.0.113.44',
      'x-forwarded-proto': 'https',
    },
  };
  const cases = [
    { host: 'other.onrender.com' },
    { 'x-forwarded-proto': 'http' },
    { 'cf-connecting-ip': 'not-an-ip' },
    { 'cf-connecting-ip': undefined },
  ];
  for (const change of cases) {
    const req = { ...valid, headers: { ...valid.headers, ...change } };
    check(req, {}, () => {});
    assert.equal(hasTrustedRenderHttps(req), false);
    assert.equal(clientAddress(req), '10.1.2.3');
  }
  const req = { ...valid, headers: { ...valid.headers } };
  check(req, {}, () => {});
  assert.equal(hasTrustedRenderHttps(req), true);
  assert.equal(clientAddress(req), '203.0.113.44');
  assert.equal(req.headers['cf-connecting-ip'], undefined);
  assert.equal(req.headers['x-forwarded-proto'], undefined);
});
