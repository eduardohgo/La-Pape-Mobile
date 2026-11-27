import type { OppositionInput } from './contratos-privacidad';
import { ApiError } from '../../services/http/errores-http';
import { isOpaqueToken, type AuthService, type AuthSession } from './servicio-auth';
import type { LoginCredentials } from './validacion-login';

export type TokenStorage = {
  read(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
};

type SessionState =
  | { status: 'restoring' | 'logging-in' | 'logging-out' }
  | { status: 'guest'; message?: string }
  | { status: 'restore-error' | 'cleanup-error'; message: string }
  | { status: 'authenticated'; session: AuthSession };

const expiredMessage = 'Tu sesión venció. Vuelve a iniciar sesión.';
const cleanupMessage = 'No pudimos borrar la sesión del dispositivo. Vuelve a intentarlo.';
const unconfirmedLogout = 'La sesión se borró de este dispositivo. No pudimos confirmar su cierre en el servidor.';

export function sessionDeadline(session: AuthSession) {
  return Math.min(Date.parse(session.expiresAt), Date.parse(session.idleExpiresAt));
}

function authMessage(error: unknown, login: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 401 && login) return 'Correo o contraseña incorrectos.';
    if (error.status === 400 && login) return 'Revisa el correo y la contraseña e inténtalo de nuevo.';
    if (error.status === 429) {
      const minutes = Math.ceil((error.retryAfterSeconds ?? 0) / 60);
      return minutes > 0
        ? 'Demasiados intentos. Vuelve a intentarlo en ' + minutes + (minutes === 1 ? ' minuto.' : ' minutos.')
        : 'Demasiados intentos. Inténtalo más tarde.';
    }
    if (error.kind === 'configuration' || error.status === 403) return 'Configura una dirección HTTPS válida para acceder a tu cuenta.';
    if (error.kind === 'network') return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
    if (error.kind === 'timeout') return 'El servidor tardó demasiado. Vuelve a intentarlo.';
  }
  return 'El acceso a tu cuenta no está disponible por ahora. Inténtalo más tarde.';
}

export function createSessionController(service: AuthService, storage: TokenStorage, now = Date.now) {
  let state: SessionState = { status: 'restoring' };
  let token: string | undefined;
  let pending = false;
  let cleanupNotice: string | undefined;
  const listeners = new Set<() => void>();

  function update(next: SessionState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  async function clearLocal(notice?: string | Promise<string | undefined>) {
    token = undefined;
    let cleared = false;
    try {
      await storage.clear();
      cleared = true;
    } catch { /* Keep the account hidden and allow deletion to be retried. */ }
    const message = await notice;
    cleanupNotice = cleared ? undefined : message;
    update(cleared ? { status: 'guest', message } : { status: 'cleanup-error', message: cleanupMessage });
  }

  async function restore() {
    if (pending || !['restoring', 'restore-error', 'authenticated'].includes(state.status)) return;
    const existing = state.status === 'authenticated' ? state.session : undefined;
    pending = true;
    update({ status: 'restoring' });
    try {
      if (existing && sessionDeadline(existing) <= now()) {
        await clearLocal(expiredMessage);
        return;
      }
      const saved = token ?? await storage.read();
      if (saved === null) {
        update({ status: 'guest' });
        return;
      }
      if (!isOpaqueToken(saved)) {
        await clearLocal();
        return;
      }
      token = saved;
      const session = await service.me(saved);
      if (sessionDeadline(session) <= now()) await clearLocal(expiredMessage);
      else update({ status: 'authenticated', session });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await clearLocal(expiredMessage);
      else update({ status: 'restore-error', message: authMessage(error, false) });
    } finally {
      pending = false;
    }
  }

  async function login(credentials: LoginCredentials, remember = true): Promise<boolean> {
    if (pending || state.status !== 'guest') return false;
    pending = true;
    update({ status: 'logging-in' });
    try {
      const result = await service.login(credentials);
      if (sessionDeadline(result.session) <= now()) {
        update({ status: 'guest', message: expiredMessage });
        return false;
      }
      try {
        if (remember) await storage.save(result.token);
      } catch {
        try { await service.logout(result.token); } catch { /* Revocation is best-effort after a storage failure. */ }
        await clearLocal('No pudimos guardar la sesión de forma segura.');
        return false;
      }
      token = result.token;
      update({ status: 'authenticated', session: result.session });
      return true;
    } catch (error) {
      update({ status: 'guest', message: authMessage(error, true) });
      return false;
    } finally {
      pending = false;
    }
  }

  async function deleteAccount(password: string) {
    if (pending || state.status !== 'authenticated' || !token) return 'busy';
    pending = true;
    try {
      await service.deleteAccount(token, password);
      await clearLocal();
      return getDeletionResult();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await clearLocal(expiredMessage);
        return 'expired';
      }
      throw error;
    } finally {
      pending = false;
    }
  }

  async function readPrivacy<T>(action: (current: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (pending || state.status !== 'authenticated' || !token) throw new ApiError('cancelled');
    const current = token;
    try {
      const result = await action(current);
      if (signal?.aborted || token !== current || state.status !== 'authenticated') throw new ApiError('cancelled');
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && token === current && !pending) {
        pending = true;
        try { await clearLocal(expiredMessage); } finally { pending = false; }
      }
      throw error;
    }
  }

  async function runPrivacy<T>(action: (current: string) => Promise<T>, apply?: (value: T) => void) {
    if (pending || state.status !== 'authenticated' || !token) throw new ApiError('cancelled');
    const current = token;
    pending = true;
    try {
      const value = await action(current);
      apply?.(value);
      return value;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await clearLocal(expiredMessage);
      throw error;
    } finally {
      pending = false;
      await expire();
    }
  }

  function getDeletionResult() {
    return state.status === 'cleanup-error' ? 'cleanup-error' : 'deleted';
  }

  async function logout() {
    if (pending || !['authenticated', 'restore-error'].includes(state.status)) return;
    pending = true;
    update({ status: 'logging-out' });
    // Clear SecureStore while revocation is in flight, even if the network stalls.
    const notice = token
      ? service.logout(token).then(() => undefined, () => unconfirmedLogout)
      : unconfirmedLogout;
    try { await clearLocal(notice); } finally { pending = false; }
  }

  async function expire() {
    if (pending || state.status !== 'authenticated' || sessionDeadline(state.session) > now()) return;
    pending = true;
    update({ status: 'restoring' });
    try { await clearLocal(expiredMessage); } finally { pending = false; }
  }

  async function retryCleanup() {
    if (pending || state.status !== 'cleanup-error') return;
    pending = true;
    try { await clearLocal(cleanupNotice); } finally { pending = false; }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    restore,
    resume() { return state.status === 'authenticated' ? restore() : undefined; },
    login,
    logout,
    deleteAccount,
    async readPrivacyData(signal?: AbortSignal) {
      const owner = state.status === 'authenticated' ? state.session.user.id : null;
      const result = await readPrivacy(current => service.readPrivacyData(current, signal), signal);
      if (result.account.id !== owner) throw new ApiError('invalid-response');
      return result;
    },
    readPrivacyPreferences: (signal?: AbortSignal) => readPrivacy(current => service.readPrivacyPreferences(current, signal), signal),
    listOppositions: (cursor?: string, signal?: AbortSignal) => readPrivacy(current => service.listOppositions(current, cursor, signal), signal),
    readOpposition: (folio: string, signal?: AbortSignal) => readPrivacy(current => service.readOpposition(current, folio, signal), signal),
    createOpposition: (input: OppositionInput) => runPrivacy(current => service.createOpposition(current, input)),
    recordPromotions: (key: string, version: string, granted: boolean) =>
      runPrivacy(current => service.recordPromotions(current, key, version, granted)),
    updateProfileName: (name: string) => runPrivacy(current => service.updateProfileName(current, name),
      session => {
        if (state.status !== 'authenticated' || session.user.id !== state.session.user.id) {
          throw new ApiError('invalid-response');
        }
        update({ status: 'authenticated', session });
      }),
    expire,
    retryCleanup,
  };
}

export type SessionController = ReturnType<typeof createSessionController>;
