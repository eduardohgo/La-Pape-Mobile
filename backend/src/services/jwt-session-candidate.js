import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const segment = /^[A-Za-z0-9_-]+$/;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

function decode(value) {
  if (!segment.test(value) || value.length > 1600) throw new Error('Invalid JWT');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) throw new Error('Invalid JWT');
  return JSON.parse(bytes.toString('utf8'));
}

export function createSessionJwt({ privateKey, publicKey, issuer, audience, kid, now = () => Math.floor(Date.now() / 1000) }) {
  const secret = createPrivateKey(privateKey);
  const publicPart = createPublicKey(publicKey);
  if (secret.asymmetricKeyType !== 'ed25519' || publicPart.asymmetricKeyType !== 'ed25519'
    || !issuer || !audience || !/^[a-zA-Z0-9_-]{1,40}$/.test(kid)) throw new Error('Invalid JWT configuration');
  const probe = Buffer.from('session-key-consistency');
  if (!verify(null, probe, publicPart, sign(null, probe, secret))) throw new Error('JWT keys do not match');
  return Object.freeze({
    issue(subject, sessionId, expiresAt) {
      const issued = now();
      if (!uuid.test(subject) || !uuid.test(sessionId) || !Number.isSafeInteger(expiresAt)
        || expiresAt <= issued || expiresAt > issued + 7200) throw new Error('Invalid session');
      const claims = { iss: issuer, aud: audience, sub: subject, sid: sessionId,
        jti: randomUUID(), iat: issued, exp: expiresAt };
      const data = encode({ alg: 'EdDSA', typ: 'JWT', kid }) + '.' + encode(claims);
      return data + '.' + sign(null, Buffer.from(data), secret).toString('base64url');
    },
    validate(token) {
      try {
        if (typeof token !== 'string' || token.length > 2400) return null;
        const parts = token.split('.');
        if (parts.length !== 3 || parts.some(part => !segment.test(part))) return null;
        const [head, body, signature] = parts;
        const header = decode(head);
        if (Object.keys(header).sort().join() !== 'alg,kid,typ'
          || header.alg !== 'EdDSA' || header.typ !== 'JWT' || header.kid !== kid
          || signature.length !== 86 || Buffer.from(signature, 'base64url').toString('base64url') !== signature
          || !verify(null, Buffer.from(head + '.' + body), publicPart, Buffer.from(signature, 'base64url'))) return null;
        const claims = decode(body);
        const issued = now();
        if (Object.keys(claims).sort().join() !== 'aud,exp,iat,iss,jti,sid,sub'
          || claims.iss !== issuer || claims.aud !== audience || !uuid.test(claims.sub)
          || !uuid.test(claims.sid) || !uuid.test(claims.jti)
          || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
          || claims.iat > issued || claims.exp <= issued || claims.exp <= claims.iat
          || claims.exp - claims.iat > 7200) return null;
        return claims;
      } catch { return null; }
    },
  });
}
