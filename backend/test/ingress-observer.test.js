import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { connect } from 'node:net';
import test from 'node:test';
import { Client, Pool } from 'pg';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { createIngressObserver } from '../src/middlewares/observador-ingreso.js';
import { hasTrustedRenderHttps, renderIngress } from '../src/middlewares/ingreso-render.js';
import { startConfiguredServer, stopServer } from '../src/server.js';

const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
function environment(overrides = {}) {
  return {
    NODE_ENV: 'production', APP_RUNTIME: 'render', PORT: '10000', API_PROFILE: 'auth-only',
    AUTH_ENABLED: 'false', INGRESS_OBSERVER_ENABLED: 'true', INGRESS_OBSERVER_EXPIRES_AT: future(),
    ...overrides,
  };
}

function request(headers = [], { path = '/health', method = 'GET' } = {}) {
  return { method, path, socket: {}, rawHeaders: [
    'Host', 'fixture.test', 'X-LaPape-Ingress-Case', 'baseline', ...headers,
  ] };
}
function response(status = 200) {
  const res = new EventEmitter();
  res.statusCode = status;
  return res;
}
function localObserver({ now, monotonicNow, expiresAt, write } = {}) {
  const records = [];
  const config = { ...loadConfig({ API_PROFILE: 'auth-only' }),
    ingressObserver: { expiresAt: expiresAt ?? Date.now() + 10000 } };
  const middleware = createIngressObserver(config, {
    write: write ?? (entry => records.push(entry)), now, monotonicNow,
  });
  return { config, records, middleware };
}

async function serve(t, overrides = {}, options = {}) {
  const config = loadConfig(environment(overrides));
  const records = [];
  const app = createApp(config, {
    ingressObserverLogger: options.defaultLogger ? undefined : entry => records.push(entry),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  async function send({
    method = 'GET', path = '/health', headers = [], body = '', omitCase = false,
  } = {}) {
    const wire = [method + ' ' + path + ' HTTP/1.1', 'Host: fixture.test',
      ...(omitCase ? [] : ['X-LaPape-Ingress-Case: baseline']),
      ...headers, 'Content-Length: ' + Buffer.byteLength(body), 'Connection: close', '', '',
    ].join('\r\n') + body;
    const result = await new Promise((resolve, reject) => {
      const socket = connect({ host: '127.0.0.1', port: server.address().port }, () => socket.write(wire));
      let data = '';
      socket.setTimeout(3000, () => socket.destroy(new Error('Local observer fixture timeout')));
      socket.on('data', chunk => { data += chunk; });
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });
    const separator = result.indexOf('\r\n\r\n');
    const head = result.slice(0, separator).split('\r\n');
    const responseHeaders = Object.fromEntries(head.slice(1).map(line => {
      const i = line.indexOf(':');
      return [line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()];
    }));
    return { status: Number(/^HTTP\/1\.1 (\d+)/.exec(head[0])?.[1]),
      headers: responseHeaders, body: result.slice(separator + 4) };
  }
  return { config, app, records, send };
}

test('observation is opt-in and requires explicit auth-only with AUTH_ENABLED=false', () => {
  assert.equal(loadConfig({}).ingressObserver, null);
  assert.equal(loadConfig({ INGRESS_OBSERVER_ENABLED: 'false', INGRESS_OBSERVER_EXPIRES_AT: 'ignored-invalid' }).ingressObserver, null);
  for (const override of [
    { API_PROFILE: 'shared' }, { AUTH_ENABLED: 'true' }, { AUTH_ENABLED: undefined }, { AUTH_ENABLED: 'invalid' },
    { INGRESS_OBSERVER_ENABLED: 'invalid' },
  ]) assert.throws(() => loadConfig(environment(override)));
  assert.ok(loadConfig(environment()).ingressObserver);
});

test('invalid observation plus auth fails before reading any authentication credential', () => {
  const env = environment({ AUTH_ENABLED: 'true' });
  Object.defineProperty(env, 'AUTH_DATABASE_URL', { get() { throw new Error('Must not read a credential'); } });
  assert.throws(() => loadConfig(env), /observador requiere/);
});

test('observation with auth disabled never reads the unused authentication credential', () => {
  const env = environment();
  Object.defineProperty(env, 'AUTH_DATABASE_URL', { get() { throw new Error('Must not read a credential'); } });
  assert.equal(loadConfig(env).auth, null);
});

test('observation requires a canonical bounded deadline without reflecting invalid input', () => {
  for (const input of [undefined, '', 'fixture-private-value', '2026-99-99T00:00:00.000Z',
    '2026-11-23', new Date().toISOString().replace('.000Z', 'Z').replace(/\.\d{3}Z$/, 'Z'),
    new Date(Date.now() + 31 * 60 * 1000).toISOString()]) {
    assert.throws(() => loadConfig(environment({ INGRESS_OBSERVER_EXPIRES_AT: input })),
      error => error.message === 'Configuración inválida: INGRESS_OBSERVER_EXPIRES_AT');
  }
});

test('an expired observer does not permit simultaneous authentication', () => {
  assert.throws(() => loadConfig(environment({
    AUTH_ENABLED: 'true', INGRESS_OBSERVER_EXPIRES_AT: '2020-01-01T00:00:00.000Z',
  })), /observador requiere/);
});

test('an injected config cannot enable observation alongside auth or other modules', () => {
  const config = loadConfig(environment());
  for (const change of [
    { auth: {} }, { apiProfile: 'shared' }, { database: {} }, { catalogApiEnabled: true },
    { catalogDemoApiEnabled: true }, { cloudinary: {} },
  ]) assert.throws(() => createApp({ ...config, ...change }), /observador requiere/);
});

test('auth-only restrictions and trust-proxy checks remain enforced with observation enabled', () => {
  for (const override of [
    { CATALOG_API_ENABLED: 'true' }, { CATALOG_DEMO_API_ENABLED: 'true' }, { CLOUDINARY_ENABLED: 'true' },
    { AUTH_REGISTRATION_ENABLED: 'true' }, { AUTH_RECOVERY_ENABLED: 'true' },
    { DATABASE_URL: 'fixture-private-value' }, { TRUST_PROXY: '1' },
    { RENDER_TRUSTED_PROXY_IPS: '0.0.0.0/0' }, { RENDER_TRUSTED_PROXY_IPS: '10.0.0.0/8' },
  ]) assert.throws(() => loadConfig(environment(override)), error => !error.message.includes('fixture-private-value'));
});

test('health body, status and headers remain normal without exposing diagnostic data', async t => {
  const f = await serve(t);
  const result = await f.send({ headers: ['CF-Connecting-IP: 203.0.113.24', 'X-Forwarded-Proto: https'] });
  assert.equal(result.status, 200);
  const body = JSON.parse(result.body);
  assert.deepEqual(Object.keys(body).sort(), ['ok', 'ts']);
  assert.equal(body.ok, true);
  assert.equal(typeof body.ts, 'number');
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.equal(f.app.get('trust proxy'), false);
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].cf_ip_format, 'ipv4');
  assert.equal(f.records[0].forwarded_proto, 'https');
  assert.equal(f.records[0].socket_tls, false);
  assert.equal(f.records[0].trust_assessed, false);
  assert.equal(f.records[0].response_class, 'success');
  assert.doesNotMatch(result.body + JSON.stringify(result.headers), /ingress_observation|cf_ip_format|203\.0\.113/);
});

test('logs contain only fixed schema categories and booleans despite sensitive-looking input', async t => {
  const f = await serve(t, {}, { defaultLogger: true });
  const logs = [];
  t.mock.method(console, 'info', line => logs.push(line));
  const markers = ['fixture-password-private', 'fixture-token-private', 'fixture-cookie-private',
    'fixture-otp-private', 'private-query-marker', '203.0.113.24', 'fixture-private-host'];
  const result = await f.send({
    path: '/health?password=private-query-marker',
    headers: ['Authorization: Bearer fixture-token-private', 'Cookie: session=fixture-cookie-private',
      'CF-Connecting-IP: 203.0.113.24', 'X-Forwarded-Proto: https',
      'X-Forwarded-For: fixture-private-host', 'X-Anything: fixture-otp-private'],
    body: JSON.stringify({ password: markers[0], otp: markers[3] }),
  });
  assert.equal(result.status, 200);
  assert.equal(logs.length, 1);
  const record = JSON.parse(logs[0]);
  const allowed = {
    level: ['info'], event: ['ingress_observation'], probe_case: ['baseline'], method: ['get'],
    socket_tls: [false], cf_ip_format: ['ipv4'], forwarded_proto: ['https'],
    critical_duplicates: [false], forwarded_chain_present: [true], trust_assessed: [false],
    response_class: ['success'],
  };
  assert.deepEqual(Object.keys(record).sort(), Object.keys(allowed).sort());
  for (const [name, value] of Object.entries(record)) assert.ok(allowed[name].includes(value), name);
  for (const marker of markers) assert.equal(logs.join('').includes(marker), false);
});

test('the observer never reads a body, authorization/cookie values, or TCP client IP', () => {
  const f = localObserver();
  const req = request(['Authorization', 'fixture-token-private', 'Cookie', 'fixture-cookie-private']);
  for (const key of ['body', 'headers']) Object.defineProperty(req, key, { get() { throw new Error('Sensitive getter read'); } });
  Object.defineProperty(req.socket, 'remoteAddress', { get() { throw new Error('TCP IP read'); } });
  const res = response();
  let continued = 0;
  f.middleware(req, res, () => { continued++; });
  res.emit('finish');
  assert.equal(continued, 1);
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].trust_assessed, false);
});

for (const name of ['Authorization', 'Host', 'CF-Connecting-IP', 'X-Forwarded-Proto', 'Content-Type']) {
  test('critical duplicate ' + name + ' is observed but still rejected by the existing guard', async t => {
    const f = await serve(t);
    const values = {
      Authorization: ['invalid-one', 'invalid-two'], Host: ['different.test'],
      'CF-Connecting-IP': ['203.0.113.24', '203.0.113.25'],
      'X-Forwarded-Proto': ['https', 'http'], 'Content-Type': ['application/json', 'text/plain'],
    };
    const result = await f.send({ headers: values[name].map(value => name + ': ' + value) });
    assert.equal(result.status, 400);
    assert.deepEqual(JSON.parse(result.body), { error: 'Encabezados HTTP inválidos' });
    assert.equal(f.records.length, 1);
    assert.equal(f.records[0].critical_duplicates, true);
    assert.equal(f.records[0].response_class, 'client-error');
    if (name === 'CF-Connecting-IP') assert.equal(f.records[0].cf_ip_format, 'duplicate');
    if (name === 'X-Forwarded-Proto') assert.equal(f.records[0].forwarded_proto, 'duplicate');
  });
}

test('missing, IPv6 and invalid metadata are descriptive and never become trust evidence', () => {
  for (const [headers, expectedIp, expectedProto] of [
    [[], 'absent', 'absent'],
    [['CF-Connecting-IP', '2001:db8::1', 'X-Forwarded-Proto', 'http'], 'ipv6', 'http'],
    [['CF-Connecting-IP', 'fixture-private-value', 'X-Forwarded-Proto', 'fixture-private-proto'], 'invalid', 'invalid'],
    [['CF-Connecting-IP', 'fe80::1%eth0'], 'invalid', 'absent'],
  ]) {
    const f = localObserver();
    const req = request(headers);
    const res = response();
    f.middleware(req, res, () => {});
    assert.equal(hasTrustedRenderHttps(req), false);
    renderIngress([])(reqWithHeaders(req), {}, () => {});
    res.emit('finish');
    assert.equal(f.records[0].cf_ip_format, expectedIp);
    assert.equal(f.records[0].forwarded_proto, expectedProto);
    assert.equal(f.records[0].trust_assessed, false);
    assert.equal(hasTrustedRenderHttps(req), false);
  }
});
function reqWithHeaders(req) {
  req.headers = Object.fromEntries(Array.from({ length: req.rawHeaders.length / 2 }, (_, i) =>
    [req.rawHeaders[i * 2].toLowerCase(), req.rawHeaders[i * 2 + 1]]));
  req.socket.remoteAddress = '127.0.0.1';
  return req;
}

test('no automatic health-check logs or unrecognized probe labels are emitted', async t => {
  const f = await serve(t);
  assert.equal((await f.send({ omitCase: true })).status, 200);
  assert.equal((await f.send({ omitCase: true, headers: ['X-LaPape-Ingress-Case: fixture-private-case'] })).status, 200);
  assert.equal((await f.send({ headers: ['X-LaPape-Ingress-Case: duplicates'] })).status, 200);
  assert.deepEqual(f.records, []);
});

test('only GET and HEAD /health can be observed and labels are a finite category set', async t => {
  const f = await serve(t);
  const valid = await f.send({ method: 'HEAD', omitCase: true, headers: ['X-LaPape-Ingress-Case: duplicates'] });
  assert.equal(valid.status, 200);
  assert.equal(valid.body, '');
  assert.equal(f.records.length, 1);
  assert.equal(f.records[0].method, 'head');
  assert.equal(f.records[0].probe_case, 'duplicates');
  for (const path of ['/health/other', '/diagnostics', '/ingress', '/auth/me']) {
    assert.equal((await f.send({ path })).status, 404);
  }
  assert.equal((await f.send({ method: 'POST' })).status, 404);
  assert.equal(f.records.length, 1);
});

test('disabled observation emits nothing while health works normally', async t => {
  const f = await serve(t, { INGRESS_OBSERVER_ENABLED: 'false', INGRESS_OBSERVER_EXPIRES_AT: 'ignored-invalid' });
  assert.equal((await f.send({ headers: ['CF-Connecting-IP: 203.0.113.24'] })).status, 200);
  assert.deepEqual(f.records, []);
});

test('expired observation remains silent without breaking startup or health', async t => {
  const f = await serve(t, { INGRESS_OBSERVER_EXPIRES_AT: '2020-01-01T00:00:00.000Z' });
  assert.equal((await f.send()).status, 200);
  assert.deepEqual(f.records, []);
});

test('expiration applies at both request entry and response completion', () => {
  let wall = 1000;
  let monotonic = 0;
  const f = localObserver({ expiresAt: 1100, now: () => wall, monotonicNow: () => monotonic });
  const res = response();
  f.middleware(request(), res, () => {});
  wall = 1100;
  monotonic = 100;
  res.emit('finish');
  assert.deepEqual(f.records, []);
  const late = response();
  f.middleware(request(), late, () => {});
  assert.equal(late.listenerCount('finish'), 0);
});

test('a backwards wall-clock change cannot extend observation beyond its monotonic window', () => {
  let wall = 1000;
  let monotonic = 0;
  const f = localObserver({ expiresAt: 1100, now: () => wall, monotonicNow: () => monotonic });
  wall = -100000;
  monotonic = 101;
  const res = response();
  f.middleware(request(), res, () => {});
  res.emit('finish');
  assert.deepEqual(f.records, []);
});

test('observation records are bounded and instance budgets are isolated', () => {
  const first = localObserver();
  const second = localObserver();
  let continued = 0;
  for (let i = 0; i < 52; i++) {
    const res = response();
    first.middleware(request(), res, () => { continued++; });
    res.emit('finish');
    assert.equal(res.listenerCount('finish'), 0);
    assert.equal(res.listenerCount('close'), 0);
  }
  assert.equal(first.records.length, 50);
  assert.equal(continued, 52);
  const res = response();
  second.middleware(request(), res, () => {});
  res.emit('finish');
  assert.equal(second.records.length, 1);
});

test('aborted responses release subscriptions and never emit completed observations', () => {
  const f = localObserver();
  const res = response();
  let continued = 0;
  f.middleware(request(), res, () => { continued++; });
  assert.equal(res.listenerCount('finish'), 1);
  assert.equal(res.listenerCount('close'), 1);
  res.emit('close');
  res.emit('finish');
  assert.equal(continued, 1);
  assert.equal(res.listenerCount('finish'), 0);
  assert.equal(res.listenerCount('close'), 0);
  assert.deepEqual(f.records, []);
});

test('logger failure stops further diagnostic output and reveals no exception detail', t => {
  const errors = [];
  t.mock.method(console, 'error', line => errors.push(line));
  let writes = 0;
  const f = localObserver({ write() { writes++; throw new Error('fixture-private-exception'); } });
  for (let i = 0; i < 2; i++) {
    const res = response();
    assert.doesNotThrow(() => f.middleware(request(), res, () => {}));
    assert.doesNotThrow(() => res.emit('finish'));
  }
  assert.equal(writes, 1);
  assert.deepEqual(errors, ['{"level":"error","event":"ingress_observer_write_failed"}']);
});

test('observer boot and all disabled routes perform no PostgreSQL connections or queries', async t => {
  const spies = [
    t.mock.method(Pool.prototype, 'connect', () => { throw new Error('Pool connection forbidden'); }),
    t.mock.method(Pool.prototype, 'query', () => { throw new Error('Pool query forbidden'); }),
    t.mock.method(Client.prototype, 'connect', () => { throw new Error('Client connection forbidden'); }),
  ];
  const config = { ...loadConfig(environment()), host: '127.0.0.1', port: 0 };
  const records = [];
  const server = await startConfiguredServer(config, {
    ingressObserverLogger: record => records.push(record),
    authRepository: { verifyPermissions() { throw new Error('Auth repository forbidden'); } },
    catalogRepository: { verifyPermissions() { throw new Error('Catalog repository forbidden'); } },
  });
  if (!server.listening) await once(server, 'listening');
  t.after(() => stopServer(server));
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/health', { headers: { 'X-LaPape-Ingress-Case': 'baseline' } })).status, 200);
  for (const path of [
    '/auth/login', '/auth/me', '/auth/logout', '/auth/register',
    '/auth/password-recovery/request', '/auth/password-recovery/confirm',
    '/categories', '/products', '/demo/products', '/admin', '/internal', '/upload',
  ]) {
    for (const method of ['GET', 'POST']) {
      assert.equal((await fetch(base + path, { method })).status, 404);
    }
  }
  await stopServer(server);
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
  assert.equal(records.length, 1);
});

test('descriptive forwarded headers never populate the trusted-render marker', () => {
  const f = localObserver();
  const req = reqWithHeaders(request(['CF-Connecting-IP', '203.0.113.24', 'X-Forwarded-Proto', 'https']));
  const original = req.rawHeaders.slice();
  const res = response();
  f.middleware(req, res, () => {});
  assert.equal(hasTrustedRenderHttps(req), false);
  assert.deepEqual(req.rawHeaders, original);
  assert.equal(req.headers['cf-connecting-ip'], '203.0.113.24');
  renderIngress([])(req, {}, () => {});
  res.emit('finish');
  assert.equal(hasTrustedRenderHttps(req), false);
  assert.equal(req.headers['cf-connecting-ip'], undefined);
  assert.equal(f.records[0].trust_assessed, false);
});

test('an observed expiration cannot reactivate after the wall clock moves backwards', () => {
  let wall = 1000;
  const f = localObserver({ expiresAt: 1100, now: () => wall, monotonicNow: () => 0 });
  wall = 1100;
  f.middleware(request(), response(), () => {});
  wall = 1000;
  const res = response();
  f.middleware(request(), res, () => {});
  res.emit('finish');
  assert.deepEqual(f.records, []);
  assert.equal(res.listenerCount('finish'), 0);
});
