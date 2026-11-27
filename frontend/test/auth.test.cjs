const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const test = require('node:test');
const { createAuthService } = require('../.test-build/features/auth/servicio-auth.js');
const { createSessionController } = require('../.test-build/features/auth/controlador-sesion.js');
const { validateLogin } = require('../.test-build/features/auth/validacion-login.js');
const { validateRegistrationDraft } = require('../.test-build/features/auth/validacion-registro.js');
const { createHttpClient } = require('../.test-build/services/http/cliente-http.js');
const { ApiError } = require('../.test-build/services/http/errores-http.js');
const { parseApiConfig } = require('../.test-build/config/configuracion-api.js');

const config = parseApiConfig({ url: 'https://api.example.test' }, true);
const now = Date.UTC(2026, 10, 11);
const credentials = { email: 'Cliente+prueba@example.test', password: ' ' + randomBytes(32).toString('hex') + ' ñ ' };
const token = randomBytes(32).toString('base64url');
const session = {
  user: { id: randomUUID(), name: 'Cuenta de prueba', email: credentials.email, role: 'CLIENTE' },
  expiresAt: new Date(now + 120000).toISOString(),
  idleExpiresAt: new Date(now + 60000).toISOString(),
};
const loginResponse = { ...session, tokenType: 'Bearer', accessToken: token };
const errorWith = (kind, status) => (error) => error instanceof ApiError && error.kind === kind && error.status === status;


test('privacy uses only the authenticated origin, whitelists fields and patches only the name', async () => {
  const calls = [];
  const service = createAuthService(config, async (url, options) => {
    calls.push({ url, ...options });
    if (options.method === 'PATCH') return Response.json({ ...session, user: { ...session.user, name: 'Nombre corregido' } });
    return Response.json({ account: { ...session.user, passwordHash: 'synthetic' },
      createdAt: session.idleExpiresAt, emailVerifiedAt: session.idleExpiresAt, decisions: [], token: 'synthetic' });
  });
  const data = await service.readPrivacyData(token);
  assert.equal(data.account.passwordHash, undefined);
  assert.equal(data.token, undefined);
  const changed = await service.updateProfileName(token, 'Nombre corregido');
  assert.equal(changed.user.name, 'Nombre corregido');
  assert.deepEqual(calls.map(call => call.url), [
    config.baseUrl + '/auth/privacy/data', config.baseUrl + '/auth/privacy/profile']);
  assert.deepEqual(JSON.parse(calls[1].body), { name: 'Nombre corregido' });
  for (const call of calls) {
    assert.equal(call.headers.Authorization, 'Bearer ' + token);
    assert.equal(call.credentials, 'omit');
    assert.equal(call.redirect, 'error');
  }
});

test('privacy updates the local session view and clears it when the server reports an expired session', async () => {
  let clears = 0;
  const controller = createSessionController({
    async login() { return { session, token }; },
    async updateProfileName(current, name) { assert.equal(current, token); return { ...session, user: { ...session.user, name } }; },
    async readPrivacyData() { throw new ApiError('http', 401); },
  }, { async read() { return null; }, async save() {}, async clear() { clears++; } }, () => now);
  await controller.restore();
  assert.equal(await controller.login(credentials), true);
  await controller.updateProfileName('Nuevo nombre');
  assert.equal(controller.getSnapshot().session.user.name, 'Nuevo nombre');
  await assert.rejects(controller.readPrivacyData(), errorWith('http', 401));
  assert.equal(controller.getSnapshot().status, 'guest');
  assert.equal(clears, 1);
});

test('opposition uses authenticated private routes and validates states and determinations', async () => {
  const { isOppositionDetail, oppositionReason, isFolio, newPrivacyRequestId } =
    require('../.test-build/features/auth/contratos-privacidad.js');
  const today = session.idleExpiresAt;
  const folio = randomUUID();
  const received = { folio, purpose: 'promotions', status: 'RECEIVED', createdAt: today, respondedAt: null,
    reason: null, determination: null, history: [{ status: 'RECEIVED', recordedAt: today }] };
  const requestId = newPrivacyRequestId();
  assert.ok(isFolio(requestId));
  assert.equal(oppositionReason('promotions', ''), null);
  assert.equal(oppositionReason('account_security', ''), undefined);
  assert.equal(oppositionReason('account_management', '  Motivo sintético '), 'Motivo sintético');
  assert.ok(isOppositionDetail(received));
  assert.equal(isOppositionDetail({ ...received, status: 'RESOLVED' }), false);
  const calls = [];
  const service = createAuthService(config, async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith('/' + folio)) return Response.json(received);
    if (options.method === 'POST') return Response.json(received, { status: 201 });
    return Response.json({ items: [received], nextCursor: null });
  });
  await service.listOppositions(token, folio);
  await service.readOpposition(token, folio);
  await service.createOpposition(token, { requestId, purpose: 'promotions', reason: null, status: 'RESOLVED' });
  assert.equal(calls[0].url, config.baseUrl + '/auth/privacy/requests?cursor=' + folio);
  assert.equal(calls[1].url, config.baseUrl + '/auth/privacy/requests/' + folio);
  assert.deepEqual(JSON.parse(calls[2].body), { requestId, purpose: 'promotions', reason: null });
  await assert.rejects(async () => service.readOpposition(token, '../otro'));
  assert.ok(calls.every(call => call.headers.Authorization === 'Bearer ' + token && call.redirect === 'error'));
});

test('privacy preferences use the persisted decision and submit an explicit opt-in or revocation', async () => {
  let optedIn = false;
  const proposal = randomUUID();
  const service = createAuthService(config, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    if (url.endsWith('/preferences')) return Response.json({ noticeVersion: 'test-3', promotions: optedIn, recordedAt: null });
    assert.equal(url, config.baseUrl + '/auth/privacy/consents/promotions');
    const { requestId, noticeVersion, granted } = JSON.parse(options.body);
    assert.equal(requestId, proposal);
    assert.equal(noticeVersion, 'test-3');
    optedIn = granted;
    return new Response(null, { status: 204 });
  });
  assert.equal((await service.readPrivacyPreferences(token)).promotions, false);
  await service.recordPromotions(token, proposal, 'test-3', true);
  assert.equal((await service.readPrivacyPreferences(token)).promotions, true);
  await service.recordPromotions(token, proposal, 'test-3', false);
  assert.equal((await service.readPrivacyPreferences(token)).promotions, false);
});

test('account deletion sends only current password and explicit consent to auth with Bearer', async () => {
  const service = createAuthService(config, async (url, options) => {
    assert.equal(url, config.baseUrl + '/auth/account/delete');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    assert.deepEqual(JSON.parse(options.body), { password: credentials.password, confirm: true });
    return Response.json({ deleted: true });
  });
  await service.deleteAccount(token, credentials.password);
});

test('confirmed deletion clears saved session and failure keeps the current session', async () => {
  let confirmed = false;
  const { controller, storage } = sessionFixture(token, {
    async deleteAccount(sessionToken) {
      assert.equal(sessionToken, token);
      if (!confirmed) throw new ApiError('http', 422);
    },
    async logout() { assert.fail('Account deletion already revoked every session'); },
  });
  await controller.restore();
  await assert.rejects(controller.deleteAccount(credentials.password), errorWith('http', 422));
  assert.equal(storage.inspect().value, token);
  assert.equal(controller.getSnapshot().status, 'authenticated');
  confirmed = true;
  assert.equal(await controller.deleteAccount(credentials.password), 'deleted');
  assert.equal(storage.inspect().value, null);
  assert.equal(controller.getSnapshot().status, 'guest');
});

test('confirmed account deletion remains successful if SecureStore needs a cleanup retry', async () => {
  const storage = storageFixture(token);
  const clear = storage.clear;
  let calls = 0;
  storage.clear = async () => { if (++calls === 1) throw new Error(); await clear(); };
  const controller = createSessionController({ async me() { return session; }, async deleteAccount() {} }, storage, () => now);
  await controller.restore();
  assert.equal(await controller.deleteAccount(credentials.password), 'cleanup-error');
  assert.equal(controller.getSnapshot().status, 'cleanup-error');
  await controller.retryCleanup();
  assert.equal(storage.inspect().value, null);
});

function storageFixture(saved = null) {
  let value = saved;
  let reads = 0;
  let clears = 0;
  return {
    async read() { reads++; return value; },
    async save(token) { value = token; },
    async clear() { clears++; value = null; },
    inspect() { return { value, reads, clears }; },
  };
}

function sessionFixture(saved = null, methods = {}) {
  const storage = storageFixture(saved);
  const api = {
    async login() { return { session, token }; },
    async me() { return session; },
    async logout() {},
    ...methods,
  };
  let clock = now;
  const controller = createSessionController(api, storage, () => clock);
  return { storage, controller, setTime: (value) => { clock = value; } };
}

test('login form trims only the email and accepts an exact Unicode password without applying registration rules', () => {
  assert.deepEqual(validateLogin('  ' + credentials.email + '  ', credentials.password), { credentials });
  assert.ok(validateLogin(credentials.email, 'a').credentials);
  assert.ok(validateLogin(credentials.email, '📓'.repeat(256)).credentials);
  for (const password of [' ', '\uD800', 'a'.repeat(1025), '📓'.repeat(257)]) {
    assert.equal(typeof validateLogin(credentials.email, password).errors.password, 'string');
  }
  for (const email of ['a@localhost', 'a..b@example.test', 'a@-example.test', 'ñ@example.test', 'x'.repeat(65) + '@example.test']) {
    assert.equal(typeof validateLogin(email, credentials.password).errors.email, 'string');
  }
});

test('registration preview reports all missing fields including the local terms checkbox', () => {
  const errors = validateRegistrationDraft({ name: ' ', email: '', password: ' ', confirmation: '', acceptedTerms: false });
  assert.deepEqual(Object.keys(errors).sort(), ['acceptedTerms', 'confirmation', 'email', 'name', 'password']);
});

const registrationDraft = {
  name: 'Ana Pérez', email: ' cliente+prueba@example.test ', password: 'bocetos!', confirmation: 'bocetos!', acceptedTerms: true,
};

test('registration accepts 8 characters and rejects 7', () => {
  assert.deepEqual(validateRegistrationDraft(registrationDraft), {});
  assert.match(validateRegistrationDraft({ ...registrationDraft, password: 'a'.repeat(7), confirmation: 'a'.repeat(7) }).password, /8 caracteres/);
});

test('registration preview counts Unicode characters rather than UTF-16 units', () => {
  const seven = '📓'.repeat(7);
  const eight = seven + 'ñ';
  assert.ok(validateRegistrationDraft({ ...registrationDraft, password: seven, confirmation: seven }).password);
  assert.deepEqual(validateRegistrationDraft({ ...registrationDraft, password: eight, confirmation: eight }), {});
});

test('registration preview requires an exact password match, valid email and checked terms', () => {
  assert.deepEqual(validateRegistrationDraft({
    ...registrationDraft, email: 'ana@-example.test', confirmation: registrationDraft.password + ' ', acceptedTerms: false,
  }), {
    email: 'Ingresa un correo electrónico válido.',
    confirmation: 'Las contraseñas no coinciden.',
    acceptedTerms: 'Marca la casilla para continuar.',
  });
});

test('auth service sends the real JSON, Bearer header, and 204 contracts over HTTPS', async () => {
  const calls = [];
  const service = createAuthService(config, async (url, request) => {
    calls.push({ url, ...request });
    if (url.endsWith('/login')) return Response.json(loginResponse);
    if (url.endsWith('/me')) return Response.json({ ...session, ignored: 'not part of the session' });
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(await service.login(credentials), { session, token });
  assert.deepEqual(await service.me(token), session);
  assert.equal(await service.logout(token), undefined);
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    [config.baseUrl + '/auth/login', 'POST'],
    [config.baseUrl + '/auth/me', 'GET'],
    [config.baseUrl + '/auth/logout', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].body), credentials);
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers.Authorization, undefined);
  for (const call of calls.slice(1)) {
    assert.equal(call.headers.Authorization, 'Bearer ' + token);
    assert.equal(call.body, undefined);
  }
  for (const call of calls) {
    assert.equal(call.credentials, 'omit');
    assert.equal(call.redirect, 'error');
  }
});

test('auth rejects LAN HTTP before fetching and rejects malformed Bearer header values', async () => {
  let requests = 0;
  const transport = async () => { requests++; throw new Error(); };
  const insecure = createAuthService(parseApiConfig({ url: 'http://192.168.0.2' }, true), transport);
  for (const call of [() => insecure.login(credentials), () => insecure.me(token), () => insecure.logout(token)]) {
    await assert.rejects(call, errorWith('configuration'));
  }
  const https = createAuthService(config, transport);
  await assert.rejects(() => https.me('invalid\r\nheader'), errorWith('configuration'));
  assert.equal(requests, 0);
});

test('auth rejects unexpected success status, invalid sessions, and noncanonical or different token formats', async () => {
  for (const payload of [
    { ...loginResponse, user: { ...session.user, id: 'not-a-uuid' } },
    { ...loginResponse, expiresAt: 'not-a-date' },
    { ...loginResponse, idleExpiresAt: new Date(now + 180000).toISOString() },
    { ...loginResponse, tokenType: 'JWT' },
    { ...loginResponse, accessToken: token.slice(0, -1) + 'B' },
    { ...loginResponse, accessToken: 'foo.bar.baz' },
  ]) {
    await assert.rejects(createAuthService(config, async () => Response.json(payload)).login(credentials), errorWith('invalid-response'));
  }
  const service = createAuthService(config, async () => Response.json({}));
  await assert.rejects(service.me(token), errorWith('invalid-response'));
  await assert.rejects(service.logout(token), errorWith('invalid-response'));
});

test('401, 429, network failures and auth timeouts retain only safe error information', async () => {
  const privateBody = randomBytes(24).toString('hex');
  const unauthorized = createAuthService(config, async () => Response.json({ privateBody }, { status: 401 }));
  await assert.rejects(unauthorized.login(credentials), (error) => errorWith('http', 401)(error) && !error.message.includes(privateBody));
  const limit = createAuthService(config, async () => Response.json({ privateBody }, { status: 429, headers: { 'Retry-After': '900' } }));
  await assert.rejects(limit.login(credentials), (error) => errorWith('http', 429)(error) && error.retryAfterSeconds === 900);
  const network = createAuthService(config, async () => { throw new Error(privateBody); });
  await assert.rejects(network.me(token), (error) => errorWith('network')(error) && !error.message.includes(privateBody));
  const http = createHttpClient({ ...config, timeoutMs: 10 }, async () => new Promise(() => {}));
  await assert.rejects(http.postNoContent('/auth/logout', { bearer: token }), errorWith('timeout'));
});

test('successful login persists only the opaque token and exposes no token or password in session snapshots', async () => {
  const { storage, controller } = sessionFixture();
  const snapshots = [];
  const stop = controller.subscribe(() => snapshots.push(controller.getSnapshot()));
  await controller.restore();
  assert.equal(await controller.login(credentials), true);
  assert.equal(storage.inspect().value, token);
  assert.deepEqual(controller.getSnapshot(), { status: 'authenticated', session });
  stop();
  await controller.logout();
  assert.deepEqual(snapshots.map((state) => state.status), ['restoring', 'guest', 'logging-in', 'authenticated']);
  assert.ok(!JSON.stringify(snapshots).includes(token));
  assert.ok(!JSON.stringify(snapshots).includes(credentials.password));
});

test('without Recordarme the current session works without surviving a fresh controller', async () => {
  const storage = storageFixture();
  let consulted = 0;
  let revoked = 0;
  const api = {
    async login() { return { session, token }; },
    async me(value) { assert.equal(value, token); consulted++; return session; },
    async logout(value) { assert.equal(value, token); revoked++; },
  };
  const current = createSessionController(api, storage, () => now);
  await current.restore();
  assert.equal(await current.login(credentials, false), true);
  assert.equal(storage.inspect().value, null);
  await current.resume();
  assert.equal(current.getSnapshot().status, 'authenticated');

  const reopened = createSessionController(api, storage, () => now);
  await reopened.restore();
  assert.equal(reopened.getSnapshot().status, 'guest');
  assert.equal(consulted, 1);

  await current.logout();
  assert.equal(revoked, 1);
  assert.equal(current.getSnapshot().status, 'guest');
});

test('duplicate login submissions cannot start another request', async () => {
  let finish;
  let attempts = 0;
  const { controller } = sessionFixture(null, {
    login() { attempts++; return new Promise((resolve) => { finish = resolve; }); },
  });
  await controller.restore();
  const first = controller.login(credentials);
  assert.equal(controller.getSnapshot().status, 'logging-in');
  assert.equal(await controller.login(credentials), false);
  finish({ session, token });
  assert.equal(await first, true);
  assert.equal(attempts, 1);
});

test('login displays generic credentials, rate, timeout, network and configuration messages', async () => {
  for (const [error, match] of [
    [new ApiError('http', 401), /Correo o contraseña incorrectos/],
    [new ApiError('http', 429, 900), /15 minutos/],
    [new ApiError('http', 429), /más tarde/],
    [new ApiError('timeout'), /tardó demasiado/],
    [new ApiError('network'), /Revisa tu conexión/],
    [new ApiError('configuration'), /HTTPS/],
    [new ApiError('http', 503), /no está disponible/],
  ]) {
    const { controller, storage } = sessionFixture(null, { async login() { throw error; } });
    await controller.restore();
    assert.equal(await controller.login(credentials), false);
    assert.equal(controller.getSnapshot().status, 'guest');
    assert.match(controller.getSnapshot().message, match);
    assert.equal(storage.inspect().value, null);
  }
});

test('a SecureStore save failure never exposes the session, attempts revocation and clears any partial write', async () => {
  const storage = storageFixture();
  const realSave = storage.save;
  storage.save = async (value) => { await realSave(value); throw new Error('storage unavailable'); };
  let revoked;
  const controller = createSessionController({
    async login() { return { token, session }; },
    async logout(value) { revoked = value; },
  }, storage, () => now);
  await controller.restore();
  assert.equal(await controller.login(credentials), false);
  assert.equal(revoked, token);
  assert.equal(storage.inspect().value, null);
  assert.match(controller.getSnapshot().message, /guardar la sesión/);
});

test('a fresh controller restores from storage only after the server confirms /me', async () => {
  let answer;
  const { controller, storage } = sessionFixture(token, {
    me(value) { assert.equal(value, token); return new Promise((resolve) => { answer = resolve; }); },
  });
  const restoring = controller.restore();
  await Promise.resolve();
  assert.equal(controller.getSnapshot().status, 'restoring');
  answer(session);
  await restoring;
  assert.deepEqual(controller.getSnapshot(), { status: 'authenticated', session });
  assert.equal(storage.inspect().reads, 1);
});

test('401 clears an invalid session; an invalid local token is cleared without a request', async () => {
  const rejected = sessionFixture(token, { async me() { throw new ApiError('http', 401); } });
  await rejected.controller.restore();
  assert.equal(rejected.controller.getSnapshot().status, 'guest');
  assert.match(rejected.controller.getSnapshot().message, /venció/);
  assert.equal(rejected.storage.inspect().value, null);

  let calls = 0;
  const malformed = sessionFixture('invalid', { async me() { calls++; return session; } });
  await malformed.controller.restore();
  assert.equal(calls, 0);
  assert.equal(malformed.storage.inspect().value, null);
});

test('a temporary restore error keeps the token but hides account data until a successful retry', async () => {
  let calls = 0;
  const { controller, storage } = sessionFixture(token, {
    async me() { if (++calls === 1) throw new ApiError('network'); return session; },
  });
  await controller.restore();
  assert.equal(controller.getSnapshot().status, 'restore-error');
  assert.equal(controller.getSnapshot().session, undefined);
  assert.equal(storage.inspect().value, token);
  await controller.restore();
  assert.equal(controller.getSnapshot().status, 'authenticated');
  assert.equal(calls, 2);
});

test('resume revalidates on the server and honors a new inactivity deadline', async () => {
  const renewed = { ...session, idleExpiresAt: new Date(now + 90000).toISOString() };
  let calls = 0;
  const { controller, setTime } = sessionFixture(token, {
    async me() { return ++calls === 1 ? session : renewed; },
  });
  await controller.restore();
  await controller.resume();
  assert.deepEqual(controller.getSnapshot(), { status: 'authenticated', session: renewed });
  setTime(now + 60000);
  await controller.expire();
  assert.equal(controller.getSnapshot().status, 'authenticated');
  setTime(now + 90000);
  await controller.expire();
  assert.equal(controller.getSnapshot().status, 'guest');
  assert.equal(calls, 2);
});

test('login and restore refuse a session already at its deadline', async () => {
  const fresh = sessionFixture();
  await fresh.controller.restore();
  fresh.setTime(now + 120001);
  assert.equal(await fresh.controller.login(credentials), false);
  assert.equal(fresh.storage.inspect().value, null);
  const restored = sessionFixture(token);
  restored.setTime(now + 120001);
  await restored.controller.restore();
  assert.equal(restored.controller.getSnapshot().status, 'guest');
  assert.equal(restored.storage.inspect().value, null);
});

test('logout revokes the Bearer and clears the stored token even when the server is unreachable', async () => {
  for (const unreachable of [false, true]) {
    let logoutCalls = 0;
    const { controller, storage } = sessionFixture(token, {
      async logout(value) {
        assert.equal(value, token);
        logoutCalls++;
        if (unreachable) throw new ApiError('timeout');
      },
    });
    await controller.restore();
    await controller.logout();
    await controller.resume();
    assert.equal(logoutCalls, 1);
    assert.equal(storage.inspect().value, null);
    assert.equal(controller.getSnapshot().status, 'guest');
    if (unreachable) assert.match(controller.getSnapshot().message, /No pudimos confirmar/);
  }
});

test('a local deletion failure hides the account and offers retry without repeating logout', async () => {
  const storage = storageFixture(token);
  const clear = storage.clear;
  let attempts = 0;
  let revocations = 0;
  storage.clear = async () => { if (++attempts === 1) throw new Error(); await clear(); };
  const controller = createSessionController({
    async me() { return session; },
    async logout() { revocations++; },
  }, storage, () => now);
  await controller.restore();
  await controller.logout();
  assert.equal(controller.getSnapshot().status, 'cleanup-error');
  await controller.retryCleanup();
  assert.equal(controller.getSnapshot().status, 'guest');
  assert.equal(storage.inspect().value, null);
  assert.equal(revocations, 1);
});

test('logout removes the local token before remote revocation finishes', async () => {
  let confirm;
  const { controller, storage } = sessionFixture(token, {
    logout() { return new Promise((resolve) => { confirm = resolve; }); },
  });
  await controller.restore();
  const closing = controller.logout();
  assert.equal(controller.getSnapshot().status, 'logging-out');
  assert.equal(storage.inspect().value, null);
  confirm();
  await closing;
  assert.equal(controller.getSnapshot().status, 'guest');
});
