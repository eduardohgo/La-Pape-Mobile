import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Agent, createServer, request } from 'node:https';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { setTimeout as wait } from 'node:timers/promises';
import { Pool } from 'pg';

const require = createRequire(import.meta.url);
const read = file => readFileSync(new URL('../../tls-local/' + file, import.meta.url));
const debug = process.env.ARCO_F4_DEBUG === '1';
const refresh = debug && process.env.ARCO_F4_RUN === '4';
const evidence = new URL(debug ? '../../evidencias-debug-android-2026-11-27/' : '../../evidencias/', import.meta.url);

function transport(agent, base) {
  return (address, { method, headers, signal, body } = {}) => {
    const url = new URL(address);
    if (url.origin !== base) return Promise.reject(new Error('ARCO local origin required'));
    return new Promise((resolve, reject) => {
      const req = request(url, { agent, method, headers, signal }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const payload = Buffer.concat(chunks);
          resolve(new Response(payload.length === 0 ? null : payload, { status: res.statusCode, headers: res.headers }));
        });
      });
      req.on('error', reject);
      req.end(body);
    });
  };
}

export async function exerciseArcoTls({ app, owner, runtimeConfig, mail, clearBudget }) {
  const android = process.env.ARCO_F3_ANDROID === '1';
  const events = [];
  const server = createServer({ cert: read('https.pem'), key: read('https.key') }, app);
  server.listen(android ? 3467 : 0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'https://127.0.0.1:' + server.address().port;
  const trusted = new Agent({ ca: read('arco_lab_ca.pem') });
  const ordinary = new Agent();
  const operatorPassword = randomBytes(24).toString('base64url');
  const operator = new Pool({ ...runtimeConfig, user: 'f3_reviewer', password: operatorPassword });

  async function review(folio, determination) {
    await operator.query("SELECT privacy.review_opposition($1,'IN_REVIEW',NULL)", [folio]);
    await operator.query("SELECT privacy.review_opposition($1,'RESOLVED',$2)", [folio, determination]);
  }

  try {
    await owner.query("CREATE ROLE f3_reviewer LOGIN PASSWORD '" + operatorPassword + "'");
    await owner.query('GRANT lapape_arco_reviewer TO f3_reviewer WITH ADMIN FALSE, INHERIT TRUE, SET FALSE');
    const { createAuthService } = require('../../frontend/.test-build/features/auth/servicio-auth.js');
    const { createRegistrationService } = require('../../frontend/.test-build/features/auth/servicio-registro.js');
    const { createSessionController } = require('../../frontend/.test-build/features/auth/controlador-sesion.js');
    const { registrationPrivacy, emptyLegalChoices } = require('../../frontend/.test-build/features/auth/contratos-privacidad.js');
    const config = { baseUrl: base, environment: 'development', timeoutMs: 5000 };
    const tls = transport(trusted, base);
    await assert.rejects(transport(ordinary, base)(base + '/health'),
      error => /CERT|ISSUER|SELF_SIGNED|UNABLE_TO_VERIFY_LEAF_SIGNATURE/.test(error.code));
    assert.equal((await tls(base + '/health')).status, 200);
    events.push({ caso: 'TLS', observado: 'CA local aceptada y CA desconocida rechazada' });
    const registration = createRegistrationService(config, tls);
    const auth = createAuthService(config, tls);
    function storage() {
      let current = null;
      return { read: async () => current, save: async value => { current = value; },
        clear: async () => { current = null; } };
    }
    async function register(email, versioned) {
      await clearBudget();
      const docs = await registration.documents();
      assert.match(docs.notice.body, /NO VÁLIDO PARA PRODUCCIÓN/);
      const privacy = registrationPrivacy(docs, { ...emptyLegalChoices, termsAccepted: true,
        noticePresented: true, specificGranted: docs.notice.specificPurpose ? false : null });
      assert.ok(privacy);
      const password = 'Tigre de laboratorio ' + randomBytes(8).toString('hex');
      const credentials = { email, password };
      const proof = await registration.request({ ...credentials, name: 'Persona sintética', confirmation: password },
        undefined, versioned ? privacy : undefined);
      for (let i = 0; i < 80; i++) {
        const record = await owner.query('SELECT delivery_state FROM identity.email_verifications WHERE id=$1', [proof.challengeId]);
        const message = mail.findLast(item => item.email === email);
        if (record.rows[0]?.delivery_state === 'SENT' && message) {
          await registration.verify({ ...proof, code: message.code });
          return credentials;
        }
        await wait(15);
      }
      assert.fail('The synthetic OTP did not reach the local mock mailbox');
    }
    const credentials = await register('cliente-f3@example.test', true);
    const otherCredentials = await register('control-f3@example.test', false);
    const device = storage();
    const first = createSessionController(auth, device);
    await first.restore();
    assert.equal(await first.login(credentials), true);
    const access = await first.readPrivacyData();
    assert.ok(access.decisions.some(row => row.type === 'notice'));
    assert.equal(await first.readPrivacyPreferences().then(x => x.promotions), false);
    events.push({ caso: 'Registro v2, OTP simulado, Login y acceso', observado: 'OK, aviso versionado y promociones apagadas' });
    await first.updateProfileName('Nombre sintético rectificado');
    const reopened = createSessionController(auth, device);
    await reopened.restore();
    assert.equal(reopened.getSnapshot().session.user.name, 'Nombre sintético rectificado');
    events.push({ caso: 'Rectificación y restauración', observado: 'Nombre persistente tras reinstanciar controlador' });

    const submission = { requestId: randomUUID(), purpose: 'promotions', reason: 'Motivo sintético académico' };
    const received = await reopened.createOpposition(submission);
    const repeated = await reopened.createOpposition(submission);
    assert.equal(received.folio, repeated.folio);
    assert.equal(received.status, 'RECEIVED');
    const other = createSessionController(auth, storage());
    await other.restore();
    assert.equal(await other.login(otherCredentials), true);
    assert.deepEqual((await other.readPrivacyData()).decisions, []);
    await assert.rejects(other.readOpposition(received.folio), error => error.status === 404);
    assert.deepEqual((await other.listOppositions()).items, []);
    await review(received.folio, 'Determinación sintética de laboratorio');
    const resolved = await reopened.readOpposition(received.folio);
    assert.ok(resolved.respondedAt);
    const history = resolved.history.map(event => event.status);
    assert.deepEqual(history, ['RECEIVED', 'IN_REVIEW', 'RESOLVED']);
    events.push({ caso: 'Oposición, operador y aislamiento', observado: 'OK', folio: received.folio, historial: history,
      fechaRespuesta: resolved.respondedAt, consultaAjena: 404 });

    const { noticeVersion } = await reopened.readPrivacyPreferences();
    await reopened.recordPromotions(randomUUID(), noticeVersion, true);
    assert.equal((await reopened.readPrivacyPreferences()).promotions, true);
    await reopened.recordPromotions(randomUUID(), noticeVersion, false);
    const old = await device.read();
    await reopened.logout();
    await assert.rejects(auth.me(old), error => error.status === 401);
    assert.equal(await reopened.login(credentials), true);
    assert.equal((await reopened.readPrivacyPreferences()).promotions, false);
    events.push({ caso: 'Revocación promocional y Logout', observado: 'Opt-out persistió después de nuevo Login; sesión anterior 401' });
    assert.equal(await reopened.deleteAccount(credentials.password), 'deleted');
    assert.equal(await device.read(), null);
    const { rows: [counts] } = await owner.query(`SELECT (SELECT count(*)::int FROM privacy.arco_requests WHERE folio=$1) AS solicitudes,
      (SELECT count(*)::int FROM privacy.arco_request_events WHERE folio=$1) AS historial`, [received.folio]);
    assert.deepEqual(counts, { solicitudes: 0, historial: 0 });
    assert.equal(other.getSnapshot().status, 'authenticated');
    assert.equal((await other.readPrivacyData()).account.name, 'Persona sintética');
    events.push({ caso: 'Cancelación sintética y compatibilidad V4', observado: 'Solo se suprimió la cuenta objetivo; alta V4 sin consentimientos' });
    writeFileSync(new URL(refresh ? 'resultado-https-cliente-r4.json' : 'resultado-https-cliente.json', evidence), JSON.stringify(events, null, 2), { flag: 'wx' });

    if (android) {
      const dir = new URL(debug ? (refresh ? '../../runtime-android/debug-2026-11-27-r4/' : '../../runtime-android/debug-2026-11-27/') : '../../runtime-android/', import.meta.url);
      mkdirSync(dir, { recursive: true });
      const deviceAccount = await register('android-f3@example.test', true);
      writeFileSync(new URL('device-fixture.local', dir), JSON.stringify(deviceAccount), { flag: 'wx' });
      writeFileSync(new URL('device-ready.local', dir), 'HTTPS 3467');
      let mailCount = mail.length;
            const deadline = Date.now() + (debug ? 840000 : 360000);
      const traffic = [];
      const trace = (req, res) => {
        const route = (req.originalUrl ?? req.url).split('?')[0];
        if (!/^\/auth\/(?:login|logout|me|register(?:\/v2(?:\/documents)?|\/verify)?|privacy\/(?:data|profile|preferences|consents\/promotions|requests(?:\/[a-f0-9-]+)?))$/i.test(route)) return;
        res.once('finish', () => {
          const match = /^\/auth\/privacy\/requests\/([a-f0-9-]{36})$/i.exec(route);
          traffic.push({ at: new Date().toISOString(), method: req.method,
            route: match ? '/auth/privacy/requests/:folio' : route,
            status: res.statusCode, tls: req.socket.getProtocol(),
            client: /^(?:okhttp|Expo)\b/i.test(req.headers['user-agent'] ?? '') ? 'android-client' : 'unclassified' });
        });
      };
      if (debug) server.on('request', trace);
      let reviewed = false;
      while (Date.now() < deadline && !existsSync(new URL('finish.local', dir))) {
        if (debug && !reviewed && existsSync(new URL('review.local', dir))) {
          const { rows: [row] } = await owner.query(
            `SELECT q.folio FROM privacy.arco_requests q JOIN identity.users u ON q.user_id=u.id
            WHERE u.email IN ('android-f3@example.test','android-registro@example.test') AND q.status='RECEIVED'
            ORDER BY q.created_at DESC LIMIT 1`);
          if (row) {
            await review(row.folio, 'Determinacion sintetica del laboratorio Android');
            writeFileSync(new URL('reviewed.local', dir), row.folio);
            reviewed = true;
          }
        }
        const next = mail.slice(mailCount).find(row => row.email === 'android-registro@example.test');
        if (next) writeFileSync(new URL('synthetic-otp.local', dir), next.code);
        mailCount = mail.length;
        await wait(400);
      }
      if (debug) {
        server.off('request', trace);
        writeFileSync(new URL(refresh ? 'transporte-android-r4.json' : 'transporte-android.json', evidence), JSON.stringify(traffic, null, 2), { flag: 'wx' });
      }
    }
  } finally {
    trusted.destroy();
    ordinary.destroy();
    await new Promise(resolve => server.close(resolve));
    await operator.end();
  }
}
