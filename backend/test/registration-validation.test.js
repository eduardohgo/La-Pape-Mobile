import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTRATION_VALIDATION, validateRegistration } from '../src/validators/validacion-registro.js';

const valid = () => ({ name: 'María José O’Neill', email: 'Maria.Jose+escuela@EXAMPLE.COM', password: ' frase de prueba á 🔒 ' });

function rejects(input, field, code) {
  const result = validateRegistration(input);
  assert.equal(result.ok, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.passwordPolicy, 'approved-length');
  assert.equal(Object.hasOwn(result, 'data'), false);
  assert.ok(result.errors.some((error) => error.field === field && error.code === code));
  return result;
}

test('valid registration returns only allowed fields and conservative normalized data', () => {
  const input = Object.freeze({ ...valid(), name: ' María José O’Neill ', email: ' Maria.Jose+escuela@EXAMPLE.COM ' });
  const before = { ...input };
  const result = validateRegistration(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    name: 'María José O’Neill', email: 'Maria.Jose+escuela@example.com',
    emailKey: 'maria.jose+escuela@example.com', password: input.password,
  });
  assert.deepEqual(input, before);
  assert.notEqual(result.data, input);
  assert.deepEqual(Object.keys(result.data).sort(), ['email', 'emailKey', 'name', 'password']);
  assert.deepEqual(validateRegistration(input), result);
});

test('local email case, dots and plus suffixes are preserved rather than merged', () => {
  const emails = ['A.B+ventas@example.com', 'AB+ventas@example.com', 'A.B@example.com', 'a.b+ventas@example.com'];
  assert.deepEqual(emails.map((email) => validateRegistration({ ...valid(), email }).data.email), emails);
  assert.deepEqual(emails.map((email) => validateRegistration({ ...valid(), email }).data.emailKey), [
    'a.b+ventas@example.com', 'ab+ventas@example.com', 'a.b@example.com', 'a.b+ventas@example.com',
  ]);
});

test('case-only email variants share a canonical key while keeping a contact representation', () => {
  const emails = [' Maria.Jose+Escuela@EXAMPLE.COM ', 'maria.jose+escuela@example.com', 'MARIA.JOSE+ESCUELA@Example.Com'];
  const results = emails.map((email) => validateRegistration({ ...valid(), email }).data);
  assert.deepEqual(results.map(({ emailKey }) => emailKey), Array(3).fill('maria.jose+escuela@example.com'));
  assert.deepEqual(results.map(({ email }) => email), [
    'Maria.Jose+Escuela@example.com', 'maria.jose+escuela@example.com', 'MARIA.JOSE+ESCUELA@example.com',
  ]);
  rejects({ ...valid(), emailKey: 'another@example.com' }, null, 'UNKNOWN_FIELDS');
});

test('non-object bodies and class instances are rejected without coercion', () => {
  for (const input of [null, undefined, true, 12, 'text', [], new Date(), new String('text')]) {
    rejects(input, null, 'INVALID_OBJECT');
  }
});

test('every required field must be an own enumerable string data property', () => {
  for (const field of ['name', 'email', 'password']) {
    const missing = valid();
    delete missing[field];
    rejects(missing, field, 'REQUIRED');
    for (const value of [null, undefined, 123, false, [], {}, new String('value')]) {
      rejects({ ...valid(), [field]: value }, field, 'INVALID_TYPE');
    }
    for (const value of ['', '   ', '\t\n', '\u00a0']) {
      rejects({ ...valid(), [field]: value }, field, 'EMPTY');
    }
    const accessor = valid();
    Object.defineProperty(accessor, field, { get() { assert.fail('getter must not run'); } });
    rejects(accessor, field, 'INVALID_PROPERTY');
    const hidden = valid();
    Object.defineProperty(hidden, field, { enumerable: false });
    rejects(hidden, field, 'INVALID_PROPERTY');
  }
});

test('privileged fields are rejected even for CLIENTE, false, null or undefined', () => {
  for (const field of ['role', 'rol', 'permissions', 'isAdmin']) {
    for (const value of ['CLIENTE', 'TRABAJADOR', 'ADMIN', 'DUENO', ['admin'], true, false, null, undefined]) {
      rejects({ ...valid(), [field]: value }, null, 'PRIVILEGED_FIELDS');
    }
  }
});

test('unknown fields, aliases and prototype-pollution payloads are rejected', () => {
  for (const field of ['nombre', 'correo', 'confirmPassword', 'Role', 'role_code', 'user', 'branchId', 'constructor', 'prototype']) {
    rejects({ ...valid(), [field]: { role: 'DUENO' } }, null, 'UNKNOWN_FIELDS');
  }
  const input = JSON.parse(JSON.stringify(valid()).slice(0, -1) + ',"__proto__":{"role":"DUENO"}}');
  rejects(input, null, 'UNKNOWN_FIELDS');
  assert.equal(Object.prototype.role, undefined);
  rejects(Object.assign(Object.create({ role: 'DUENO' }), valid()), null, 'INVALID_OBJECT');
});

test('hidden, symbol and accessor extra fields cannot bypass the allowlist', () => {
  const hidden = valid();
  Object.defineProperty(hidden, 'role', { value: 'ADMIN' });
  rejects(hidden, null, 'PRIVILEGED_FIELDS');
  rejects({ ...valid(), [Symbol('extra')]: true }, null, 'UNKNOWN_FIELDS');
  const accessor = valid();
  Object.defineProperty(accessor, 'extra', { get() { assert.fail('getter must not run'); } });
  rejects(accessor, null, 'UNKNOWN_FIELDS');
  assert.equal(validateRegistration(Object.assign(Object.create(null), valid())).ok, true);
});

test('name accepts Unicode and punctuation but rejects controls and malformed text', () => {
  for (const name of ['李 小龍', 'Ana-María', "D’Angelo", 'Ana  María', 'A']) {
    assert.equal(validateRegistration({ ...valid(), name }).data.name, name);
  }
  for (const name of ['Ana\nMaría', 'Ana\0María', 'Ana\u200bMaría', 'Ana\ud800']) {
    rejects({ ...valid(), name }, 'name', 'INVALID_FORMAT');
  }
});

test('name limit counts raw Unicode code points and does not truncate', () => {
  for (const character of ['a', 'á', '𠮷']) {
    assert.equal(validateRegistration({ ...valid(), name: character.repeat(120) }).ok, true);
    rejects({ ...valid(), name: character.repeat(121) }, 'name', 'TOO_LONG');
  }
  rejects({ ...valid(), name: ' ' + 'a'.repeat(120) }, 'name', 'TOO_LONG');
});

test('email rejects malformed, unsupported and non-ASCII formats', () => {
  for (const email of ['a', 'a@@example.com', '@example.com', 'a@', 'a@localhost', '.a@example.com',
    'a.@example.com', 'a..b@example.com', 'a b@example.com', 'a@exam ple.com', 'a\nb@example.com',
    'a\n@example.com', 'a@example\n.com', 'a@-example.com', 'a@example-.com', 'a@example..com', 'a@example.com.', 'a@' + 'a'.repeat(64) + '.com',
    'á@example.com', 'a@ejémplo.com', '"a b"@example.com', 'a@[127.0.0.1]', 'a@example.com\0']) {
    rejects({ ...valid(), email }, 'email', 'INVALID_FORMAT');
  }
  assert.equal(validateRegistration({ ...valid(), email: 'a@xn--ejemplo-9za.com' }).ok, true);
});

test('email enforces local-part and total raw length boundaries', () => {
  assert.equal(validateRegistration({ ...valid(), email: 'a'.repeat(64) + '@example.com' }).ok, true);
  rejects({ ...valid(), email: 'a'.repeat(65) + '@example.com' }, 'email', 'INVALID_FORMAT');
  const email = 'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(61);
  assert.equal(email.length, 254);
  assert.equal(validateRegistration({ ...valid(), email }).ok, true);
  rejects({ ...valid(), email: email + 'd' }, 'email', 'TOO_LONG');
  rejects({ ...valid(), email: ' ' + email }, 'email', 'TOO_LONG');
});

test('password has a byte ceiling, preserves exact text and rejects malformed Unicode', () => {
  for (const password of ['a'.repeat(1024), 'á'.repeat(512), '🔒'.repeat(256), '  e\u0301'.repeat(5) + '  ']) {
    assert.equal(validateRegistration({ ...valid(), password }).data.password, password);
  }
  for (const password of ['a'.repeat(1025), 'á'.repeat(513), '🔒'.repeat(257)]) {
    rejects({ ...valid(), password }, 'password', 'TOO_LONG');
  }
  rejects({ ...valid(), password: '\ud800' }, 'password', 'INVALID_FORMAT');
});

test('approved length policy still explicitly reports registration as not production ready', () => {
  assert.equal(Object.isFrozen(REGISTRATION_VALIDATION), true);
  for (const password of ['a'.repeat(15), '1'.repeat(15), '!'.repeat(15), 'sin símbolos obligatorios', 'a\nb'.repeat(5)]) {
    const result = validateRegistration({ ...valid(), password });
    assert.equal(result.ok, true);
    assert.equal(result.productionReady, false);
    assert.equal(result.passwordPolicy, 'approved-length');
    assert.equal(result.passwordMinCodePoints, 15);
  }
});

test('password minimum counts Unicode code points rather than UTF-16 units or UTF-8 bytes', () => {
  for (const character of ['a', 'á', '🔒', '𠮷']) {
    for (const length of [1, 7, 14]) {
      rejects({ ...valid(), password: character.repeat(length) }, 'password', 'TOO_SHORT');
    }
    for (const length of [15, 16, 64]) {
      const password = character.repeat(length);
      const result = validateRegistration({ ...valid(), password });
      assert.equal(result.ok, true);
      assert.equal(result.data.password, password);
    }
  }
});

test('password is never trimmed, case-folded or Unicode-normalized', () => {
  for (const password of ['  AbCdEfGhIjKlM  ', 'e\u0301'.repeat(8), 'é'.repeat(15), '🔒'.repeat(15)]) {
    const input = Object.freeze({ ...valid(), password });
    assert.equal(validateRegistration(input).data.password, password);
    assert.equal(input.password, password);
  }
  rejects({ ...valid(), password: 'é'.repeat(14) }, 'password', 'TOO_SHORT');
  // Combining marks are separate code points; grapheme clusters are not the unit.
  assert.equal(validateRegistration({ ...valid(), password: 'e\u0301'.repeat(7) + 'a' }).ok, true);
});

test('empty, whitespace-only and malformed Unicode passwords remain invalid under the approved policy', () => {
  for (const password of ['', ' '.repeat(15), '\u00a0'.repeat(15), '\t\n'.repeat(15)]) {
    rejects({ ...valid(), password }, 'password', 'EMPTY');
  }
  for (const password of ['\ud800', '\udc00', 'a'.repeat(15) + '\ud800', '\udc00' + 'a'.repeat(15)]) {
    rejects({ ...valid(), password }, 'password', 'INVALID_FORMAT');
  }
});

test('validation errors accumulate field failures but never reflect secrets or input keys', () => {
  const result = validateRegistration({ name: '', email: 'private-invalid-email', password: 'secret'.repeat(200) });
  assert.deepEqual(result.errors.map(({ field }) => field), ['name', 'email', 'password']);
  assert.doesNotMatch(JSON.stringify(result), /private-invalid-email|secret/);
  const short = rejects({ ...valid(), password: 'private-short' }, 'password', 'TOO_SHORT');
  assert.doesNotMatch(JSON.stringify(short), /private-short|Maria\.Jose|escuela|example\.com/);
  const extra = rejects({ ...valid(), 'private-key-do-not-reflect': true, role: 'DUENO' }, null, 'UNKNOWN_FIELDS');
  assert.ok(extra.errors.some(({ code }) => code === 'PRIVILEGED_FIELDS'));
  assert.doesNotMatch(JSON.stringify(extra), /private-key-do-not-reflect|DUENO/);
});
