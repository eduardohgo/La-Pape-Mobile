import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createAuthService } from '../src/services/servicio-auth.js';

test('staging deletion rejects every account except the configured disposable fixture', async () => {
  const disposableId = randomUUID();
  const calls = [];
  let candidateId = randomUUID();
  const repository = {
    async deletionCandidate() { return { id: candidateId, passwordHash: 'synthetic' }; },
    async registrationBudget() { calls.push('budget'); return true; },
    async deleteAccount() { calls.push('delete'); return true; },
  };
  const hasher = { async verify() { calls.push('verify'); return true; } };
  const service = createAuthService(repository, hasher, randomBytes(32), null, disposableId);
  const token = randomBytes(32);
  assert.equal(await service.deleteAccount(token, 'synthetic', 'fixture'), 'unauthorized');
  assert.deepEqual(calls, []);
  candidateId = disposableId;
  assert.equal(await service.deleteAccount(token, 'synthetic', 'fixture'), 'deleted');
  assert.deepEqual(calls, ['budget', 'verify', 'delete']);
});

test('staging deletion preserves password verification and the attempt budget', async () => {
  const id = randomUUID();
  let budget = true;
  const repository = {
    async deletionCandidate() { return { id, passwordHash: 'synthetic' }; },
    async registrationBudget() { return budget; },
    async deleteAccount() { assert.fail('Deletion must not run'); },
  };
  const service = createAuthService(repository, { async verify() { return false; } }, randomBytes(32), null, id);
  assert.equal(await service.deleteAccount(randomBytes(32), 'wrong', 'fixture'), 'incorrect');
  budget = false;
  assert.equal(await service.deleteAccount(randomBytes(32), 'wrong', 'fixture'), 'limited');
});
