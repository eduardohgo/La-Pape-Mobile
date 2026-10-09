import { ApiError } from '../services/http/errors';

export type ApiEnvironment = 'development' | 'staging' | 'production';
export type ApiConfig = Readonly<{ baseUrl: string; timeoutMs: number; environment: ApiEnvironment }>;
type PublicEnv = { url?: string; environment?: string; timeoutMs?: string };

function isLocalHost(host: string): boolean {
  if (['localhost', '[::1]'].includes(host)) return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

export function parseApiConfig(env: PublicEnv, developmentBuild: boolean): ApiConfig {
  const environment = env.environment?.trim() || (developmentBuild ? 'development' : 'production');
  if (!['development', 'staging', 'production'].includes(environment) ||
      (!developmentBuild && environment === 'development')) throw new ApiError('configuration');

  let url: URL;
  try {
    url = new URL(env.url?.trim() || '');
  } catch {
    throw new ApiError('configuration');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' && (!developmentBuild || environment !== 'development' || !isLocalHost(url.hostname)))) {
    throw new ApiError('configuration');
  }
  const timeout = env.timeoutMs?.trim() || '15000';
  if (!/^\d+$/.test(timeout) || Number(timeout) < 100 || Number(timeout) > 60000) throw new ApiError('configuration');
  return Object.freeze({ baseUrl: url.origin, timeoutMs: Number(timeout), environment: environment as ApiEnvironment });
}

// Expo substitutes only direct, static EXPO_PUBLIC property access.
export function getApiConfig(): ApiConfig {
  return parseApiConfig({
    url: process.env.EXPO_PUBLIC_API_URL,
    environment: process.env.EXPO_PUBLIC_API_ENV,
    timeoutMs: process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
  }, __DEV__);
}
