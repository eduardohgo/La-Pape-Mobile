import type { ApiConfig } from '../../config/configuracion-api';
import { createHttpClient, type FetchFunction } from '../../services/http/cliente-http';
import { ApiError } from '../../services/http/errores-http';
import { isLegalDocuments, type SignupPrivacy } from './contratos-privacidad';
export type RegistrationInput = Readonly<{ name: string; email: string; password: string; confirmation: string }>;
export type RegistrationChallenge = Readonly<{ challengeId: string; verificationToken: string }>;
export type RegistrationRequest = RegistrationChallenge & { message: string; expiresInSeconds: number; retryAfterSeconds: number };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
function accepted(value: unknown): value is RegistrationRequest {
  return record(value) && typeof value.challengeId === 'string'
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.challengeId)
    && typeof value.verificationToken === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value.verificationToken)
    && policy(value);
}
function policy(value: unknown): value is { message: string; expiresInSeconds: number; retryAfterSeconds: number } {
  return record(value) && typeof value.message === 'string' && value.expiresInSeconds === 900
    && value.retryAfterSeconds === 60 && value.passwordMinCodePoints === 8 && value.passwordMaxBytes === 1024;
}
const verified = (value: unknown): value is { verified: true } => record(value) && value.verified === true;
export function createRegistrationService(config: ApiConfig, request: FetchFunction = fetch) {
  const client = createHttpClient(config, async (url, options) => {
    const response = await request(url, options);
    if (response.ok && response.status !== (options.method === 'GET' || url.endsWith('/verify') ? 200 : 202)) throw new ApiError('invalid-response');
    return response;
  });
  return {
    documents: (signal?: AbortSignal) => client.get('/auth/register/v2/documents', isLegalDocuments, { signal }),
    request(input: RegistrationInput, signal?: AbortSignal, privacy?: SignupPrivacy) {
      const body = { name: input.name, email: input.email, password: input.password, confirmation: input.confirmation };
      return client.post(privacy ? '/auth/register/v2' : '/auth/register', privacy ? { ...body, privacy } : body,
        accepted, { signal });
    },
    async resend(input: RegistrationChallenge, signal?: AbortSignal) {
      await client.post('/auth/register/resend', { challengeId: input.challengeId, verificationToken: input.verificationToken }, policy, { signal });
    },
    async verify(input: RegistrationChallenge & { code: string }, signal?: AbortSignal) {
      await client.post('/auth/register/verify', { challengeId: input.challengeId,
        verificationToken: input.verificationToken, code: input.code }, verified, { signal });
    },
  };
}
export type RegistrationService = ReturnType<typeof createRegistrationService>;
