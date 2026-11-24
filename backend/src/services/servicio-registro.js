import { createHash, createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { logFailure } from '../log-operativo.js';
export const REGISTRATION_POLICY = Object.freeze({ expiresInSeconds: 900, retryAfterSeconds: 60,
  passwordMinCodePoints: 8, passwordMaxBytes: 1024 });
const hash = secret => createHash('sha256').update(Buffer.from(secret, 'base64url')).digest();
export function createRegistrationService(repository, hasher, { key, mailer }) {
  let pending = 0;
  const jobs = new Set();
  const mac = (...parts) => createHmac('sha256', key).update(JSON.stringify(parts)).digest();
  const budget = (subject, origin, operation) => repository.registrationBudget(
    mac('registration-origin', operation, origin), mac('registration-account', operation, subject), operation);
  function enqueue(email, code, id, digest) {
    const deliver = async () => {
      let sent = false;
      try { await mailer.send(email, code); sent = true; } catch { logFailure('registration_mail_failed'); }
      try { await repository.registrationDelivery(id, digest, sent); }
      catch { logFailure('registration_delivery_update_failed'); }
    };
    const job = deliver().finally(() => jobs.delete(job));
    jobs.add(job);
  }
  return Object.freeze({
    async request(input, origin) {
      if (pending + jobs.size >= 2) return { status: 'limited' };
      pending++;
      try {
        if (!await budget(input.emailKey, origin, 'request')) return { status: 'limited' };
        const passwordHash = await hasher.hash(input.password);
        const challengeId = randomUUID();
        const verificationToken = randomBytes(32).toString('base64url');
        const code = String(randomInt(1000000)).padStart(6, '0');
        const digest = mac('registration-otp', challengeId, verificationToken, code);
        const account = await repository.prepareRegistration(input.name, input.email, passwordHash,
          challengeId, hash(verificationToken), digest);
        if (account) enqueue(account.email, code, challengeId, digest);
        return { status: 'accepted', data: { ...REGISTRATION_POLICY, challengeId, verificationToken,
          message: 'Solicitud recibida. Si el correo puede registrarse, recibirás un código. No se ha activado ninguna cuenta.' } };
      } finally { pending--; }
    },
    async resend(input, origin) {
      if (pending + jobs.size >= 2) return { status: 'limited' };
      pending++;
      try {
        if (!await budget(input.challengeId, origin, 'resend')) return { status: 'limited' };
        const code = String(randomInt(1000000)).padStart(6, '0');
        const digest = mac('registration-otp', input.challengeId, input.verificationToken, code);
        const account = await repository.resendRegistration(input.challengeId, hash(input.verificationToken), digest);
        if (account) enqueue(account.email, code, input.challengeId, digest);
        return { status: 'accepted', data: { ...REGISTRATION_POLICY,
          message: 'Solicitud recibida. Si corresponde, recibirás un nuevo código.' } };
      } finally { pending--; }
    },
    async verify(input, origin) {
      if (!await budget(input.challengeId, origin, 'verify')) return { status: 'limited' };
      const ok = await repository.confirmRegistration(input.challengeId, hash(input.verificationToken),
        mac('registration-otp', input.challengeId, input.verificationToken, input.code));
      return { status: ok ? 'verified' : 'invalid' };
    },
    close: () => Promise.allSettled([...jobs]),
  });
}
