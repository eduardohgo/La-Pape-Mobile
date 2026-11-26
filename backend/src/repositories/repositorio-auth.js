import { createDatabasePool } from '../db/conexion-postgres.js';
import { verifyRuntimePermissions } from '../db/permisos-runtime.js';

export function createAuthRepository(config, { registrationEnabled = false, deletionEnabled = false } = {}) {
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
    registrationBudget(originKey, accountKey, operation) {
      return call('SELECT identity.registration_budget($1, $2, $3) AS result', [originKey, accountKey, operation]);
    },
    prepareRegistration(name, email, passwordHash, id, proofHash, codeHash) {
      return call('SELECT identity.prepare_registration($1, $2, $3, $4, $5, $6) AS result', [name, email, passwordHash, id, proofHash, codeHash]);
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
      return verifyRuntimePermissions(pool, 'auth', registrationEnabled, deletionEnabled);
    },
    close() {
      return pool.end();
    },
  });
}
