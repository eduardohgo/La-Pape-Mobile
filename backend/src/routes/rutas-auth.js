import express, { Router } from 'express';
import { createAuthController } from '../controllers/controlador-auth.js';
import { hasTrustedRenderHttps } from '../middlewares/ingreso-render.js';
import { notFound } from '../middlewares/manejo-errores.js';
import { validFolio } from '../validators/validacion-privacidad.js';
import { createRegistrationController } from '../controllers/controlador-registro.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ENDPOINTS = new Map([['/login', 'POST'], ['/me', 'GET'], ['/logout', 'POST']]);

export function createAuthRouter(service, { allowLoopbackHttp, hosted, deletionEnabled, jwtEnabled }, httpLimit, registrationService, privacy) {
  const router = Router();
  const controller = createAuthController(service, jwtEnabled);
  const endpoints = new Map(ENDPOINTS);
  if (jwtEnabled) endpoints.set('/refresh', 'POST');
  if (deletionEnabled) endpoints.set('/account/delete', 'POST');
  if (registrationService) for (const path of ['/register', '/register/resend', '/register/verify']) endpoints.set(path, 'POST');
  if (privacy) {
    endpoints.set('/privacy/data', 'GET');
    endpoints.set('/privacy/preferences', 'GET');
    endpoints.set('/privacy/requests', ['GET', 'POST']);
    endpoints.set('/privacy/profile', 'PATCH');
    endpoints.set('/privacy/consents/promotions', 'POST');
    if (registrationService) {
      endpoints.set('/register/v2/documents', 'GET');
      endpoints.set('/register/v2', 'POST');
    }
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const detail = privacy && req.path.match(/^\/privacy\/requests\/([^/]+)$/);
    const allowed = endpoints.get(req.path) ?? (detail && validFolio(detail[1]) ? 'GET' : null);
    if (!allowed) return notFound(req, res);
    const methods = Array.isArray(allowed) ? allowed : [allowed];
    // Explicit methods also prevent Express from executing GET handlers for HEAD.
    if (!methods.includes(req.method)) return res.set('Allow', methods.join(', ')).status(405).json({ error: 'Método no permitido' });
    const secure = hosted ? hasTrustedRenderHttps(req)
      : req.secure || (allowLoopbackHttp && LOOPBACK.has(req.socket.remoteAddress));
    if (secure) return next();
    res.status(403).json({ error: 'La autenticación requiere HTTPS' });
  });
  if (httpLimit) router.use(httpLimit);
  router.post('/login', express.json({ limit: 8192 }), controller.login);
  router.get('/me', controller.me);
  router.post('/logout', controller.logout);
  if (jwtEnabled) router.post('/refresh', controller.refresh);
  if (deletionEnabled) router.post('/account/delete', express.json({ limit: 8192 }), controller.deleteAccount);
  if (privacy) {
    router.get('/privacy/data', privacy.data);
    router.get('/privacy/preferences', privacy.preferences);
    router.get('/privacy/requests', privacy.listOppositions);
    router.post('/privacy/requests', express.json({ limit: 4096 }), privacy.createOpposition);
    router.get('/privacy/requests/:folio', privacy.readOpposition);
    router.patch('/privacy/profile', express.json({ limit: 4096 }), privacy.profile);
    router.post('/privacy/consents/promotions', express.json({ limit: 4096 }), privacy.promotions);
  }
  if (registrationService) {
    const signup = createRegistrationController(registrationService);
    router.post('/register', express.json({ limit: 8192 }), signup.request);
    router.post('/register/resend', express.json({ limit: 4096 }), signup.resend);
    router.post('/register/verify', express.json({ limit: 4096 }), signup.verify);
    if (privacy) {
      router.get('/register/v2/documents', privacy.documents);
      router.post('/register/v2', express.json({ limit: 8192 }), signup.requestV2);
    }
  }
  return router;
}
