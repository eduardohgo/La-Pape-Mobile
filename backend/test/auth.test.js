import test from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { createPasswordHasher } from '../src/services/credenciales-argon2id.js';
import { createAuthService } from '../src/services/servicio-auth.js';
import { validateLogin, readBearer } from '../src/validators/validacion-login.js';
import { stopServer } from '../src/server.js';

const randomSecret = () => crypto.randomBytes(32).toString('base64url');

function fixture({ active = true, databaseError = false, allowLoopbackHttp = true } = {}) {
  const password = randomSecret();
  const wrong = randomSecret();
  const passwordHash = crypto.randomBytes(32).toString('hex');
  const user = { id: crypto.randomUUID(), name: 'Prueba', email: 'cuenta@example.test', role: 'CLIENTE' };
  const credential = { id: user.id, passwordHash, securityVersion: '1', registrationVersion: '1' };
  const sessions = new Map();
  const verifications = [];
  let failures = 0;
  let expired = false;
  const repository = {
    async reserve() {
      if (databaseError) throw new Error(randomSecret());
      return failures < 5;
    },
    async candidate(emailKey) {
      return active && emailKey === user.email ? credential : null;
    },
    async finish(_keys, _attempt, candidate, _sessionId, hash) {
      if (!candidate) {
        failures++;
        return { status: 'invalid' };
      }
      assert.equal(hash.length, 32);
      const date = new Date(Date.now() + 60000).toISOString();
      const session = { user, expiresAt: date, idleExpiresAt: date };
      sessions.set(hash.toString('hex'), session);
      return { status: 'ok', ...session };
    },
    async session(hash) {
      return expired ? null : sessions.get(hash.toString('hex')) ?? null;
    },
    async revoke(hash) {
      sessions.delete(hash.toString('hex'));
    },
  };
  const hasher = {
    async verify(value, stored) {
      verifications.push(stored !== undefined);
      return stored === passwordHash && value === password;
    },
  };
  const service = createAuthService(repository, hasher, crypto.randomBytes(32));
  const app = createApp({ ...loadConfig({ NODE_ENV: 'test' }), auth: { allowLoopbackHttp } }, { authService: service });
  return { app, user, password, wrong, sessions, verifications, expire: () => { expired = true; } };
}

async function serve(t, options) {
  const state = fixture(options);
  const server = state.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  const base = 'http://127.0.0.1:' + server.address().port;
  const login = (password = state.password, email = state.user.email, extra = {}) =>
    fetch(base + '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...extra }),
    });
  const session = (token) => fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  const logout = (token) => fetch(base + '/auth/logout', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token },
  });
  return { ...state, login, session, logout };
}

test('login normalizes email only and rejects malformed or privileged payloads', () => {
  const password = ' ' + randomSecret() + ' ';
  assert.deepEqual(validateLogin({ email: ' CUENTA@EXAMPLE.TEST ', password }),
    { emailKey: 'cuenta@example.test', password });
  for (const body of [
    { email: 'invalid', password }, { email: 'a@example.test', password: '   ' },
    { email: 'a@example.test', password: 'a'.repeat(1025) }, { email: 'a@example.test', password: '\uD800' },
    { email: 'a@example.test', password, role: 'ADMIN' }, [], null,
  ]) assert.equal(validateLogin(body), null);
  assert.equal(readBearer('Bearer ' + 'x'.repeat(42) + 'Z'), null);
});

test('Argon2id hashes with random salts and verifies exact input and canonical PHC', {
  skip: typeof crypto.argon2 !== 'function' && 'El proveedor nativo requiere Node.js 24.7+',
}, async () => {
  const hasher = createPasswordHasher();
  const password = ' ' + randomSecret() + ' ';
  const hash = await hasher.hash(password);
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(await hasher.hash(password), hash);
  assert.equal(await hasher.verify(password, hash), true);
  assert.equal(await hasher.verify(password.trim(), hash), false);
  assert.equal(await hasher.verify(password, hash.replace('m=19456', 'm=1048576')), false);
  assert.equal(await hasher.verify(password, undefined), false);
});

test('login returns a revocable Bearer and sends only its SHA-256 hash to the repository', async t => {
  const f = await serve(t);
  const response = await f.login(f.password, f.user.email.toUpperCase());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.tokenType, 'Bearer');
  assert.deepEqual(result.user, f.user);
  const digest = crypto.createHash('sha256').update(Buffer.from(result.accessToken, 'base64url')).digest('hex');
  assert.equal(f.sessions.has(digest), true);
  assert.equal(f.sessions.has(result.accessToken), false);
  assert.equal(JSON.stringify(result).includes(f.password), false);
});

test('wrong password, missing user and inactive user return the same generic 401', async t => {
  const active = await serve(t);
  const inactive = await serve(t, { active: false });
  const outcomes = [];
  for (const response of [
    await active.login(active.wrong), await active.login(active.password, 'desconocido@example.test'),
    await inactive.login(),
  ]) {
    assert.equal(response.status, 401);
    outcomes.push(await response.json());
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
  assert.deepEqual(active.verifications, [true, false]);
  assert.deepEqual(inactive.verifications, [false]);
});

test('attempt budget rejects before additional password derivation', async t => {
  const f = await serve(t);
  for (let i = 0; i < 5; i++) assert.equal((await f.login(f.wrong)).status, 401);
  const blocked = await f.login();
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
  assert.equal(f.verifications.length, 5);
});

test('valid session returns the public user and expired session returns 401', async t => {
  const f = await serve(t);
  const { accessToken } = await (await f.login()).json();
  const valid = await f.session(accessToken);
  assert.equal(valid.status, 200);
  assert.deepEqual((await valid.json()).user, f.user);
  f.expire();
  assert.equal((await f.session(accessToken)).status, 401);
});

test('logout is idempotent and invalidates the Bearer', async t => {
  const f = await serve(t);
  const { accessToken } = await (await f.login()).json();
  assert.equal((await f.logout(accessToken)).status, 204);
  assert.equal((await f.logout(accessToken)).status, 204);
  assert.equal((await f.session(accessToken)).status, 401);
});

test('rejects extra fields and insecure transport, sanitizes dependency errors', async t => {
  const failed = await serve(t, { databaseError: true });
  assert.equal((await failed.login(failed.password, failed.user.email, { role: 'ADMIN' })).status, 400);
  const unavailable = await failed.login();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'Servicio de autenticación no disponible' });
  const insecure = await serve(t, { allowLoopbackHttp: false });
  assert.equal((await insecure.login()).status, 403);
  assert.equal(insecure.verifications.length, 0);
});

test('pilot configuration is opt-in, excludes production and keeps secrets out of JSON', () => {
  const key = randomSecret();
  const dbPassword = randomSecret();
  const env = {
    AUTH_ENABLED: 'true',
    AUTH_DATABASE_URL: 'postgresql://lapape_auth_runtime:' + dbPassword + '@localhost/lapape_mobile_dev',
    AUTH_RATE_LIMIT_KEY: key,
  };
  assert.equal(loadConfig({}).auth, null);
  assert.throws(() => loadConfig({ AUTH_JWT_ENABLED: 'true' }), /JWT requiere/);
  assert.throws(() => loadConfig({ ...env, AUTH_JWT_ENABLED: 'true' }), /JWT requiere/);
  assert.throws(() => loadConfig({ ...env, NODE_ENV: 'production' }), /piloto/);
  assert.throws(() => loadConfig({ ...env, AUTH_DATABASE_URL: env.AUTH_DATABASE_URL.replace('lapape_auth_runtime', 'owner') }));
  assert.throws(() => loadConfig({ ...env, AUTH_RATE_LIMIT_KEY: '' }));
  const serialized = JSON.stringify(loadConfig(env));
  assert.equal(serialized.includes(key), false);
  assert.equal(serialized.includes(dbPassword), false);
});
