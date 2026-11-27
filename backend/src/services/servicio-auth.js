import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

function digest(token) {
  return createHash('sha256').update(token).digest();
}

export function createAuthService(repository, passwordHasher, limitKey) {
  let pending = 0;
  const key = (...parts) => createHmac('sha256', limitKey).update(JSON.stringify(parts)).digest();

  return Object.freeze({
    async login({ emailKey, password }, origin) {
      // Bound native work and queued database calls per process. PostgreSQL shares
      // attempt limits across workers and survives application restarts.
      if (pending >= 2) return { status: 'limited' };
      pending++;
      try {
        const keys = [key('global'), key('origin', origin), key('account-origin', emailKey, origin)];
        const requestId = randomUUID();
        if (!await repository.reserve(keys, requestId)) return { status: 'limited' };
        const candidate = await repository.candidate(emailKey);
        const matches = await passwordHasher.verify(password, candidate?.passwordHash);
        const verified = matches ? candidate : null;
        const secret = verified ? randomBytes(32) : null;
        try {
          const result = await repository.finish(
            keys, requestId, verified, secret ? randomUUID() : null, secret ? digest(secret) : null,
          );
          if (result?.status !== 'ok') return { status: result?.status === 'limited' ? 'limited' : 'invalid' };
          return { status: 'ok', data: {
            user: result.user,
            expiresAt: result.expiresAt,
            idleExpiresAt: result.idleExpiresAt,
            tokenType: 'Bearer',
            accessToken: secret.toString('base64url'),
          } };
        } finally {
          secret?.fill(0);
        }
      } finally {
        pending--;
      }
    },
    async deleteAccount(token, password, origin) {
      if (pending >= 2) return 'limited';
      pending++;
      try {
        const tokenHash = digest(token);
        const candidate = await repository.deletionCandidate(tokenHash);
        if (!candidate) return 'unauthorized';
        const allowed = await repository.registrationBudget(
          key('deletion-origin', origin), key('deletion-account', candidate.id), 'verify',
        );
        if (!allowed) return 'limited';
        if (!await passwordHasher.verify(password, candidate.passwordHash)) return 'incorrect';
        return await repository.deleteAccount(tokenHash, candidate) ? 'deleted' : 'unauthorized';
      } finally {
        pending--;
      }
    },
    session(token) {
      return repository.session(digest(token));
    },
    logout(token) {
      return repository.revoke(digest(token));
    },
  });
}
