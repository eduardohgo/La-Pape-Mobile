import { createDatabasePool } from '../db/conexion-postgres.js';
import { verifyRuntimePermissions } from '../db/permisos-runtime.js';

export function createAuthRepository(config, { registrationEnabled = false, deletionEnabled = false, privacyEnabled = false, jwtEnabled = false } = {}) {
  const pool = createDatabasePool({
    ...config, max: 3, statement_timeout: 5000, idle_in_transaction_session_timeout: 5000,
  }, undefined, 'auth');

  async function call(sql, parameters) {
    const { rows } = await pool.query(sql, parameters);
    return rows[0]?.result ?? null;
  }

  return Object.freeze({
    reserve(keys, requestId) {
      return call('SELECT identity.reserve_mobile_login($1, $2, $3, $4) AS result', [...keys, requestId]);
    },
    candidate(emailKey) {
      return call('SELECT identity.mobile_login_candidate($1) AS result', [emailKey]);
    },
    finish(keys, requestId, candidate, sessionId, tokenHash) {
      return call('SELECT identity.finish_mobile_login($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS result', [
        ...keys, requestId, candidate?.id ?? null, candidate?.securityVersion ?? null,
        candidate?.registrationVersion ?? null, candidate?.passwordHash ?? null,
        sessionId, tokenHash,
      ]);
    },
    session(tokenHash) {
      return call('SELECT identity.read_mobile_session($1) AS result', [tokenHash]);
    },
    revoke(tokenHash) {
      return call('SELECT identity.revoke_mobile_session($1) AS result', [tokenHash]);
    },
    rotateJwtSession(previousHash, nextHash, sessionId) {
      return call('SELECT identity.rotate_mobile_jwt_session($1,$2,$3) AS result',
        [previousHash, nextHash, sessionId]);
    },
    registrationBudget(originKey, accountKey, operation) {
      return call('SELECT identity.registration_budget($1, $2, $3) AS result', [originKey, accountKey, operation]);
    },
    prepareRegistration(name, email, passwordHash, id, proofHash, codeHash) {
      return call('SELECT identity.prepare_registration($1, $2, $3, $4, $5, $6) AS result', [name, email, passwordHash, id, proofHash, codeHash]);
    },
    currentLegalDocuments() {
      return call('SELECT privacy.current_documents() AS result', []);
    },
    prepareRegistrationWithPrivacy(name, email, passwordHash, id, proofHash, codeHash, legal) {
      return call('SELECT privacy.prepare_registration($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result',
        [name, email, passwordHash, id, proofHash, codeHash, legal.termsVersion, legal.noticeVersion,
          legal.specificGranted, legal.promotions]);
    },
    readPrivacyData(tokenHash) {
      return call('SELECT privacy.read_my_data($1) AS result', [tokenHash]);
    },
    readPrivacyPreferences(tokenHash) {
      return call('SELECT privacy.read_my_preferences($1) AS result', [tokenHash]);
    },
    createOpposition(tokenHash, { requestId, purpose, reason }) {
      return call('SELECT privacy.create_my_opposition($1,$2,$3,$4) AS result', [tokenHash, requestId, purpose, reason]);
    },
    listOppositions(tokenHash, { cursor }) {
      return call('SELECT privacy.list_my_oppositions($1,$2) AS result', [tokenHash, cursor ?? null]);
    },
    readOpposition(tokenHash, folio) {
      return call('SELECT privacy.read_my_opposition($1,$2) AS result', [tokenHash, folio]);
    },
    recordPromotions(tokenHash, { requestId, noticeVersion, granted }) {
      return call('SELECT privacy.record_my_promotions($1,$2,$3,$4) AS result',
        [tokenHash, requestId, noticeVersion, granted]);
    },
    updateProfileName(tokenHash, name) {
      return call('SELECT privacy.update_my_name($1,$2) AS result', [tokenHash, name]);
    },
    resendRegistration(id, proofHash, codeHash) {
      return call('SELECT identity.resend_registration($1, $2, $3) AS result', [id, proofHash, codeHash]);
    },
    registrationDelivery(id, codeHash, sent) {
      return call('SELECT identity.registration_delivery($1, $2, $3) AS result', [id, codeHash, sent]);
    },
    confirmRegistration(id, proofHash, codeHash) {
      return call('SELECT identity.confirm_registration($1, $2, $3) AS result', [id, proofHash, codeHash]);
    },
    deletionCandidate(tokenHash) {
      return call('SELECT identity.mobile_deletion_candidate($1) AS result', [tokenHash]);
    },
    deleteAccount(tokenHash, candidate) {
      return call('SELECT identity.delete_mobile_account($1, $2, $3) AS result',
        [tokenHash, candidate.passwordHash, candidate.securityVersion]);
    },
    verifyPermissions() {
      return verifyRuntimePermissions(pool, 'auth', registrationEnabled, deletionEnabled, privacyEnabled, jwtEnabled);
    },
    close() {
      return pool.end();
    },
  });
}
