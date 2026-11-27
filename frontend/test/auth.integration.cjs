const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { createAuthService } = require('../.test-build/features/auth/servicio-auth.js');
const { createSessionController } = require('../.test-build/features/auth/controlador-sesion.js');
const { validateLogin } = require('../.test-build/features/auth/validacion-login.js');
const { parseApiConfig } = require('../.test-build/config/configuracion-api.js');

test('mobile login, restoration, logout and revoked-token rejection use the real Express auth routes', async (t) => {
  const { createApp } = await import('../../backend/src/app.js');
  const { loadConfig } = await import('../../backend/src/config/variables-entorno.js');
  const { createAuthService: createBackendAuth } = await import('../../backend/src/services/servicio-auth.js');
  const { stopServer } = await import('../../backend/src/server.js');
  const password = ' ' + randomBytes(32).toString('base64url') + ' ñ ';
  const user = { id: randomUUID(), name: 'Cuenta móvil de prueba', email: 'cliente+prueba@example.test', role: 'CLIENTE' };
  const sessions = new Map();
  const backendAuth = createBackendAuth({
    async reserve() { return true; },
    async candidate(email) { return email === user.email ? user : null; },
    async finish(_keys, _attempt, candidate, _sessionId, hash) {
      if (!candidate) return { status: 'invalid' };
      const now = Date.now();
      const session = { user, expiresAt: new Date(now + 60000).toISOString(), idleExpiresAt: new Date(now + 30000).toISOString() };
      sessions.set(hash.toString('hex'), session);
      return { status: 'ok', ...session };
    },
    async session(hash) { return sessions.get(hash.toString('hex')) ?? null; },
    async revoke(hash) { sessions.delete(hash.toString('hex')); },
  }, {
    async verify(value) { return value === password; },
  }, randomBytes(32));

  const app = createApp({ ...loadConfig({ NODE_ENV: 'test' }), auth: { allowLoopbackHttp: true } }, { authService: backendAuth });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => stopServer(server));
  const config = parseApiConfig({ url: 'https://api.example.test' }, true);
  const transport = (url, options) => {
    // Only the test transport forwards to Express's opt-in HTTP loopback listener.
    assert.equal(new URL(url).origin, config.baseUrl);
    return fetch('http://127.0.0.1:' + server.address().port + new URL(url).pathname, options);
  };
  const service = createAuthService(config, transport);
  let saved = null;
  const storage = {
    async read() { return saved; },
    async save(value) { saved = value; },
    async clear() { saved = null; },
  };
  const initial = createSessionController(service, storage);
  await initial.restore();
  assert.equal(await initial.login({ email: user.email, password: 'incorrecta' }), false);
  assert.match(initial.getSnapshot().message, /Correo o contraseña incorrectos/);
  const validated = validateLogin(' ' + user.email.toUpperCase() + ' ', password);
  assert.equal(await initial.login(validated.credentials), true);
  assert.equal(sessions.size, 1);
  assert.deepEqual(initial.getSnapshot().session.user, user);

  const reopened = createSessionController(service, storage);
  await reopened.restore();
  assert.deepEqual(reopened.getSnapshot().session.user, user);
  const revokedToken = saved;
  await reopened.logout();
  assert.equal(sessions.size, 0);
  assert.equal(saved, null);
  await assert.rejects(service.me(revokedToken), { status: 401 });
});
