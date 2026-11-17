import { createDatabasePool } from '../db/conexion-postgres.js';
import { verifyRuntimePermissions } from '../db/permisos-runtime.js';

export function createAuthRepository(config) {
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
    verifyPermissions() {
      return verifyRuntimePermissions(pool, 'auth');
    },
    close() {
      return pool.end();
    },
  });
}
