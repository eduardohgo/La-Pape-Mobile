import * as crypto from 'node:crypto';
import { promisify } from 'node:util';

const profile = Object.freeze({ memory: 19456, passes: 2, parallelism: 1, tagLength: 32 });
const prefix = '$argon2id$v=19$m=19456,t=2,p=1$';
const PHC = /^\$argon2id\$v=19\$m=19456,t=2,p=1\$([A-Za-z0-9+/]{22})\$([A-Za-z0-9+/]{43})$/;

function encode(bytes) {
  return bytes.toString('base64').replace(/=+$/, '');
}

export function createPasswordHasher() {
  if (typeof crypto.argon2 !== 'function') {
    throw new Error('La autenticación requiere Node.js 24.7 o posterior con Argon2');
  }
  const argon2 = promisify(crypto.argon2);
  const dummySalt = crypto.randomBytes(16);
  const dummyTag = crypto.randomBytes(32);
  const derive = (password, nonce) => argon2('argon2id', {
    ...profile, message: Buffer.from(password, 'utf8'), nonce,
  });

  return Object.freeze({
    async hash(password) {
      const salt = crypto.randomBytes(16);
      return prefix + encode(salt) + '$' + encode(await derive(password, salt));
    },
    async verify(password, stored) {
      const match = typeof stored === 'string' && PHC.exec(stored);
      const salt = match ? Buffer.from(match[1], 'base64') : dummySalt;
      const tag = match ? Buffer.from(match[2], 'base64') : dummyTag;
      const valid = !!match && encode(salt) === match[1] && encode(tag) === match[2];
      const actual = await derive(password, valid ? salt : dummySalt);
      const equal = crypto.timingSafeEqual(actual, valid ? tag : dummyTag);
      return valid && equal;
    },
  });
}
