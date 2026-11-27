const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecoveryService } = require('../.test-build/features/auth/servicio-recuperacion.js');
const { createRecoveryController, validateRecoveryPassword, defaultRecoveryPolicy } = require('../.test-build/features/auth/controlador-recuperacion.js');
const { parseApiConfig } = require('../.test-build/config/configuracion-api.js');
const { ApiError } = require('../.test-build/services/http/errores-http.js');
const email = 'cliente@example.test';
const password = 'Contraseña sintética suficiente 🎨';
const policy = defaultRecoveryPolicy;
const config = parseApiConfig({ url: 'https://auth.example.test' }, true);
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({'Content-Type':'application/json'}), json: async () => data });
function fixture(methods = {}) {
  const calls = [];
  let time = 0;
  const controller = createRecoveryController({ request: async (...args) => { calls.push(args); return policy; }, confirm: async (...args) => { calls.push(args); }, ...methods }, () => time);
  return { controller, calls, advance: value => { time += value; } };
}

test('recovery transport uses only the authentication HTTPS origin, sends no token/cookies and honors 202/200 contracts', async () => {
  const calls = [];
  const service = createRecoveryService(config, async (url, options) => {
    calls.push({url,options}); return url.endsWith('/request') ? response(202,{...policy,message:'Solicitud recibida'}) : response(200,{changed:true});
  });
  assert.deepEqual(await service.request(email), policy);
  await service.confirm({email,code:'012345',password});
  assert.deepEqual(calls.map(call=>call.url),['https://auth.example.test/auth/password-recovery/request','https://auth.example.test/auth/password-recovery/confirm']);
  for(const {options} of calls) { assert.equal(options.headers.Authorization,undefined); assert.equal(options.credentials,'omit'); assert.equal(options.redirect,'error'); }
  assert.deepEqual(JSON.parse(calls[1].options.body),{email,code:'012345',password});
  await assert.rejects(createRecoveryService(parseApiConfig({url:'http://192.168.1.10:3443'},true),async()=>{throw new Error('unexpected transport');}).request(email),{kind:'configuration'});
  await assert.rejects(createRecoveryService(config,async()=>response(200,{...policy,message:'bad status'})).request(email),{kind:'invalid-response'});
  await assert.rejects(createRecoveryService(config,async()=>response(202,{changed:true})).confirm({email,code:'012345',password}),{kind:'invalid-response'});
});

test('new passwords obey backend Unicode length/bytes and exact confirmation rather than the registration preview rule', () => {
  assert.deepEqual(validateRecoveryPassword('000001','🎨'.repeat(15),'🎨'.repeat(15)),{});
  for(const value of ['x'.repeat(14),' '.repeat(15),'\uD800'.repeat(15),'🎨'.repeat(257)]) assert.ok(validateRecoveryPassword('000001',value,value).password);
  assert.ok(validateRecoveryPassword('12345',password,password).code);
  assert.ok(validateRecoveryPassword('123456',password,password+' ').confirmation);
  assert.deepEqual(validateRecoveryPassword('123456',' '+password+' ',' '+password+' '),{});
});

test('request validates/canonicalizes email, retains server policy and enforces resend cooldown', async () => {
  const f = fixture();
  assert.equal(await f.controller.request('invalid'),false); assert.equal(f.calls.length,0);
  assert.equal(await f.controller.request(' Cliente@Example.test '),true);
  assert.equal(f.controller.getSnapshot().stage,'code'); assert.equal(f.calls[0][0],email);
  assert.equal(await f.controller.request(),false); assert.equal(f.calls.length,1);
  f.advance(60000); assert.equal(await f.controller.request(),true); assert.equal(f.calls.length,2);
  assert.equal(f.controller.getSnapshot().policy.passwordMinCodePoints,15);
});

test('duplicate requests and stale/cancelled responses cannot advance recovery or notify twice', async () => {
  let release;
  const f = fixture({request:async()=>new Promise(resolve=>{release=resolve;})});
  let changes=0; const listener=()=>{changes++;}; const off=f.controller.subscribe(listener); f.controller.subscribe(listener);
  const pending=f.controller.request(email); assert.equal(changes,1);
  assert.equal(await f.controller.request(email),false);
  f.controller.cancel(); const before=changes; release(policy);
  assert.equal(await pending,false); assert.equal(changes,before); assert.equal(f.controller.getSnapshot().stage,'request');
  off(); f.controller.cancel(); assert.equal(changes,before);
});

test('successful confirmation never keeps password/OTP in snapshots and only advances after backend confirmation', async () => {
  let release, captured;
  const f=fixture({confirm:async input=>{captured=input;return new Promise(resolve=>{release=resolve;});}});
  await f.controller.request(email);
  assert.equal(await f.controller.confirm('123',password,password),false);
  const pending=f.controller.confirm('012345',password,password);
  assert.equal(f.controller.getSnapshot().stage,'code'); assert.equal(f.controller.getSnapshot().busy,true);
  assert.equal(await f.controller.confirm('012345',password,password),false);
  assert.deepEqual(captured,{email,code:'012345',password});
  assert.ok(!JSON.stringify(f.controller.getSnapshot()).includes(password)); assert.ok(!JSON.stringify(f.controller.getSnapshot()).includes('012345'));
  release(); assert.equal(await pending,true); assert.equal(f.controller.getSnapshot().stage,'done');
});

test('incorrect/expired/reused OTP, limits, disabled mail and network errors remain safe and do not report success', async () => {
  for(const error of [new ApiError('http',400),new ApiError('http',429,900),new ApiError('http',503),new ApiError('network'),new Error('private provider secret')]) {
    const f=fixture({confirm:async()=>{throw error;}}); await f.controller.request(email);
    assert.equal(await f.controller.confirm('012345',password,password),false);
    const state=f.controller.getSnapshot(); assert.equal(state.stage,'code'); assert.equal(state.busy,false);
    assert.ok(state.message); assert.ok(!state.message.includes('private provider secret'));
  }
});

test('failed mail configuration does not transition request screen or claim delivery, and Retry-After prevents rapid resends', async () => {
  const f=fixture({request:async()=>{throw new ApiError('http',503);}});
  assert.equal(await f.controller.request(email),false); assert.equal(f.controller.getSnapshot().stage,'request');
  assert.match(f.controller.getSnapshot().message,/no está disponible/);
  let calls=0;
  const limited=fixture({request:async()=>{calls++;throw new ApiError('http',429,900);}});
  await limited.controller.request(email); await limited.controller.request(email); assert.equal(calls,1);
});
