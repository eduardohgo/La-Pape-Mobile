import { createPrivateKey, createPublicKey, randomUUID, sign, verify } from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

export function createSessionJwt({ privateKey, publicKey, issuer, audience, kid, now = () => Math.floor(Date.now()/1000) }) {
  const secret = createPrivateKey(privateKey);
  const publicPart = createPublicKey(publicKey);
  if (secret.asymmetricKeyType !== 'ed25519' || publicPart.asymmetricKeyType !== 'ed25519'
    || !issuer || !audience || !/^[a-zA-Z0-9_-]{1,40}$/.test(kid)) throw new Error('Invalid JWT configuration');
  const probe = Buffer.from('session-key-consistency');
  if (!verify(null, probe, publicPart, sign(null, probe, secret))) throw new Error('JWT keys do not match');
  return Object.freeze({
    issue(subject, expiresAt) {
      const issued = now();
      if (!/^[a-f0-9-]{36}$/i.test(subject) || !Number.isSafeInteger(expiresAt)
        || expiresAt <= issued || expiresAt > issued + 7200) throw new Error('Invalid session');
      const claims = { iss: issuer, aud: audience, sub: subject, jti: randomUUID(), iat: issued, exp: expiresAt };
      const data = encode({ alg: 'EdDSA', typ: 'JWT', kid }) + '.' + encode(claims);
      return data + '.' + sign(null, Buffer.from(data), secret).toString('base64url');
    },
    validate(token) {
      try {
        if (typeof token !== 'string' || token.length > 2048 || !/^[A-Za-z0-9_-]+.[A-Za-z0-9_-]+.[A-Za-z0-9_-]+$/.test(token)) return null;
        const [head, body, signature] = token.split('.');
        const header = decode(head);
        if (Object.keys(header).sort().join() !== 'alg,kid,typ'
          || header.alg !== 'EdDSA' || header.typ !== 'JWT' || header.kid !== kid
          || !verify(null, Buffer.from(head + '.' + body), publicPart, Buffer.from(signature,'base64url'))) return null;
        const claims = decode(body);
        if (Object.keys(claims).sort().join() !== 'aud,exp,iat,iss,jti,sub'
          || claims.iss !== issuer || claims.aud !== audience
          || !/^[a-f0-9-]{36}$/i.test(claims.sub) || !/^[a-f0-9-]{36}$/i.test(claims.jti)
          || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
          || claims.iat > now() || claims.exp <= now() || claims.exp <= claims.iat || claims.exp - claims.iat > 7200) return null;
        return claims;
      } catch { return null; }
    },
  });
}
