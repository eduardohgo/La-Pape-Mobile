import { Buffer } from 'node:buffer';

// Approved length policy. Compromised-password checks and real registration are absent.
export const REGISTRATION_VALIDATION = Object.freeze({
  productionReady: false,
  passwordPolicy: 'approved-length',
  nameMaxCodePoints: 120,
  emailMaxLength: 254,
  passwordMinCodePoints: 15,
  passwordMaxBytes: 1024,
});

const ALLOWED_FIELDS = new Set(['name', 'email', 'password']);
const PRIVILEGED_FIELDS = new Set(['role', 'rol', 'permissions', 'isAdmin']);
const INVALID_NAME = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const LOCAL_EMAIL = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

function failure(errors) {
  // Neither supplied values nor unknown property names are reflected in errors.
  return { ok: false, ...REGISTRATION_VALIDATION, errors };
}

function validEmail(email) {
  if (/[^\x21-\x7e]/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  const labels = domain.split('.');
  return local.length >= 1 && local.length <= 64
    && LOCAL_EMAIL.test(local) && !local.startsWith('.') && !local.endsWith('.')
    && !local.includes('..') && labels.length >= 2
    && labels.every((label) => DOMAIN_LABEL.test(label));
}

/**
 * Validate a plain JSON registration object without I/O or input mutation.
 * An ok result passes this contract, not compromised-password or ownership checks.
 * The future service MUST assign CLIENTE itself; no role is returned here.
 */
export function validateRegistration(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    return failure([{ field: null, code: 'INVALID_OBJECT' }]);
  }

  const keys = Reflect.ownKeys(input);
  const errors = [];
  if (keys.some((key) => PRIVILEGED_FIELDS.has(key))) {
    errors.push({ field: null, code: 'PRIVILEGED_FIELDS' });
  }
  if (keys.some((key) => !ALLOWED_FIELDS.has(key) && !PRIVILEGED_FIELDS.has(key))) {
    errors.push({ field: null, code: 'UNKNOWN_FIELDS' });
  }
  if (errors.length) return failure(errors);

  const values = {};
  for (const field of ALLOWED_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor) errors.push({ field, code: 'REQUIRED' });
    else if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      errors.push({ field, code: 'INVALID_PROPERTY' });
    } else if (typeof descriptor.value !== 'string') {
      errors.push({ field, code: 'INVALID_TYPE' });
    } else values[field] = descriptor.value;
  }
  if (errors.length) return failure(errors);

  // Size limits apply to raw input; no coercion or silent truncation.
  const name = values.name.trim();
  if (!name) errors.push({ field: 'name', code: 'EMPTY' });
  else if ([...values.name].length > REGISTRATION_VALIDATION.nameMaxCodePoints) {
    errors.push({ field: 'name', code: 'TOO_LONG' });
  } else if (INVALID_NAME.test(name)) errors.push({ field: 'name', code: 'INVALID_FORMAT' });

  const email = values.email.trim();
  if (!email) errors.push({ field: 'email', code: 'EMPTY' });
  else if (values.email.length > REGISTRATION_VALIDATION.emailMaxLength) {
    errors.push({ field: 'email', code: 'TOO_LONG' });
  } else if (!validEmail(email)) errors.push({ field: 'email', code: 'INVALID_FORMAT' });

  const password = values.password;
  if (!password.trim()) errors.push({ field: 'password', code: 'EMPTY' });
  else if (Buffer.byteLength(password, 'utf8') > REGISTRATION_VALIDATION.passwordMaxBytes) {
    errors.push({ field: 'password', code: 'TOO_LONG' });
  } else if (/\p{Cs}/u.test(password)) {
    // Reject malformed Unicode rather than let UTF-8 encoding replace it silently.
    errors.push({ field: 'password', code: 'INVALID_FORMAT' });
  } else if ([...password].length < REGISTRATION_VALIDATION.passwordMinCodePoints) {
    errors.push({ field: 'password', code: 'TOO_SHORT' });
  }

  if (errors.length) return failure(errors);
  const at = email.indexOf('@');
  return {
    ok: true,
    ...REGISTRATION_VALIDATION,
    data: {
      name,
      email: email.slice(0, at + 1) + email.slice(at + 1).toLowerCase(),
      emailKey: email.toLowerCase(),
      password,
    },
  };
}
