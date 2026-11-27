import type { ApiConfig } from '../../config/configuracion-api';
import { createHttpClient, type FetchFunction } from '../../services/http/cliente-http';
import { ApiError } from '../../services/http/errores-http';
import {
  isFolio, isOppositionDetail, isOppositionPage, isPrivacyDecision, isPrivacyPreferences, validPrivacyDate,
  type OppositionInput, type PrivacyDecision,
} from './contratos-privacidad';
import { validEmail, type LoginCredentials } from './validacion-login';

type AuthUser = Readonly<{ id: string; name: string; email: string; role: string }>;
export type AuthSession = Readonly<{ user: AuthUser; expiresAt: string; idleExpiresAt: string }>;
export type PrivacyData = Readonly<{
  account: AuthUser;
  createdAt: string;
  emailVerifiedAt: string;
  decisions: readonly PrivacyDecision[];
}>;
type LoginResponse = AuthSession & { tokenType: 'Bearer'; accessToken: string; tokenFormat?: 'jwt' };

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const roles = new Set(['CLIENTE', 'TRABAJADOR', 'ADMIN', 'DUENO']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOpaqueToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}

export function isJwtToken(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2400
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

export function isAuthToken(value: unknown): value is string {
  return isOpaqueToken(value) || isJwtToken(value);
}

function isSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  const { user, expiresAt, idleExpiresAt } = value;
  if (typeof expiresAt !== 'string' || typeof idleExpiresAt !== 'string') return false;
  const absolute = Date.parse(expiresAt);
  const idle = Date.parse(idleExpiresAt);
  return Number.isFinite(absolute) && Number.isFinite(idle) && idle <= absolute && isUser(user);
}

function isUser(user: unknown): user is AuthUser {
  return isRecord(user) && typeof user.id === 'string' && uuid.test(user.id)
    && typeof user.name === 'string' && !!user.name.trim()
    && typeof user.email === 'string' && validEmail(user.email)
    && typeof user.role === 'string' && roles.has(user.role);
}

function isPrivacyData(value: unknown): value is PrivacyData {
  return isRecord(value) && isUser(value.account)
    && validPrivacyDate(value.createdAt) && validPrivacyDate(value.emailVerifiedAt)
    && Array.isArray(value.decisions) && value.decisions.every(isPrivacyDecision);
}

function isLogin(value: unknown): value is LoginResponse {
  return isRecord(value) && value.tokenType === 'Bearer'
    && (value.tokenFormat === 'jwt' ? isJwtToken(value.accessToken)
      : value.tokenFormat === undefined && isOpaqueToken(value.accessToken)) && isSession(value);
}

function publicSession({ user, expiresAt, idleExpiresAt }: AuthSession): AuthSession {
  const { id, name, email, role } = user;
  return { user: { id, name, email, role }, expiresAt, idleExpiresAt };
}

export function createAuthService(config: ApiConfig, fetchRequest?: FetchFunction, preferJwt = false) {
  const http = createHttpClient(config, fetchRequest);
  return {
    async login({ email, password }: LoginCredentials) {
      const result = await http.post('/auth/login', { email, password }, isLogin,
        preferJwt ? { authFormat: 'jwt-v1' } : {});
      return { session: publicSession(result), token: result.accessToken };
    },
    async refresh(token: string) {
      if (!isJwtToken(token)) throw new ApiError('configuration');
      const result = await http.post('/auth/refresh', {}, isLogin, { bearer: token });
      if (result.tokenFormat !== 'jwt') throw new ApiError('invalid-response');
      return { session: publicSession(result), token: result.accessToken };
    },
    async me(token: string) {
      const result = await http.get('/auth/me', isSession, { bearer: token });
      return publicSession(result);
    },
    async readPrivacyData(token: string, signal?: AbortSignal) {
      const { account, createdAt, emailVerifiedAt, decisions } = await http.get('/auth/privacy/data', isPrivacyData,
        { bearer: token, signal });
      const { id, name, email, role } = account;
      return { account: { id, name, email, role }, createdAt, emailVerifiedAt,
        decisions: decisions.map(({ type, purpose, granted, documentVersion, recordedAt }) =>
          ({ type, purpose, granted, documentVersion, recordedAt })) };
    },
    async updateProfileName(token: string, name: string) {
      return publicSession(await http.patch('/auth/privacy/profile', { name }, isSession, { bearer: token }));
    },
    readPrivacyPreferences: (token: string, signal?: AbortSignal) =>
      http.get('/auth/privacy/preferences', isPrivacyPreferences, { bearer: token, signal }),
    listOppositions: (token: string, cursor?: string, signal?: AbortSignal) =>
      http.get('/auth/privacy/requests', isOppositionPage, { bearer: token, signal, ...(cursor && { query: { cursor } }) }),
    readOpposition(token: string, folio: string, signal?: AbortSignal) {
      if (!isFolio(folio)) throw new Error('Folio inválido.');
      return http.get('/auth/privacy/requests/' + folio, isOppositionDetail, { bearer: token, signal });
    },
    createOpposition: (token: string, { requestId, purpose, reason }: OppositionInput) =>
      http.post('/auth/privacy/requests', { requestId, purpose, reason }, isOppositionDetail, { bearer: token }),
    recordPromotions: (token: string, requestId: string, noticeVersion: string, granted: boolean) =>
      http.postNoContent('/auth/privacy/consents/promotions', { bearer: token }, { requestId, noticeVersion, granted }),
    async deleteAccount(token: string, password: string) {
      await http.post('/auth/account/delete', { password, confirm: true },
        (value): value is { deleted: true } => isRecord(value) && value.deleted === true, { bearer: token });
    },
    logout: (token: string) => http.postNoContent('/auth/logout', { bearer: token }),
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
