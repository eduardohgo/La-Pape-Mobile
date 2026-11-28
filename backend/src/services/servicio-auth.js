import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

function digest(token) {
  return createHash('sha256').update(token).digest();
}

export function createAuthService(repository, passwordHasher, limitKey, jwt = null, stagingDeletionUserId = null) {
  let pending = 0;
  const key = (...parts) => createHmac('sha256', limitKey).update(JSON.stringify(parts)).digest();

  function tokenHash(token) {
    if (Buffer.isBuffer(token) && token.length === 32) return digest(token);
    if (typeof token === 'string' && jwt?.validate(token)) return digest(token);
    return null;
  }

  return Object.freeze({
    tokenHash,
    async login({ emailKey, password }, origin, format = 'opaque') {
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
        const sessionId = verified ? randomUUID() : null;
        const secret = verified && format !== 'jwt' ? randomBytes(32) : null;
        const accessToken = verified && format === 'jwt' && jwt
          ? jwt.issue(verified.id, sessionId, Math.floor(Date.now() / 1000) + 7200) : null;
        try {
          const result = await repository.finish(
            keys, requestId, verified, sessionId, accessToken ? digest(accessToken) : secret ? digest(secret) : null,
          );
          if (result?.status !== 'ok') return { status: result?.status === 'limited' ? 'limited' : 'invalid' };
          return { status: 'ok', data: {
            user: result.user,
            expiresAt: result.expiresAt,
            idleExpiresAt: result.idleExpiresAt,
            tokenType: 'Bearer',
            accessToken: accessToken ?? secret.toString('base64url'),
            ...(accessToken && { tokenFormat: 'jwt' }),
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
        const hash = tokenHash(token);
        if (!hash) return 'unauthorized';
        const candidate = await repository.deletionCandidate(hash);
        if (!candidate) return 'unauthorized';
          if (stagingDeletionUserId && candidate.id !== stagingDeletionUserId) return 'unauthorized';
        const allowed = await repository.registrationBudget(
          key('deletion-origin', origin), key('deletion-account', candidate.id), 'verify',
        );
        if (!allowed) return 'limited';
        if (!await passwordHasher.verify(password, candidate.passwordHash)) return 'incorrect';
        return await repository.deleteAccount(hash, candidate) ? 'deleted' : 'unauthorized';
      } finally {
        pending--;
      }
    },
    async session(token) {
      const hash = tokenHash(token);
      if (!hash) return null;
      const session = await repository.session(hash);
      if (typeof token === 'string' && session?.user?.id !== jwt.validate(token)?.sub) return null;
      return session;
    },
    logout(token) {
      const hash = tokenHash(token);
      return hash ? repository.revoke(hash) : false;
    },
    async refresh(token) {
      const claims = typeof token === 'string' ? jwt?.validate(token) : null;
      if (!claims) return null;
      const next = jwt.issue(claims.sub, claims.sid, claims.exp);
      const session = await repository.rotateJwtSession(digest(token), digest(next), claims.sid);
      if (!session || session.user?.id !== claims.sub) return null;
      return { ...session, tokenType: 'Bearer', tokenFormat: 'jwt', accessToken: next };
    },
  });
}
