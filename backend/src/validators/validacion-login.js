import { validEmail, REGISTRATION_VALIDATION } from './validacion-registro.js';

export function validateLogin(body) {
  if (!body || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) return null;
  const keys = Reflect.ownKeys(body);
  if (keys.length !== 2 || !keys.includes('email') || !keys.includes('password')) return null;
  const email = Object.getOwnPropertyDescriptor(body, 'email')?.value;
  const password = Object.getOwnPropertyDescriptor(body, 'password')?.value;
  if (typeof email !== 'string' || email.length > REGISTRATION_VALIDATION.emailMaxLength
    || !validEmail(email.trim())) return null;
  if (!validCurrentPassword(password)) return null;
  return { emailKey: email.trim().toLowerCase(), password };
}

export function validCurrentPassword(password) {
  return typeof password === 'string' && Boolean(password.trim()) && !/\p{Cs}/u.test(password)
    && Buffer.byteLength(password, 'utf8') <= REGISTRATION_VALIDATION.passwordMaxBytes;
}

export function readBearer(header) {
  if (typeof header === 'string') {
    const jwt = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
    if (jwt && jwt[1].length <= 2400) return jwt[1];
  }
  const match = typeof header === 'string' && /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header);
  if (!match) return null;
  const token = Buffer.from(match[1], 'base64url');
  return token.length === 32 && token.toString('base64url') === match[1] ? token : null;
}
