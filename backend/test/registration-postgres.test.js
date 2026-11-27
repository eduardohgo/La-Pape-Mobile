import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';
import { Agent, createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import { once } from 'node:events';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { createAuthRepository } from '../src/repositories/repositorio-auth.js';
import { createSessionJwt } from '../src/services/jwt-session-candidate.js';
const secret = () => randomBytes(32).toString('base64url');
test('PostgreSQL 18 disposable integration: migrations, least privilege, registration, OTP and existing sessions', {
  skip: process.env.REGISTRATION_PG_TEST !== '1' && 'Opt in REGISTRATION_PG_TEST=1 with local PostgreSQL 18; never uses DATABASE_URL',
  timeout: process.env.ARCO_F3_ANDROID === '1' ? 960000 : 120000,
}, async t => {
  const bin = process.env.REGISTRATION_POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
  assert.ok(existsSync(path.join(bin, 'initdb.exe')), 'Local PostgreSQL 18 is required');
  assert.match(execFileSync(path.join(bin, 'postgres.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }), /18\./);
  const cache = path.resolve('node_modules/.cache'); mkdirSync(cache, { recursive: true });
  const root = mkdtempSync(path.join(cache, 'registration-pg-'));
  const data = path.join(root, 'data'), ownerPassword = secret(), runtimePassword = secret();
  const passwordFile = path.join(root, 'synthetic.pw');
  writeFileSync(passwordFile, ownerPassword, { mode: 0o600 });
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  let started = false, owner, runtime, app, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (app) await app.locals.closeDatabases(); else await runtime?.close();
    await owner?.end();
    if (started) execFileSync(path.join(bin, 'pg_ctl.exe'), ['-D', data, 'stop', '-m', 'fast', '-w'], { windowsHide: true, stdio: 'pipe' });
    const resolved = realpathSync(root);
    assert.ok(resolved.toLowerCase().startsWith(realpathSync(cache).toLowerCase() + path.sep));
    rmSync(resolved, { recursive: true }); // Only this test's freshly created, verified directory.
  });
  execFileSync(path.join(bin, 'initdb.exe'), ['-D', data, '-U', 'synthetic_owner', '--pwfile=' + passwordFile,
    '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'], { windowsHide: true, stdio: 'pipe' });
  rmSync(passwordFile);
  started = true;
  execFileSync(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-o',
    '-h 127.0.0.1 -p ' + port, 'start', '-w'], { windowsHide: true, stdio: 'ignore', timeout: 30000 });
  started = true;
  const connection = { host: '127.0.0.1', port, user: 'synthetic_owner', password: ownerPassword, ssl: false };
  const bootstrap = new Pool({ ...connection, database: 'postgres' });
  await bootstrap.query('CREATE DATABASE lapape_mobile_dev'); await bootstrap.end();
  owner = new Pool({ ...connection, database: 'lapape_mobile_dev' });
  await owner.query('CREATE ROLE lapape_catalog_reader NOLOGIN');
  for (const name of ['001_catalog_schema.sql', '002_catalog_demo.sql', '003_identity_auth_schema.sql', '004_mobile_auth_runtime.sql', '006_mobile_registration.sql', '007_mobile_account_deletion.sql']) {
    // Resolve actual reviewed 001/002 filenames; no environment URL or remote connection is accepted.
    const names = (await import('node:fs')).readdirSync('db/migrations');
    const file = names.find(value => value.slice(0, 3) === name.slice(0, 3));
    assert.ok(file, name);
    await owner.query(readFileSync(path.join('db/migrations', file), 'utf8'));
  }
  const privacyMigration = readFileSync('db/migrations/008_privacy_arco.sql', 'utf8');
  await owner.query(privacyMigration.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  assert.equal((await owner.query("SELECT to_regnamespace('privacy') AS schema")).rows[0].schema, null);
  await owner.query(privacyMigration);
  const oppositionMigration = readFileSync('db/migrations/009_arco_opposition.sql', 'utf8');
  await owner.query(oppositionMigration.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  assert.equal((await owner.query("SELECT to_regclass('privacy.arco_request_events') AS relation")).rows[0].relation, null);
  await owner.query(oppositionMigration);
  const jwtMigration = readFileSync('db/migrations/010_mobile_jwt_rotation.sql', 'utf8');
  await owner.query(jwtMigration.replace(/COMMIT;\s*$/, 'ROLLBACK;'));
  assert.equal((await owner.query("SELECT to_regprocedure('identity.rotate_mobile_jwt_session(bytea,bytea,uuid)') AS routine")).rows[0].routine, null);
  await owner.query(jwtMigration);
  // Password is synthetic, ephemeral and never emitted or passed as a process argument.
  await owner.query("ALTER ROLE lapape_auth_runtime LOGIN PASSWORD '" + runtimePassword + "'");
  const runtimeConfig = { ...connection, database: 'lapape_mobile_dev', user: 'lapape_auth_runtime', password: runtimePassword };
  runtime = createAuthRepository(runtimeConfig, { registrationEnabled: true, deletionEnabled: true, privacyEnabled: true, jwtEnabled: true });
  await t.test('runtime preflight and actual restrictions on tables, role assignment and other schemas', async () => {
    assert.equal(await runtime.verifyPermissions(), true);
    const pool = new Pool(runtimeConfig);
    for (const sql of ['SELECT * FROM identity.password_credentials', 'SELECT * FROM catalog.products',
      'SELECT * FROM demo.product_previews', 'UPDATE identity.users SET role_code=\'ADMIN\'',
      'SET ROLE lapape_registration_executor']) await assert.rejects(pool.query(sql), error => error.code === '42501');
    await pool.end();
  });
  const mail = []; let rejectMail = false;
  const pair = generateKeyPairSync('ed25519');
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKey = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const jwtSettings = { privateKey, publicKey, issuer: 'https://auth.example.test', audience: 'lapape-mobile', kid: 'lab-1' };
  const config = loadConfig({ NODE_ENV: 'test', RATE_LIMIT_MAX: '400', API_PROFILE: 'auth-only', AUTH_ENABLED: 'true', AUTH_ALLOW_LOOPBACK_HTTP: 'true',
    AUTH_DATABASE_URL: 'postgresql://lapape_auth_runtime:synthetic@localhost/lapape_mobile_dev', AUTH_RATE_LIMIT_KEY: secret(),
    AUTH_JWT_ENABLED: 'true', AUTH_JWT_PRIVATE_KEY_B64: Buffer.from(privateKey).toString('base64'),
    AUTH_JWT_PUBLIC_KEY_B64: Buffer.from(publicKey).toString('base64'), AUTH_JWT_ISSUER: jwtSettings.issuer,
    AUTH_JWT_AUDIENCE: jwtSettings.audience, AUTH_JWT_KID: jwtSettings.kid,
    AUTH_PRIVACY_PHASE1_ENABLED: 'true', AUTH_ACCOUNT_DELETION_ENABLED: 'true', AUTH_REGISTRATION_ENABLED: 'true', AUTH_REGISTRATION_HMAC_KEY: secret(), AUTH_MAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: secret(), AUTH_MAIL_FROM: 'sender@example.test' });
  assert.equal(JSON.stringify(config).includes(privateKey), false);
  app = createApp(config, { authRepository: runtime, registrationMailer: { async send(email, code) {
    if (rejectMail) throw Error('synthetic provider failure'); mail.push({ email, code });
  } } });
  await app.locals.verifyDatabases(); server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, body, token) => fetch(base + '/auth/' + route, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const me = token => fetch(base + '/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  const password = 'Cuadernos con creatividad 📓';
  const draft = email => ({ name: 'Cliente sintético', email, password, confirmation: password });
  const clearBudget = () => owner.query('DELETE FROM identity.auth_rate_limits');
  async function begin(email) {
    await clearBudget();
    const response = await post('register', draft(email)); assert.equal(response.status, 202);
    const body = await response.json();
    // Drain pending mock delivery before inspecting its result; no real provider is contacted.
    for (let i = 0; i < 100; i++) {
      const result = await owner.query('SELECT delivery_state FROM identity.email_verifications WHERE id=$1', [body.challengeId]);
      if (result.rows[0]?.delivery_state !== 'PENDING') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return { challengeId: body.challengeId, verificationToken: body.verificationToken, code: mail.findLast(item => item.email === email)?.code };
  }
  let verified, session;
  await t.test('new user is pending, Argon2id stored, plaintext OTP absent and unverified login denied', async () => {
    verified = await begin('new@example.test');
    const { rows: [row] } = await owner.query('SELECT u.status,u.role_code,c.password_hash,v.token_hash FROM identity.users u JOIN identity.password_credentials c ON c.user_id=u.id JOIN identity.email_verifications v ON v.user_id=u.id WHERE v.id=$1', [verified.challengeId]);
    assert.equal(row.status, 'PENDING_VERIFICATION'); assert.equal(row.role_code, 'CLIENTE');
    assert.match(row.password_hash, /^\$argon2id\$/); assert.equal(row.token_hash.length, 32);
    assert.equal(row.token_hash.toString().includes(verified.code), false);
    assert.equal((await post('login', { email: 'new@example.test', password })).status, 401);
  });
  await t.test('incorrect OTP rejected, correct code atomically activates, reuse denied', async () => {
    await clearBudget();
    const wrong = verified.code === '000000' ? '111111' : '000000';
    assert.equal((await post('register/verify', { ...verified, code: wrong })).status, 400);
    const result = await post('register/verify', verified);
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { verified: true });
    assert.equal((await post('register/verify', verified)).status, 400);
  });
  await t.test('verified login, restoration, incorrect password, logout and revocation', async () => {
    await clearBudget();
    assert.equal((await post('login', { email: 'NEW@example.test', password: 'incorrect-password' })).status, 401);
    const response = await post('login', { email: 'NEW@example.test', password }); assert.equal(response.status, 200);
    session = await response.json(); assert.equal(session.user.role, 'CLIENTE');
    assert.equal((await me(session.accessToken)).status, 200);
    assert.equal((await me(session.accessToken)).status, 200);
    assert.equal((await post('logout', undefined, session.accessToken)).status, 204);
    assert.equal((await me(session.accessToken)).status, 401);
  });
  await t.test('JWT over HTTP uses Ed25519, PostgreSQL session, one-use rotation and opaque V4 compatibility', async () => {
    await clearBudget();
    const login = await fetch(base + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Format': 'jwt-v1' },
      body: JSON.stringify({ email: 'new@example.test', password }) });
    assert.equal(login.status, 200);
    const issued = await login.json();
    assert.equal(issued.tokenFormat, 'jwt');
    const signer = createSessionJwt(jwtSettings);
    const claims = signer.validate(issued.accessToken);
    assert.equal(claims.sub, issued.user.id);
    assert.ok(claims.sid && claims.jti);
    const absoluteBefore = (await owner.query('SELECT absolute_expires_at FROM identity.sessions WHERE id=$1', [claims.sid])).rows[0].absolute_expires_at;
    assert.equal((await me(issued.accessToken)).status, 200);
    assert.equal((await fetch(base + '/auth/privacy/data', { headers: { Authorization: 'Bearer ' + issued.accessToken } })).status, 200);
    const broken = issued.accessToken.slice(0, -1) + (issued.accessToken.endsWith('A') ? 'B' : 'A');
    assert.equal((await me(broken)).status, 401);
    const parts = issued.accessToken.split('.');
    const unsafe = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: 'lab-1' })).toString('base64url') + '.' + parts[1] + '.' + parts[2];
    assert.equal((await me(unsafe)).status, 401);
    const wrongIssuer = createSessionJwt({ ...jwtSettings, issuer: 'https://wrong.example.test' });
    const otherIssuer = wrongIssuer.issue(claims.sub, claims.sid, claims.exp);
    assert.equal((await me(otherIssuer)).status, 401);
    const wrongAudience = createSessionJwt({ ...jwtSettings, audience: 'wrong-mobile' });
    assert.equal((await me(wrongAudience.issue(claims.sub, claims.sid, claims.exp))).status, 401);
    const expiredSigner = createSessionJwt({ ...jwtSettings, now: () => Math.floor(Date.now() / 1000) - 7300 });
    assert.equal((await me(expiredSigner.issue(claims.sub, claims.sid, Math.floor(Date.now() / 1000) - 7100))).status, 401);
    const rotate = () => fetch(base + '/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + issued.accessToken } });
    const renewed = await rotate(); assert.equal(renewed.status, 200);
    const next = await renewed.json(); assert.notEqual(next.accessToken, issued.accessToken);
    const absoluteAfter = (await owner.query('SELECT absolute_expires_at FROM identity.sessions WHERE id=$1', [claims.sid])).rows[0].absolute_expires_at;
    assert.equal(absoluteAfter.toISOString(), absoluteBefore.toISOString());
    assert.equal((await rotate()).status, 401);
    assert.equal((await me(issued.accessToken)).status, 401);
    assert.equal((await me(next.accessToken)).status, 200);
    assert.equal((await post('logout', undefined, next.accessToken)).status, 204);
    assert.equal((await me(next.accessToken)).status, 401);
    assert.equal((await fetch(base + '/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + next.accessToken } })).status, 401);
    const opaque = await post('login', { email: 'new@example.test', password });
    assert.equal(opaque.status, 200);
    const old = await opaque.json(); assert.equal(old.tokenFormat, undefined);
    assert.equal((await me(old.accessToken)).status, 200);
    assert.equal((await fetch(base + '/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + old.accessToken } })).status, 401);
    const idleLogin = await fetch(base + '/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Format': 'jwt-v1' },
      body: JSON.stringify({ email: 'new@example.test', password }) });
    assert.equal(idleLogin.status, 200);
    const idleToken = (await idleLogin.json()).accessToken;
    const idleSessionId = signer.validate(idleToken).sid;
    await owner.query(`UPDATE identity.sessions SET created_at=clock_timestamp()-interval '60 minutes',
      last_activity_at=clock_timestamp()-interval '31 minutes 10 seconds',
      absolute_expires_at=clock_timestamp()+interval '30 minutes',
      idle_expires_at=clock_timestamp()-interval '1 minute 20 seconds' WHERE id=$1`, [idleSessionId]);
    assert.equal((await me(idleToken)).status, 401);
    assert.equal((await fetch(base + '/auth/refresh', { method: 'POST', headers: { Authorization: 'Bearer ' + idleToken } })).status, 401);
  });
  await t.test('JWT over verified HTTPS rejects unknown CA and revokes the rotated session', {
    skip: process.env.JWT_LAB_TLS_TEST !== '1' && 'Opt in with synthetic TLS files outside the versioned candidate',
  }, async () => {
    const tls = path.resolve('..', '..', 'tls-local');
    for (const file of ['https.pem', 'https.key', 'arco_lab_ca.pem']) assert.ok(existsSync(path.join(tls, file)));
    const secureServer = createHttpsServer({ cert: readFileSync(path.join(tls, 'https.pem')),
      key: readFileSync(path.join(tls, 'https.key')) }, app);
    secureServer.listen(0, '127.0.0.1');
    await once(secureServer, 'listening');
    const root = 'https://127.0.0.1:' + secureServer.address().port;
    const agent = new Agent({ ca: readFileSync(path.join(tls, 'arco_lab_ca.pem')), rejectUnauthorized: true });
    async function call(route, { method = 'GET', body, token, trusted = true } = {}) {
      return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = httpsRequest(root + route, { method, agent: trusted ? agent : new Agent(),
          headers: { ...(payload && { 'Content-Type': 'application/json' }),
            ...(token && { Authorization: 'Bearer ' + token }),
            ...(route === '/auth/login' && { 'X-Auth-Format': 'jwt-v1' }) } }, res => {
          const parts = []; res.on('data', part => parts.push(part));
          res.on('end', () => { const text = Buffer.concat(parts).toString('utf8');
            resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }); });
        });
        req.on('error', reject); req.end(payload);
      });
    }
    try {
      await assert.rejects(call('/health', { trusted: false }), error =>
        /CERT|ISSUER|SELF_SIGNED|UNABLE_TO_VERIFY/.test(error.code));
      assert.equal((await call('/health')).status, 200);
      await clearBudget();
      const login = await call('/auth/login', { method: 'POST', body: { email: 'new@example.test', password } });
      assert.equal(login.status, 200);
      assert.equal(login.body.tokenFormat, 'jwt');
      assert.equal((await call('/auth/me', { token: login.body.accessToken })).status, 200);
      const rotated = await call('/auth/refresh', { method: 'POST', token: login.body.accessToken });
      assert.equal(rotated.status, 200);
      assert.equal((await call('/auth/me', { token: login.body.accessToken })).status, 401);
      assert.equal((await call('/auth/logout', { method: 'POST', token: rotated.body.accessToken })).status, 204);
      assert.equal((await call('/auth/me', { token: rotated.body.accessToken })).status, 401);
    } finally { await new Promise(resolve => secureServer.close(resolve)); agent.destroy(); }
  });
  await t.test('case-only duplicate returns generic acceptance and cannot replace an active password or create extra users', async () => {
    await clearBudget(); const previousMail = mail.length;
    const response = await post('register', { ...draft('NEW@example.test'), password: 'Un intento distinto seguro', confirmation: 'Un intento distinto seguro' });
    assert.equal(response.status, 202);
    assert.equal(mail.length, previousMail);
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM identity.users WHERE email_key='new@example.test'")).rows[0].n, 1);
    await clearBudget();
    assert.equal((await post('login', { email: 'new@example.test', password })).status, 200);
  });
  await t.test('expired code fails and cannot activate its account', async () => {
    const proof = await begin('expired@example.test');
    await owner.query("UPDATE identity.email_verifications SET created_at=clock_timestamp()-interval '20 minutes',expires_at=clock_timestamp()-interval '5 minutes' WHERE id=$1", [proof.challengeId]);
    assert.equal((await post('register/verify', proof)).status, 400);
  });
  await t.test('five wrong attempts revoke the challenge and further attempts are rate limited', async () => {
    const proof = await begin('attempts@example.test'), wrong = proof.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await post('register/verify', { ...proof, code: wrong })).status, 400);
    assert.equal((await post('register/verify', proof)).status, 429);
    assert.ok((await owner.query('SELECT revoked_at FROM identity.email_verifications WHERE id=$1', [proof.challengeId])).rows[0].revoked_at);
  });
  await t.test('failed provider cannot activate; resend rotates digest, observes cooldown and invalidates old code', async () => {
    rejectMail = true; const proof = await begin('resend@example.test'); rejectMail = false;
    const first = (await owner.query('SELECT token_hash,delivery_state FROM identity.email_verifications WHERE id=$1', [proof.challengeId])).rows[0];
    assert.equal(first.delivery_state, 'FAILED');
    assert.equal((await post('register/verify', { ...proof, code: '123456' })).status, 400);
    const challenge = { challengeId: proof.challengeId, verificationToken: proof.verificationToken };
    // Repository refuses premature resend even if HTTP returns generic acceptance.
    assert.equal(await runtime.resendRegistration(proof.challengeId, randomBytes(32), randomBytes(32)), null);
    await clearBudget();
    await owner.query("UPDATE identity.email_verifications SET last_issued_at=clock_timestamp()-interval '61 seconds' WHERE id=$1", [proof.challengeId]);
    assert.equal((await post('register/resend', challenge)).status, 202);
    for (let i = 0; i < 50; i++) {
      if ((await owner.query('SELECT delivery_state FROM identity.email_verifications WHERE id=$1', [proof.challengeId])).rows[0].delivery_state === 'SENT') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal((await post('register/resend', challenge)).status, 429);
    const current = (await owner.query('SELECT token_hash FROM identity.email_verifications WHERE id=$1', [proof.challengeId])).rows[0].token_hash;
    assert.equal(first.token_hash.equals(current), false);
    const code = mail.findLast(item => item.email === 'resend@example.test').code;
    assert.equal((await post('register/verify', { ...challenge, code })).status, 200);
  });
  await t.test('account deletion requires own session, exact confirmation and current password, then rolls back on database failure', async () => {
    await clearBudget();
    const email = 'new@example.test';
    const login = async email => {
      const response = await post('login', { email, password });
      assert.equal(response.status, 200);
      return response.json();
    };
    const first = await login(email);
    const second = await login(email);
    const other = await login('resend@example.test');
    const id = first.user.id;
    const body = { password, confirm: true };
    const erase = (data = body, token = first.accessToken) => post('account/delete', data, token);
    assert.equal((await erase(body, null)).status, 401);
    assert.equal((await erase({ ...body, confirm: false })).status, 400);
    assert.equal((await erase({ ...body, id: other.user.id })).status, 400);
    assert.equal((await erase({ ...body, password: 'Wrong synthetic password' })).status, 422);

    await owner.query(`INSERT INTO identity.password_resets(id,user_id,token_hash,security_version,expires_at)
      VALUES(gen_random_uuid(),$1,$2,1,now()+interval '10 minutes')`, [id, randomBytes(32)]);
    async function counts() {
      const { rows } = await owner.query(`SELECT
        (SELECT count(*)::int FROM identity.users WHERE id=$1) AS users,
        (SELECT count(*)::int FROM identity.sessions WHERE user_id=$1) AS sessions,
        (SELECT count(*)::int FROM identity.password_credentials WHERE user_id=$1) AS credentials,
        (SELECT count(*)::int FROM identity.email_verifications WHERE user_id=$1) AS verifications,
        (SELECT count(*)::int FROM identity.password_resets WHERE user_id=$1) AS resets,
        (SELECT count(*)::int FROM audit.security_events WHERE actor_user_id=$1 OR subject_user_id=$1) AS linked`, [id]);
      return rows[0];
    }
    const before = await counts();
    assert.ok(Object.values(before).every(value => value > 0));
    const auditCount = async () => (await owner.query('SELECT count(*)::int AS n FROM audit.security_events')).rows[0].n;
    const eventsBefore = await auditCount();
    const sessionIds = (await owner.query('SELECT id FROM identity.sessions WHERE user_id=$1', [id])).rows.map(row => row.id);
    await owner.query(`CREATE FUNCTION identity.synthetic_delete_failure() RETURNS trigger LANGUAGE plpgsql AS
      'BEGIN RAISE EXCEPTION ''synthetic failure at final deletion''; END;';
      CREATE TRIGGER synthetic_delete_failure BEFORE DELETE ON identity.users
      FOR EACH ROW EXECUTE FUNCTION identity.synthetic_delete_failure()`);
    try {
      assert.equal((await erase()).status, 503);
      assert.deepEqual(await counts(), before);
      assert.equal(await auditCount(), eventsBefore);
      assert.equal((await me(first.accessToken)).status, 200);
    } finally {
      await owner.query('DROP TRIGGER synthetic_delete_failure ON identity.users');
    }
    const success = await erase();
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { deleted: true });
    assert.deepEqual(Object.values(await counts()), [0, 0, 0, 0, 0, 0]);
    assert.equal(await auditCount(), eventsBefore);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM audit.security_events WHERE session_id=ANY($1::uuid[])', [sessionIds])).rows[0].n, 0);
    for (const credential of [first, second]) assert.equal((await me(credential.accessToken)).status, 401);
    assert.equal((await erase()).status, 401);
    assert.equal((await me(other.accessToken)).status, 200);
    assert.equal((await post('login', { email, password })).status, 401);
    for (let i = 0; i < 5; i++) {
      assert.equal((await erase({ ...body, password: 'Wrong synthetic password' }, other.accessToken)).status, 422);
    }
    assert.equal((await erase(body, other.accessToken)).status, 429);
    assert.equal((await me(other.accessToken)).status, 200);
  });
  await t.test('privacy with real PostgreSQL: documents, V4 compatibility, isolation, rectification and suppression', async () => {
    const get = (route, token) => fetch(base + '/auth/' + route,
      { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    const patch = (body, token) => fetch(base + '/auth/privacy/profile', { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body) });
    const eventCount = async id => (await owner.query(
      'SELECT count(*)::int AS count FROM privacy.consent_events WHERE user_id=$1', [id])).rows[0].count;
    const old = await post('login', { email: 'resend@example.test', password });
    assert.equal(old.status, 200);
    const legacy = await old.json();
    assert.deepEqual((await (await get('privacy/data', legacy.accessToken)).json()).decisions, []);
    assert.equal((await get('privacy/data')).status, 401);
    assert.equal((await patch({ name: 'Sin sesión' })).status, 401);
    assert.equal((await get('register/v2/documents')).status, 503);
    await owner.query("INSERT INTO privacy.legal_documents(kind,version,body) VALUES ('terms','draft','Borrador sintético')");
    assert.equal((await get('register/v2/documents')).status, 503);
    await owner.query(`INSERT INTO privacy.legal_documents(kind,version,status,body,published_at)
      VALUES ('terms','synthetic-1','PUBLISHED','NO VÁLIDOS PARA PRODUCCIÓN — Términos sintéticos',now()),
             ('notice','synthetic-2','PUBLISHED','NO VÁLIDO PARA PRODUCCIÓN — Aviso sintético',now())`);
    const docs = await (await get('register/v2/documents')).json();
    assert.equal(docs.terms.version, 'synthetic-1');
    assert.equal(docs.notice.version, 'synthetic-2');
    await assert.rejects(owner.query("UPDATE privacy.legal_documents SET body='Changed' WHERE version='synthetic-1'"));
    const runtimePool = new Pool(runtimeConfig);
    try {
      await assert.rejects(runtimePool.query('SELECT * FROM privacy.consent_events'), e => e.code === '42501');
      await assert.rejects(runtimePool.query('DELETE FROM privacy.arco_requests'), e => e.code === '42501');
    } finally { await runtimePool.end(); }

    const email = 'privacy-fresh@example.test';
    const privacy = { termsVersion: docs.terms.version, noticeVersion: docs.notice.version,
      termsAccepted: true, noticePresented: true, specificGranted: null, promotions: false };
    const v2 = { ...draft(email), privacy };
    await clearBudget();
    assert.equal((await post('register', v2)).status, 400);
    assert.equal((await post('register/v2', { ...v2, privacy: { ...privacy, termsAccepted: false } })).status, 400);
    assert.equal((await post('register/v2', { ...v2, privacy: { ...privacy, noticeVersion: 'draft' } })).status, 409);
    await clearBudget();
    assert.equal((await post('register/v2', { ...v2, privacy: { ...privacy, specificGranted: true } })).status, 409);
    await clearBudget();
    const requested = await post('register/v2', v2);
    assert.equal(requested.status, 202);
    const { challengeId, verificationToken } = await requested.json();
    for (let i = 0; i < 100; i++) {
      const { rows } = await owner.query('SELECT delivery_state FROM identity.email_verifications WHERE id=$1', [challengeId]);
      if (rows[0]?.delivery_state === 'SENT') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const id = (await owner.query('SELECT user_id FROM identity.email_verifications WHERE id=$1', [challengeId])).rows[0].user_id;
    assert.equal(await eventCount(id), 0);
    const code = mail.findLast(item => item.email === email).code;
    const challenge = { challengeId, verificationToken, code };
    const outcomes = await Promise.all([post('register/verify', challenge), post('register/verify', challenge)]);
    assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 400]);
    assert.equal(await eventCount(id), 3);
    const auth = await post('login', { email, password });
    assert.equal(auth.status, 200);
    const { accessToken } = await auth.json();
    const { account, decisions } = await (await get('privacy/data', accessToken)).json();
    assert.deepEqual(Object.keys(account).sort(), ['email','id','name','role']);
    assert.equal(account.id, id);
    assert.equal(decisions.find(x => x.type === 'promotions').granted, false);
    assert.ok(decisions.every(x => /Z$/.test(x.recordedAt) && Number.isFinite(Date.parse(x.recordedAt))));
    assert.equal(decisions.find(x => x.type === 'terms').documentVersion, docs.terms.version);
    assert.equal(decisions.find(x => x.type === 'notice').documentVersion, docs.notice.version);
    assert.equal((await patch({ name: 'Ajeno', id: legacy.user.id }, accessToken)).status, 400);
    assert.equal((await patch({ name: 'Ajeno', role: 'ADMIN' }, accessToken)).status, 400);
    assert.equal((await patch({ name: 'Ajeno', email: legacy.user.email }, accessToken)).status, 400);
    assert.equal((await patch({ name: ' ' }, accessToken)).status, 400);
    const updated = await patch({ name: '  Nombre rectificado  ' }, accessToken);
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).user.name, 'Nombre rectificado');
    assert.equal((await (await me(accessToken)).json()).user.name, 'Nombre rectificado');
    assert.equal((await (await me(legacy.accessToken)).json()).user.name, legacy.user.name);
    const promotion = { requestId: randomUUID(), noticeVersion: docs.notice.version, granted: true };
    const change = decision => post('privacy/consents/promotions', decision, accessToken);
    assert.equal((await post('privacy/consents/promotions', promotion)).status, 401);
    const retries = await Promise.all([change(promotion), change(promotion)]);
    assert.deepEqual(retries.map(r => r.status), [204, 204]);
    assert.equal(await eventCount(id), 4);
    assert.equal((await change({ ...promotion, granted: false })).status, 409);
    assert.equal((await change({ ...promotion, requestId: randomUUID(), noticeVersion: 'draft' })).status, 409);
    assert.equal((await change({ ...promotion, requestId: randomUUID(), granted: false })).status, 204);
    const history = (await (await get('privacy/data', accessToken)).json()).decisions;
    assert.deepEqual(history.filter(row => row.type === 'promotions').map(row => row.granted), [false, true, false]);
    const pref = async () => (await get('privacy/preferences', accessToken)).json();
    assert.equal((await pref()).promotions, false);
    assert.equal((await pref()).noticeVersion, docs.notice.version);
    const promoKey = randomUUID();
    assert.equal((await change({ ...promotion, requestId: promoKey, granted: true })).status, 204);
    assert.equal((await pref()).promotions, true);
    const beforeLogout = await post('login', { email, password });
    assert.equal(beforeLogout.status, 200);
    const closedToken = (await beforeLogout.json()).accessToken;
    assert.equal((await change({ ...promotion, requestId: randomUUID(), granted: false })).status, 204);
    assert.equal((await post('logout', undefined, closedToken)).status, 204);
    assert.equal((await get('privacy/preferences', closedToken)).status, 401);
    const renewed = await post('login', { email, password });
    assert.equal(renewed.status, 200);
    assert.equal((await (await get('privacy/preferences', (await renewed.json()).accessToken)).json()).promotions, false);

    const route = 'privacy/requests';
    const request = { requestId: randomUUID(), purpose: 'account_management', reason: 'Razón sintética' };
    assert.equal((await post(route, request)).status, 401);
    assert.equal((await get(route)).status, 401);
    assert.equal((await post(route, { ...request, reason: null }, accessToken)).status, 400);
    assert.equal((await post(route, { ...request, purpose: 'unexpected' }, accessToken)).status, 400);
    assert.equal((await post(route, { ...request, status: 'RESOLVED' }, accessToken)).status, 400);
    assert.equal((await post(route, { ...request, userId: legacy.user.id }, accessToken)).status, 400);
    const replies = await Promise.all([post(route, request, accessToken), post(route, request, accessToken)]);
    assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 201]);
    const [first, repeated] = await Promise.all(replies.map(reply => reply.json()));
    assert.equal(first.folio, repeated.folio);
    assert.equal(first.status, 'RECEIVED');
    assert.ok(Number.isFinite(Date.parse(first.createdAt)));
    assert.equal(first.respondedAt, null);
    assert.equal((await post(route, { ...request, reason: 'Otro motivo sintético' }, accessToken)).status, 409);
    const otherReply = await post(route, { requestId: request.requestId, purpose: 'promotions', reason: null }, legacy.accessToken);
    assert.equal(otherReply.status, 201);
    const otherRequest = await otherReply.json();
    assert.notEqual(otherRequest.folio, first.folio);
    assert.deepEqual((await (await get(route, accessToken)).json()).items.map(row => row.folio), [first.folio]);
    assert.deepEqual((await (await get(route, legacy.accessToken)).json()).items.map(row => row.folio), [otherRequest.folio]);
    assert.equal((await get(route + '/' + first.folio, legacy.accessToken)).status, 404);
    assert.equal((await get(route + '?cursor=' + first.folio, legacy.accessToken)).status, 404);
    const emptyPage = await get(route + '?cursor=' + first.folio, accessToken);
    assert.equal(emptyPage.status, 200);
    assert.deepEqual((await emptyPage.json()).items, []);
    assert.equal((await get(route + '?cursor=' + first.folio + '&cursor=' + otherRequest.folio, accessToken)).status, 400);
    assert.equal((await post(route + '/' + first.folio, { status: 'RESOLVED' }, accessToken)).status, 405);
    const operator = new Pool({ ...runtimeConfig, user: 'synthetic_reviewer', password: runtimePassword });
    const restricted = new Pool(runtimeConfig);
    try {
      await owner.query("CREATE ROLE synthetic_reviewer LOGIN PASSWORD '" + runtimePassword + "'");
      await owner.query('GRANT lapape_arco_reviewer TO synthetic_reviewer WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
      await assert.rejects(restricted.query("SELECT privacy.review_opposition($1, 'IN_REVIEW', NULL)", [first.folio]), e => e.code === '42501');
      await assert.rejects(restricted.query('SELECT privacy.pending_oppositions()'), e => e.code === '42501');
      await assert.rejects(operator.query('SELECT * FROM identity.users'), e => e.code === '42501');
      await assert.rejects(operator.query('UPDATE privacy.arco_requests SET status=\'RESOLVED\''), e => e.code === '42501');
      const queue = (await operator.query('SELECT privacy.pending_oppositions() AS queue')).rows[0].queue;
      assert.ok(queue.some(row => row.folio === first.folio && row.reason === 'Razón sintética'));
      const review = (folio, status, explanation = null) => operator.query(
        'SELECT privacy.review_opposition($1,$2,$3) AS result', [folio, status, explanation]);
      await assert.rejects(review(first.folio, 'RESOLVED', 'Demasiado pronto'), e => e.code === '22023');
      await review(first.folio, 'IN_REVIEW');
      await assert.rejects(review(first.folio, 'REJECTED'), e => e.code === '22023');
      await review(first.folio, 'REJECTED', 'Determinación de rechazo sintética');
      await review(first.folio, 'REJECTED', 'Determinación de rechazo sintética');
      await assert.rejects(review(first.folio, 'IN_REVIEW'), e => e.code === '22023');
      await review(otherRequest.folio, 'IN_REVIEW');
      await review(otherRequest.folio, 'RESOLVED', 'Determinación de resolución sintética');
      const detail = await (await get(route + '/' + first.folio, accessToken)).json();
      assert.equal(detail.status, 'REJECTED');
      assert.equal(detail.determination, 'Determinación de rechazo sintética');
      assert.ok(Number.isFinite(Date.parse(detail.respondedAt)));
      assert.deepEqual(detail.history.map(item => item.status), ['RECEIVED','IN_REVIEW','REJECTED']);
      assert.ok(detail.history.every(item => !Object.hasOwn(item, 'reviewer')));
      assert.equal((await (await get(route + '/' + otherRequest.folio, legacy.accessToken)).json()).status, 'RESOLVED');
      const { rows } = await owner.query('SELECT reviewer FROM privacy.arco_request_events WHERE folio=$1 AND status=$2', [first.folio, 'REJECTED']);
      assert.equal(rows[0].reviewer, 'synthetic_reviewer');
    } finally { await operator.end(); await restricted.end(); }

    const erase = () => post('account/delete', { password, confirm: true }, accessToken);
    await owner.query(`CREATE FUNCTION identity.zz_synthetic_privacy_failure() RETURNS trigger LANGUAGE plpgsql AS
      'BEGIN RAISE EXCEPTION ''synthetic rollback''; END;';
      CREATE TRIGGER zz_synthetic_privacy_failure BEFORE DELETE ON identity.users
      FOR EACH ROW EXECUTE FUNCTION identity.zz_synthetic_privacy_failure()`);
    assert.equal((await erase()).status, 503);
    assert.equal(await eventCount(id), 7);
    assert.equal((await owner.query('SELECT 1 FROM privacy.arco_request_events WHERE folio=$1', [first.folio])).rowCount, 3);
    assert.equal((await owner.query('SELECT 1 FROM privacy.arco_requests WHERE user_id=$1', [id])).rowCount, 1);
    await owner.query('DROP TRIGGER zz_synthetic_privacy_failure ON identity.users');
    assert.equal((await erase()).status, 200);
    assert.equal(await eventCount(id), 0);
    assert.equal((await owner.query('SELECT 1 FROM privacy.arco_request_events WHERE folio=$1', [first.folio])).rowCount, 0);
    assert.equal((await get(route + '/' + otherRequest.folio, legacy.accessToken)).status, 200);
    assert.equal((await owner.query('SELECT 1 FROM privacy.arco_requests WHERE user_id=$1', [id])).rowCount, 0);
    assert.equal((await get('privacy/data', accessToken)).status, 401);
    assert.equal((await get('privacy/data', legacy.accessToken)).status, 200);
  });
  await t.test('specific-purpose refusal records a separate event and promotions remain optional', async () => {
    await owner.query(`UPDATE privacy.legal_documents SET status='RETIRED' WHERE kind='notice' AND status='PUBLISHED';
      INSERT INTO privacy.legal_documents(kind,version,status,body,specific_purpose,published_at)
      VALUES ('notice','synthetic-3','PUBLISHED','NO VÁLIDO PARA PRODUCCIÓN — Aviso sintético con finalidad','synthetic_purpose',now())`);
    const email = 'specific-purpose@example.test';
    const privacy = { termsVersion: 'synthetic-1', noticeVersion: 'synthetic-3', termsAccepted: true,
      noticePresented: true, specificGranted: false, promotions: false };
    await clearBudget();
    const noDecision = await post('register/v2', { ...draft(email), privacy: { ...privacy, specificGranted: null } });
    assert.equal(noDecision.status, 409);
    await clearBudget(); // This fixture advances past the existing registration cooldown.
    const requested = await post('register/v2', { ...draft(email), privacy });
    assert.equal(requested.status, 202);
    const { challengeId, verificationToken } = await requested.json();
    for (let i = 0; i < 100; i++) {
      const { rows } = await owner.query('SELECT delivery_state FROM identity.email_verifications WHERE id=$1', [challengeId]);
      if (rows[0]?.delivery_state === 'SENT') break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const code = mail.findLast(item => item.email === email).code;
    assert.equal((await post('register/verify', { challengeId, verificationToken, code })).status, 200);
    const { rows } = await owner.query(`SELECT decision_type, purpose, granted, document_version
      FROM privacy.consent_events WHERE request_id=$1 ORDER BY decision_type`, [challengeId]);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.find(row => row.decision_type === 'specific'), { decision_type: 'specific',
      purpose: 'synthetic_purpose', granted: false, document_version: 'synthetic-3' });
  });
  if (process.env.ARCO_F3_CLIENT === '1') {
    await t.test('Fase 3: mobile services call real Express + PostgreSQL over verified HTTPS', async () => {
      const { exerciseArcoTls } = await import('../scripts/arco-f3-lab.js');
      await exerciseArcoTls({ app, owner, runtimeConfig, mail, clearBudget });
    });
  }

  await t.test('catalog/demo counts untouched and disabled endpoints remain absent', async () => {
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM catalog.products')).rows[0].n, 0);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM demo.product_previews')).rows[0].n, 10);
    for (const route of ['/products', '/categories', '/demo/products', '/admin']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/health')).status, 200);
  });
});
