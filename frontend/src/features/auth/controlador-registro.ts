import { ApiError } from '../../services/http/errores-http';
import { validateRegistrationDraft, type RegistrationDraft } from './validacion-registro';
import type { SignupPrivacy } from './contratos-privacidad';
import type { RegistrationChallenge, RegistrationService } from './servicio-registro';
export type RegistrationState = Readonly<{ stage: 'form' | 'code' | 'done'; busy: boolean; email?: string;
  message?: string; error?: string; expiresAt?: number; resendAt?: number }>;
export function createRegistrationController(api: RegistrationService, now = Date.now) {
  let state: RegistrationState = Object.freeze({ stage: 'form', busy: false });
  let proof: RegistrationChallenge | undefined;
  let request: AbortController | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  function publish(update: Partial<RegistrationState>) {
    state = Object.freeze({ ...state, ...update });
    for (const listener of [...listeners]) listener();
  }
  function fail(error: unknown, verifying: boolean) {
    if (error instanceof ApiError) {
      if (error.kind === 'cancelled') return undefined;
      if (error.status === 409) return 'Cambió la versión del aviso o los términos. Vuelve a consultarlos.';
      if (error.status === 429) return 'Demasiados intentos. Espera antes de reintentar.';
      if (error.status === 400) return verifying ? 'Código inválido, vencido o utilizado. Revisa el correo o solicita otro.' : 'Revisa los datos del formulario.';
      if (error.kind === 'network' || error.kind === 'timeout') return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.';
      if (error.status === 404 || error.status === 503 || error.kind === 'configuration') return 'El registro no está disponible por ahora. No se ha confirmado la activación.';
    }
    return 'No pudimos completar la operación. Inténtalo más tarde.';
  }
  async function run(action: (signal: AbortSignal) => Promise<void>, verifying = false) {
    if (state.busy) return false;
    const current = ++generation;
    const abort = new AbortController();
    request = abort;
    publish({ busy: true, error: undefined });
    try { await action(abort.signal); return current === generation; }
    catch (error) {
      if (current === generation) publish({ error: fail(error, verifying) });
      return false;
    } finally {
      if (current === generation) { request = undefined; publish({ busy: false }); }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    documents: api.documents,
    async register(draft: RegistrationDraft, privacy?: SignupPrivacy) {
      if (state.stage !== 'form' || Object.keys(validateRegistrationDraft(draft)).length) return false;
      return run(async signal => {
        const result = await api.request({ name: draft.name.trim(), email: draft.email.trim(),
          password: draft.password, confirmation: draft.confirmation }, signal, privacy);
        if (signal.aborted) return;
        proof = { challengeId: result.challengeId, verificationToken: result.verificationToken };
        publish({ stage: 'code', email: draft.email.trim(), expiresAt: now() + result.expiresInSeconds * 1000,
          resendAt: now() + result.retryAfterSeconds * 1000,
          message: 'Solicitud recibida. Si el correo puede registrarse, recibirás un código. La cuenta aún no está activa.' });
      });
    },
    async verify(code: string) {
      if (state.stage !== 'code' || !proof || !/^\d{6}$/.test(code)) {
        if (state.stage === 'code') publish({ error: 'Escribe los seis dígitos del código.' });
        return false;
      }
      const challenge = proof;
      return run(async signal => {
        await api.verify({ ...challenge, code }, signal);
        if (signal.aborted) return;
        proof = undefined;
        publish({ stage: 'done', email: undefined, expiresAt: undefined, resendAt: undefined,
          message: 'Correo verificado. Tu cuenta ya está activa. Ahora puedes iniciar sesión.' });
      }, true);
    },
    async resend() {
      if (state.stage !== 'code' || !proof || now() < (state.resendAt ?? 0)) return false;
      const challenge = proof;
      return run(async signal => {
        await api.resend(challenge, signal);
        if (!signal.aborted) publish({ resendAt: now() + 60000, expiresAt: now() + 900000,
          message: 'Solicitud recibida. Si corresponde, recibirás un nuevo código. Usa únicamente el más reciente.' });
      });
    },
    reset() {
      generation++; request?.abort(); request = undefined; proof = undefined;
      state = Object.freeze({ stage: 'form', busy: false });
      for (const listener of [...listeners]) listener();
    },
  };
}
export type RegistrationController = ReturnType<typeof createRegistrationController>;
