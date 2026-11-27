import { validateSignup } from './validacion-alta.js';

function exact(value, fields) {
  return value !== null && typeof value === 'object'
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Reflect.ownKeys(value).length === fields.length
    && fields.every(field => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      return descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
    });
}

const version = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(value);

export function validatePrivacySignup(body) {
  if (!exact(body, ['name', 'email', 'password', 'confirmation', 'privacy'])) return null;
  const { privacy, ...credentials } = body;
  if (!exact(privacy, ['termsVersion', 'noticeVersion', 'termsAccepted', 'noticePresented', 'specificGranted', 'promotions'])
    || !version(privacy.termsVersion) || !version(privacy.noticeVersion)
    || privacy.termsAccepted !== true || privacy.noticePresented !== true
    || (privacy.specificGranted !== null && typeof privacy.specificGranted !== 'boolean')
    || typeof privacy.promotions !== 'boolean') return null;
  const signup = validateSignup(credentials);
  return signup ? { ...signup, privacy } : null;
}

const purposes = new Set(['promotions', 'account_management', 'account_security']);
export const validFolio = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function validateOpposition(body) {
  if (!exact(body, ['requestId', 'purpose', 'reason']) || !validFolio(body.requestId)
    || !purposes.has(body.purpose) || (body.reason !== null && typeof body.reason !== 'string')) return null;
  if (body.reason !== null && (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(body.reason) || [...body.reason].length > 240)) return null;
  const reason = body.reason?.trim() || null;
  if (body.purpose !== 'promotions' && !reason) return null;
  return { requestId: body.requestId.toLowerCase(), purpose: body.purpose, reason };
}

export function validateOppositionQuery(query) {
  if (Reflect.ownKeys(query).length === 0) return {};
  return exact(query, ['cursor']) && validFolio(query.cursor) ? { cursor: query.cursor } : null;
}

export function validatePromotions(body) {
  if (!exact(body, ['requestId', 'noticeVersion', 'granted']) || !version(body.noticeVersion)
    || typeof body.granted !== 'boolean' || typeof body.requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) return null;
  return body;
}

export function validateProfileName(body) {
  if (!exact(body, ['name']) || typeof body.name !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(body.name)) return null;
  const name = body.name.trim();
  return name && [...name].length <= 120 ? name : null;
}
