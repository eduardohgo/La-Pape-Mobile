import { validateRegistration } from './validacion-registro.js';
import { readBearer } from './validacion-login.js';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function plain(body, fields) {
  if (!body || ![Object.prototype, null].includes(Object.getPrototypeOf(body))) return false;
  const keys = Reflect.ownKeys(body);
  return keys.length === fields.length && keys.every(key => fields.includes(key)
    && Object.getOwnPropertyDescriptor(body, key)?.enumerable
    && typeof Object.getOwnPropertyDescriptor(body, key)?.value === 'string');
}
export function validateSignup(body) {
  if (!plain(body, ['name', 'email', 'password', 'confirmation']) || body.password !== body.confirmation) return null;
  const result = validateRegistration({ name: body.name, email: body.email, password: body.password });
  return result.ok ? result.data : null;
}
export function validateSignupChallenge(body, verify = false) {
  if (!plain(body, verify ? ['challengeId', 'verificationToken', 'code'] : ['challengeId', 'verificationToken'])
    || !uuid.test(body.challengeId) || !readBearer('Bearer ' + body.verificationToken)
    || (verify && !/^\d{6}$/.test(body.code))) return null;
  return body;
}
