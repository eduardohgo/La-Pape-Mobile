const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { createRegistrationService } = require('../.test-build/features/auth/servicio-registro.js');
const { createRegistrationController } = require('../.test-build/features/auth/controlador-registro.js');
const { validateRegistrationDraft } = require('../.test-build/features/auth/validacion-registro.js');
const { ApiError } = require('../.test-build/services/http/errores-http.js');
const { parseApiConfig } = require('../.test-build/config/configuracion-api.js');
const config = parseApiConfig({ url: 'https://auth.example.test' }, true);
const challenge = { challengeId: randomUUID(), verificationToken: randomBytes(32).toString('base64url'),
  message: 'Solicitud recibida', expiresInSeconds: 900, retryAfterSeconds: 60, passwordMinCodePoints: 8, passwordMaxBytes: 1024 };
const draft = { name: 'Cuenta de prueba', email: 'cliente+registro@example.test', password: 'Mis cuadernos azules', confirmation: 'Mis cuadernos azules', acceptedTerms: true };
const api = (overrides = {}) => ({ async request() { return challenge; }, async verify() {}, async resend() {}, ...overrides });
test('registration uses only auth origin and exact fields, no Bearer, cookies, roles or legal assertions', async () => {
  const calls = [];
  const service = createRegistrationService(config, async (url, options) => {
    calls.push({ url, ...options });
    return Response.json(url.endsWith('/verify') ? { verified: true } : challenge, { status: url.endsWith('/verify') ? 200 : 202 });
  });
  await service.request({ ...draft, role: 'ADMIN' });
  await service.resend(challenge); await service.verify({ ...challenge, code: '012345' });
  assert.deepEqual(calls.map(call => call.url), [config.baseUrl + '/auth/register', config.baseUrl + '/auth/register/resend', config.baseUrl + '/auth/register/verify']);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].body)).sort(), ['confirmation', 'email', 'name', 'password']);
  for (const call of calls) {
    assert.equal(call.headers.Authorization, undefined); assert.equal(call.credentials, 'omit'); assert.equal(call.redirect, 'error');
  }
});
test('privacy choices are unmarked, promotions stay optional and versioned registration keeps the legacy route separate', async () => {
  const { registrationPrivacy, emptyLegalChoices } = require('../.test-build/features/auth/contratos-privacidad.js');
  const docs = { terms: { version: 'terms-1', body: 'Synthetic terms' },
    notice: { version: 'notice-2', body: 'Synthetic notice', specificPurpose: null } };
  assert.deepEqual(emptyLegalChoices, { termsAccepted: false, noticePresented: false, specificGranted: null, promotions: false });
  assert.equal(registrationPrivacy(docs, emptyLegalChoices), null);
  const choices = { ...emptyLegalChoices, termsAccepted: true, noticePresented: true };
  const legal = registrationPrivacy(docs, choices);
  assert.deepEqual(legal, { ...choices, termsVersion: 'terms-1', noticeVersion: 'notice-2' });
  const specificDocs = { ...docs, notice: { ...docs.notice, specificPurpose: 'partner_transfer' } };
  assert.equal(registrationPrivacy(specificDocs, choices), null);
  assert.equal(registrationPrivacy(specificDocs, { ...choices, specificGranted: false }).specificGranted, false);

  const call = [];
  const service = createRegistrationService(config, async (url, options) => {
    call.push({ url, ...options });
    return options.method === 'GET' ? Response.json(docs) : Response.json(challenge, { status: 202 });
  });
  assert.deepEqual(await service.documents(), docs);
  await service.request(draft, undefined, legal);
  assert.deepEqual(call.map(item => item.url), [config.baseUrl + '/auth/register/v2/documents', config.baseUrl + '/auth/register/v2']);
  assert.deepEqual(JSON.parse(call[1].body).privacy, legal);
  assert.equal(call[1].headers.Authorization, undefined);
  assert.equal(call[1].redirect, 'error');
});

test('registration requires real server status, complete challenge, matching policy and verified=true', async () => {
  for (const body of [{ ...challenge, verificationToken: 'short' }, { ...challenge, passwordMinCodePoints: 15 }, { ...challenge, passwordMinCodePoints: 7 }, { message: 'sent' }]) {
    const service = createRegistrationService(config, async () => Response.json(body, { status: 202 }));
    await assert.rejects(service.request(draft), error => error.kind === 'invalid-response');
  }
  await assert.rejects(createRegistrationService(config, async () => Response.json(challenge)).request(draft));
  await assert.rejects(createRegistrationService(config, async () => Response.json({ verified: false })).verify({ ...challenge, code: '123456' }));
});
test('registration handles bad request, disabled route, provider unavailable and rate limit without reflecting payload', async () => {
  for (const status of [400, 404, 429, 503]) {
    const secret = randomBytes(24).toString('hex');
    const service = createRegistrationService(config, async () => Response.json({ error: secret }, { status, headers: { 'Retry-After': '900' } }));
    await assert.rejects(service.request(draft), error => error.status === status && !error.message.includes(secret));
  }
});
test('password policy counts 8 Unicode characters, ceiling 1024 bytes and rejects malformed Unicode', () => {
  for (const password of ['a'.repeat(7), '\uD800'.repeat(8), '📓'.repeat(257), ' '.repeat(8)])
    assert.ok(validateRegistrationDraft({ ...draft, password, confirmation: password }).password);
  const password = ' 📓'.repeat(4);
  assert.deepEqual(validateRegistrationDraft({ ...draft, password, confirmation: password }), {});
  assert.equal(draft.password, 'Mis cuadernos azules');
});
test('invalid registration is local and never calls backend', async () => {
  let calls = 0; const controller = createRegistrationController(api({ async request() { calls++; return challenge; } }));
  assert.equal(await controller.register({ ...draft, confirmation: 'different' }), false);
  assert.equal(calls, 0);
});
test('controller requests, verifies only on server success, keeps proof outside observable snapshots', async () => {
  let input;
  const controller = createRegistrationController(api({ async verify(value) { input = value; } }));
  assert.equal(await controller.register(draft), true);
  assert.equal(controller.getSnapshot().stage, 'code');
  assert.equal(JSON.stringify(controller.getSnapshot()).includes(challenge.verificationToken), false);
  assert.equal(JSON.stringify(controller.getSnapshot()).includes(draft.password), false);
  assert.equal(await controller.verify('012345'), true);
  assert.equal(input.verificationToken, challenge.verificationToken);
  assert.equal(controller.getSnapshot().stage, 'done');
});
test('incorrect, expired or used OTP never transitions to success', async () => {
  const controller = createRegistrationController(api({ async verify() { throw new ApiError('http', 400); } }));
  await controller.register(draft);
  assert.equal(await controller.verify('123456'), false);
  assert.equal(controller.getSnapshot().stage, 'code'); assert.match(controller.getSnapshot().error, /vencido/);
});
test('code must contain six digits before verification is called', async () => {
  let calls = 0; const controller = createRegistrationController(api({ async verify() { calls++; } }));
  await controller.register(draft);
  for (const code of ['', '12345', '1234567', 'ab1234']) assert.equal(await controller.verify(code), false);
  assert.equal(calls, 0);
});
test('resend respects cooldown, restarts expiry and never claims delivery', async () => {
  let now = 0, calls = 0;
  const controller = createRegistrationController(api({ async resend() { calls++; } }), () => now);
  await controller.register(draft);
  assert.equal(await controller.resend(), false); now = 60000;
  assert.equal(await controller.resend(), true); assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().resendAt, 120000);
  assert.match(controller.getSnapshot().message, /Si corresponde/);
});
test('double presses share only one network operation', async () => {
  let resolve, calls = 0;
  const controller = createRegistrationController(api({ request() { calls++; return new Promise(r => { resolve = r; }); } }));
  const pending = controller.register(draft);
  assert.equal(await controller.register(draft), false);
  resolve(challenge); await pending; assert.equal(calls, 1);
});
test('reset aborts and late registration response cannot restore cancelled proof or navigation', async () => {
  let resolve, signal;
  const controller = createRegistrationController(api({ request(_input, inputSignal) { signal = inputSignal; return new Promise(r => { resolve = r; }); } }));
  const pending = controller.register(draft); controller.reset(); assert.equal(signal.aborted, true);
  resolve(challenge); assert.equal(await pending, false);
  assert.deepEqual(controller.getSnapshot(), { stage: 'form', busy: false });
});
test('temporary network failure permits retry; rate limit and unavailable mail return honest messages', async () => {
  for (const error of [new ApiError('network'), new ApiError('timeout'), new ApiError('http', 429), new ApiError('http', 503), new ApiError('configuration')]) {
    let calls = 0;
    const controller = createRegistrationController(api({ async request() { if (++calls === 1) throw error; return challenge; } }));
    assert.equal(await controller.register(draft), false); assert.equal(controller.getSnapshot().stage, 'form');
    assert.ok(controller.getSnapshot().error);
    assert.equal(await controller.register(draft), true);
  }
});
test('Observer cleanup and independent registration instances do not leak changes', async () => {
  const first = createRegistrationController(api()), second = createRegistrationController(api());
  let notified = 0; const listener = () => notified++;
  const unsubscribe = first.subscribe(listener); first.subscribe(listener);
  await first.register(draft); assert.equal(notified, 3);
  unsubscribe(); await first.verify('123456'); assert.equal(notified, 3);
  assert.equal(second.getSnapshot().stage, 'form');
});
test('closing a pending verification prevents stale success from activating the UI', async () => {
  let resolve; const controller = createRegistrationController(api({ verify() { return new Promise(r => { resolve = r; }); } }));
  await controller.register(draft); const pending = controller.verify('123456');
  controller.reset(); resolve(); assert.equal(await pending, false); assert.equal(controller.getSnapshot().stage, 'form');
});
