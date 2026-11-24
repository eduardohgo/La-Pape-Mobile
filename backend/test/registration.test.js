import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { createRegistrationService } from '../src/services/servicio-registro.js';
import { createRegistrationMailer } from '../src/services/correo-registro.js';
import { validateSignup, validateSignupChallenge } from '../src/validators/validacion-alta.js';
const secret = () => randomBytes(32).toString('base64url');
const draft = { name: 'Cuenta sintética', email: 'Cliente+alta@example.test', password: 'Un cuaderno muy azul', confirmation: 'Un cuaderno muy azul' };
const registrationEnv = () => ({ NODE_ENV: 'test', API_PROFILE: 'auth-only', AUTH_ENABLED: 'true',
  AUTH_ALLOW_LOOPBACK_HTTP: 'true', AUTH_DATABASE_URL: 'postgresql://lapape_auth_runtime:synthetic@localhost/lapape_mobile_dev',
  AUTH_RATE_LIMIT_KEY: secret(), AUTH_REGISTRATION_ENABLED: 'true', AUTH_REGISTRATION_HMAC_KEY: secret(),
  AUTH_MAIL_PROVIDER: 'brevo', AUTH_MAIL_FROM: 'no-reply@example.test', BREVO_API_KEY: secret() });
function fixture({ duplicate = false, deliveryError = false, allowed = true } = {}) {
  const calls = [], delivered = [];
  let saved;
  const repository = {
    async registrationBudget(...args) { calls.push(args); return allowed; },
    async prepareRegistration(name, email, phc, id, proof, code) { saved = { id, proof, code, name, email, phc }; return duplicate ? null : { email }; },
    async resendRegistration(id, proof, code) { saved = { ...saved, id, proof, code }; return { email: draft.email }; },
    async registrationDelivery(id, code, sent) { calls.push({ id, code, sent }); },
    async confirmRegistration(id, proof, code) { return saved?.id === id && saved.proof.equals(proof) && saved.code.equals(code); },
  };
  const service = createRegistrationService(repository, { async hash(password) { assert.equal(password, draft.password); return 'synthetic-phc'; } },
    { key: randomBytes(32), mailer: { async send(email, code) { if (deliveryError) throw Error(secret()); delivered.push({ email, code }); } } });
  return { repository, service, delivered, calls, saved: () => saved };
}
async function serve(t, registrationService) {
  const config = loadConfig(registrationEnv());
  const app = createApp(config, { authService: {}, registrationService });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.locals.closeDatabases(); });
  return (path, body, method = 'POST') => fetch('http://127.0.0.1:' + server.address().port + path,
    { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) });
}

test('registration rejects duplicate critical headers before handling registration or OTP', async t => {
  const { request } = await import('node:http'); let calls = 0;
  const app = createApp(loadConfig(registrationEnv()), { authService: {}, registrationService: {
    request() { calls++; }, resend() { calls++; }, verify() { calls++; }, close() {} } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.locals.closeDatabases(); });
  for (const endpoint of ['register', 'register/resend', 'register/verify']) for (const name of ['Authorization', 'Host', 'CF-Connecting-IP', 'X-Forwarded-Proto']) {
    const status = await new Promise((resolve, reject) => {
      const headers = ['Content-Type', 'application/json'];
      if (name !== 'Host') headers.push('Host', 'localhost');
      headers.push(name, 'synthetic', name, 'synthetic');
      const req = request({ hostname: '127.0.0.1', port: server.address().port, path: '/auth/' + endpoint,
        method: 'POST', headers }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end('{}');
    });
    assert.equal(status, 400);
  }
  assert.equal(calls, 0);
});
test('registration never trusts forged metadata without the existing verified ingress proof', async t => {
  let calls = 0;
  const config = loadConfig(registrationEnv());
  const app = createApp({ ...config, runtime: 'render', proxyIps: [], auth: { hosted: true, registration: {} } },
    { authService: {}, registrationService: { request() { calls++; }, close() {} } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await app.locals.closeDatabases(); });
  for (const route of ['register', 'register/resend', 'register/verify']) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/auth/' + route, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.20', 'X-Forwarded-Proto': 'https' }, body: '{}' });
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0); assert.equal(app.get('trust proxy'), false);
});

test('registration accepts only exact confirmed fields, 8 Unicode characters, and never privileged roles', () => {
  assert.ok(validateSignup(draft));
  for (const body of [{ ...draft, role: 'ADMIN' }, { ...draft, permissions: [] }, { ...draft, password: 'a'.repeat(7), confirmation: 'a'.repeat(7) },
    { ...draft, confirmation: 'different' }, { ...draft, password: '\uD800'.repeat(15) }, { ...draft, password: 'x'.repeat(1025) }]) assert.equal(validateSignup(body), null);
  const password = '📓'.repeat(15);
  assert.equal(validateSignup({ ...draft, password, confirmation: password }).password, password);
});
test('challenge requires canonical proof, UUID and six numeric digits without extra fields', () => {
  const data = { challengeId: randomUUID(), verificationToken: secret(), code: '012345' };
  assert.ok(validateSignupChallenge(data, true));
  for (const bad of [{ ...data, code: '12345' }, { ...data, code: '1234567' }, { ...data, role: 'CLIENTE' }, { ...data, verificationToken: 'short' }])
    assert.equal(validateSignupChallenge(bad, true), null);
});
test('registration remains opt-in and rejects missing mail, weak keys and shared-profile activation', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).auth, null);
  for (const change of [{ API_PROFILE: 'shared' }, { AUTH_ENABLED: 'false' }, { BREVO_API_KEY: '' }, { AUTH_MAIL_PROVIDER: 'smtp' },
    { AUTH_REGISTRATION_HMAC_KEY: 'x'.repeat(43) }]) assert.throws(() => loadConfig({ ...registrationEnv(), ...change }));
});
test('registration secrets are not serialized and observer cannot coexist with auth', () => {
  const env = registrationEnv(), config = loadConfig(env);
  for (const value of [env.AUTH_DATABASE_URL, env.AUTH_RATE_LIMIT_KEY, env.AUTH_REGISTRATION_HMAC_KEY, env.BREVO_API_KEY, env.AUTH_MAIL_FROM])
    assert.equal(JSON.stringify(config).includes(value), false);
  assert.throws(() => loadConfig({ ...env, INGRESS_OBSERVER_ENABLED: 'true' }));
});
test('service persists only proof SHA-256 and keyed OTP digest, with random challenges', async () => {
  const f = fixture(), result = await f.service.request(validateSignup(draft), '127.0.0.1');
  await f.service.close();
  assert.equal(result.status, 'accepted'); assert.equal(result.data.expiresInSeconds, 900);
  assert.equal(f.saved().proof.length, 32); assert.equal(f.saved().code.length, 32);
  assert.equal(JSON.stringify(result).includes(f.delivered[0].code), false);
  assert.equal(f.saved().code.toString().includes(f.delivered[0].code), false);
  assert.equal(await f.service.verify({ challengeId: result.data.challengeId, verificationToken: result.data.verificationToken, code: f.delivered[0].code }, '127.0.0.1').then(r => r.status), 'verified');
  assert.equal(f.calls[0][0].length, 32);
});
test('duplicate email gets same generic acceptance and derivation but no email or account details', async () => {
  const f = fixture({ duplicate: true }); const result = await f.service.request(validateSignup(draft), '127.0.0.1'); await f.service.close();
  assert.equal(result.status, 'accepted'); assert.equal(f.delivered.length, 0);
  assert.equal(JSON.stringify(result).includes(draft.email), false);
});
test('shared budget denies before Argon2 or mail work', async () => {
  const f = fixture({ allowed: false });
  assert.equal((await f.service.request(validateSignup(draft), 'origin')).status, 'limited');
  assert.equal(f.saved(), undefined); assert.equal(f.delivered.length, 0);
});
test('failed mail does not mark delivery successful or return false verification success', async () => {
  const f = fixture({ deliveryError: true }); const result = await f.service.request(validateSignup(draft), 'origin'); await f.service.close();
  assert.equal(result.status, 'accepted'); assert.equal(f.calls.at(-1).sent, false);
  assert.match(result.data.message, /No se ha activado/);
});
test('resend rotates the keyed code and previous code cannot match current verification', async () => {
  const f = fixture(); const result = await f.service.request(validateSignup(draft), 'origin'); await f.service.close();
  const before = Buffer.from(f.saved().code);
  await f.service.resend(result.data, 'origin'); await f.service.close();
  assert.equal(before.equals(f.saved().code), false);
});
test('HTTP registration validates, returns 202/no-store, and keeps unrelated routes absent', async t => {
  const f = fixture(), post = await serve(t, f.service);
  let response = await post('/auth/register', { ...draft, role: 'DUENO' }); assert.equal(response.status, 400);
  response = await post('/auth/register', draft); assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json(); await f.service.close();
  response = await post('/auth/register/verify', { challengeId: data.challengeId, verificationToken: data.verificationToken, code: f.delivered[0].code });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { verified: true });
  for (const path of ['/products', '/categories', '/demo/products', '/admin', '/auth/password-recovery/request'])
    assert.equal((await post(path, {}, 'GET')).status, 404);
  assert.equal((await post('/auth/register', {}, 'GET')).status, 405);
  assert.equal((await post('/health', {}, 'GET')).status, 200);
});
test('HTTP errors use fixed generic messages and rate limit never reflects secrets', async t => {
  const sensitive = secret();
  const post = await serve(t, { async request() { throw Error(sensitive); } });
  const response = await post('/auth/register', draft);
  assert.equal(response.status, 503); assert.equal((await response.text()).includes(sensitive), false);
});
test('HTTP exhausted budget and invalid OTP have distinct safe responses', async t => {
  const post = await serve(t, { async request() { return { status: 'limited' }; }, async verify() { return { status: 'invalid' }; } });
  const limited = await post('/auth/register', draft); assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '900');
  const invalid = await post('/auth/register/verify', { challengeId: randomUUID(), verificationToken: secret(), code: '123456' });
  assert.equal(invalid.status, 400);
});
test('Brevo adapter uses fixed HTTPS endpoint and server key without following redirects', async () => {
  const apiKey = secret(); let call;
  const mailer = createRegistrationMailer({ apiKey, sender: 'no-reply@example.test' }, async (url, options) => {
    call = { url, ...options }; return Response.json({ messageId: 'synthetic' }, { status: 201 });
  });
  await mailer.send('recipient@example.test', '012345');
  assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email'); assert.equal(call.redirect, 'error');
  assert.equal(call.headers['api-key'], apiKey); assert.match(JSON.parse(call.body).textContent, /012345/);
});
test('Brevo delivery times out safely and aborts without leaking provider details', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let signal;
  const mailer = createRegistrationMailer({ apiKey: secret(), sender: 'sender@example.test' }, (_url, options) => {
    signal = options.signal; return new Promise(() => {});
  });
  const pending = mailer.send('recipient@example.test', '123456');
  t.mock.timers.tick(5000);
  await assert.rejects(pending, /no disponible/); assert.equal(signal.aborted, true);
});
test('Brevo refuses failed or malformed provider responses without reflecting their payloads', async () => {
  const sensitive = secret();
  for (const request of [async () => Response.json({ error: sensitive }, { status: 429 }), async () => Response.json({}, { status: 201 }), async () => { throw Error(sensitive); }]) {
    await assert.rejects(createRegistrationMailer({ apiKey: sensitive, sender: 'no-reply@example.test' }, request).send('r@example.test', '123456'),
      error => !error.message.includes(sensitive) && /no disponible/.test(error.message));
  }
});
