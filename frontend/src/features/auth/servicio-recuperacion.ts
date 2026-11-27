import type { ApiConfig } from '../../config/configuracion-api';
import { createHttpClient, type FetchFunction } from '../../services/http/cliente-http';
import { ApiError } from '../../services/http/errores-http';

export type RecoveryPolicy = Readonly<{ retryAfterSeconds: number; expiresInSeconds: number; passwordMinCodePoints: number; passwordMaxBytes: number }>;
function isRequest(value: unknown): value is RecoveryPolicy & { message: string } {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.message === 'string' && item.retryAfterSeconds === 60 && item.expiresInSeconds === 900
    && typeof item.passwordMinCodePoints === 'number' && Number.isInteger(item.passwordMinCodePoints)
    && item.passwordMinCodePoints >= 8 && item.passwordMinCodePoints <= 128 && item.passwordMaxBytes === 1024;
}
const changed = (value: unknown): value is { changed: true } => !!value && typeof value === 'object' && 'changed' in value && value.changed === true;

export function createRecoveryService(config: ApiConfig, request: FetchFunction = fetch) {
  const client = createHttpClient(config, async (url, options) => {
    const response = await request(url, options);
    if (response.ok && response.status !== (url.endsWith('/request') ? 202 : 200)) throw new ApiError('invalid-response');
    return response;
  });
  return {
    async request(email: string, signal?: AbortSignal): Promise<RecoveryPolicy> {
      const result = await client.post('/auth/password-recovery/request', { email }, isRequest, { signal });
      return { retryAfterSeconds: result.retryAfterSeconds, expiresInSeconds: result.expiresInSeconds,
        passwordMinCodePoints: result.passwordMinCodePoints, passwordMaxBytes: result.passwordMaxBytes };
    },
    async confirm(input: { email: string; code: string; password: string }, signal?: AbortSignal) {
      await client.post('/auth/password-recovery/confirm', input, changed, { signal });
    },
  };
}
export type RecoveryService = ReturnType<typeof createRecoveryService>;
