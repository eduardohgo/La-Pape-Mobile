import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/variables-entorno.js';
import { createAuthRepository } from '../src/repositories/repositorio-auth.js';
const secret = () => randomBytes(32).toString('base64url');
test('PostgreSQL 18 disposable integration: migrations, least privilege, registration, OTP and existing sessions', {
  skip: process.env.REGISTRATION_PG_TEST !== '1' && 'Opt in REGISTRATION_PG_TEST=1 with local PostgreSQL 18; never uses DATABASE_URL',
  timeout: 120000,
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
  // Password is synthetic, ephemeral and never emitted or passed as a process argument.
  await owner.query("ALTER ROLE lapape_auth_runtime LOGIN PASSWORD '" + runtimePassword + "'");
  const runtimeConfig = { ...connection, database: 'lapape_mobile_dev', user: 'lapape_auth_runtime', password: runtimePassword };
  runtime = createAuthRepository(runtimeConfig, { registrationEnabled: true, deletionEnabled: true });
  await t.test('runtime preflight and actual restrictions on tables, role assignment and other schemas', async () => {
    assert.equal(await runtime.verifyPermissions(), true);
    const pool = new Pool(runtimeConfig);
    for (const sql of ['SELECT * FROM identity.password_credentials', 'SELECT * FROM catalog.products',
      'SELECT * FROM demo.product_previews', 'UPDATE identity.users SET role_code=\'ADMIN\'',
      'SET ROLE lapape_registration_executor']) await assert.rejects(pool.query(sql), error => error.code === '42501');
    await pool.end();
  });
  const mail = []; let rejectMail = false;
  const config = loadConfig({ NODE_ENV: 'test', API_PROFILE: 'auth-only', AUTH_ENABLED: 'true', AUTH_ALLOW_LOOPBACK_HTTP: 'true',
    AUTH_DATABASE_URL: 'postgresql://lapape_auth_runtime:synthetic@localhost/lapape_mobile_dev', AUTH_RATE_LIMIT_KEY: secret(),
    AUTH_ACCOUNT_DELETION_ENABLED: 'true', AUTH_REGISTRATION_ENABLED: 'true', AUTH_REGISTRATION_HMAC_KEY: secret(), AUTH_MAIL_PROVIDER: 'brevo',
    BREVO_API_KEY: secret(), AUTH_MAIL_FROM: 'sender@example.test' });
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
  await t.test('catalog/demo counts untouched and disabled endpoints remain absent', async () => {
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM catalog.products')).rows[0].n, 0);
    assert.equal((await owner.query('SELECT count(*)::int AS n FROM demo.product_previews')).rows[0].n, 10);
    for (const route of ['/products', '/categories', '/demo/products', '/admin']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await fetch(base + '/health')).status, 200);
  });
});
