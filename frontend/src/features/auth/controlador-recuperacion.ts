import { ApiError } from '../../services/http/errores-http';
import { validEmail } from './validacion-login';
import type { RecoveryPolicy, RecoveryService } from './servicio-recuperacion';

export type RecoveryErrors = Partial<Record<'email' | 'code' | 'password' | 'confirmation', string>>;
export const defaultRecoveryPolicy: RecoveryPolicy = Object.freeze({ retryAfterSeconds: 60, expiresInSeconds: 900, passwordMinCodePoints: 15, passwordMaxBytes: 1024 });
type State = Readonly<{ stage: 'request' | 'code' | 'done'; email: string; busy: boolean; resendAt: number;
  expiresAt: number; policy: RecoveryPolicy; errors: RecoveryErrors; message?: string }>;

export function validateRecoveryPassword(code: string, password: string, confirmation: string, policy = defaultRecoveryPolicy): RecoveryErrors {
  const errors: RecoveryErrors = {};
  if (!/^\d{6}$/.test(code)) errors.code = 'Escribe los seis dígitos del código.';
  let bytes = 0;
  for (const char of password) { const point = char.codePointAt(0)!; bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4; }
  if (!password.trim() || /\p{Cs}/u.test(password) || bytes > policy.passwordMaxBytes) errors.password = 'Ingresa una contraseña válida, de hasta 1024 bytes UTF-8.';
  else if ([...password].length < policy.passwordMinCodePoints) errors.password = `Utiliza al menos ${policy.passwordMinCodePoints} caracteres.`;
  if (!confirmation || password !== confirmation) errors.confirmation = 'Las contraseñas deben coincidir exactamente.';
  return errors;
}
function safeMessage(error: unknown, confirm = false): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return 'Demasiados intentos. Espera antes de volver a intentarlo.';
    if (error.status === 503 || error.status === 404) return 'La recuperación aún no está disponible. No se ha confirmado el envío ni un cambio de contraseña.';
    if (error.status === 400 && confirm) return 'El código no es válido, caducó o ya fue utilizado.';
    if (error.kind === 'network' || error.kind === 'timeout') return confirm
      ? 'No pudimos confirmar el resultado. Puedes intentar iniciar sesión o solicitar otro código.'
      : 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
  }
  return 'No pudimos completar la solicitud. Inténtalo de nuevo.';
}
export function createRecoveryController(service: RecoveryService, now = Date.now) {
  let state: State = Object.freeze({ stage: 'request', email: '', busy: false, resendAt: 0, expiresAt: 0, policy: defaultRecoveryPolicy, errors: {} });
  let operation: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: State) => { state = Object.freeze(next); listeners.forEach(fn => fn()); };
  return Object.freeze({
    getSnapshot: () => state,
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    cancel() { operation?.abort(); operation = null; if (state.busy) publish({ ...state, busy: false }); },
    async request(input = state.email) {
      if (state.busy) return false;
      const email = input.trim().toLowerCase();
      if (!validEmail(email)) { publish({ ...state, errors: { email: 'Ingresa un correo electrónico válido.' } }); return false; }
      if (state.email === email && now() < state.resendAt) { publish({ ...state, message: 'Espera antes de solicitar otro código.' }); return false; }
      const current = new AbortController(); operation = current;
      publish({ ...state, email, busy: true, errors: {}, message: undefined });
      try {
        const policy = await service.request(email, current.signal);
        if (operation !== current) return false;
        publish({ stage: 'code', email, busy: false, resendAt: now() + policy.retryAfterSeconds * 1000,
          expiresAt: now() + policy.expiresInSeconds * 1000, policy, errors: {} });
        return true;
      } catch (error) {
        if (operation === current) publish({ ...state, busy: false, message: safeMessage(error),
          resendAt: error instanceof ApiError && error.status === 429 ? now() + (error.retryAfterSeconds ?? 900) * 1000 : state.resendAt });
        return false;
      } finally { if (operation === current) operation = null; }
    },
    async confirm(code: string, password: string, confirmation: string) {
      if (state.busy || state.stage !== 'code') return false;
      const errors = validateRecoveryPassword(code, password, confirmation, state.policy);
      if (Object.keys(errors).length) { publish({ ...state, errors, message: undefined }); return false; }
      const current = new AbortController(); operation = current;
      publish({ ...state, busy: true, errors: {}, message: undefined });
      try {
        await service.confirm({ email: state.email, code, password }, current.signal);
        if (operation !== current) return false;
        publish({ ...state, stage: 'done', busy: false, errors: {} }); return true;
      } catch (error) {
        if (operation === current) publish({ ...state, busy: false, message: safeMessage(error, true) });
        return false;
      } finally { if (operation === current) operation = null; }
    },
  });
}
