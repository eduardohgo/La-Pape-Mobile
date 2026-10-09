import { getApiConfig } from '../config/env';
import { createHttpClient, type RequestOptions } from './http/client';

export type HealthResponse = { ok: true; ts: number };

export function isHealthResponse(data: unknown): data is HealthResponse {
  if (typeof data !== 'object' || data === null) return false;
  const value = data as Record<string, unknown>;
  return value.ok === true && typeof value.ts === 'number' && Number.isSafeInteger(value.ts) && value.ts >= 0;
}

export function checkApiHealth(options: RequestOptions = {}): Promise<HealthResponse> {
  return createHttpClient(getApiConfig()).get('/health', isHealthResponse, options);
}
