import express, { Router } from 'express';
import { createAuthController } from '../controllers/controlador-auth.js';
import { hasTrustedRenderHttps } from '../middlewares/ingreso-render.js';
import { notFound } from '../middlewares/manejo-errores.js';
import { createRegistrationController } from '../controllers/controlador-registro.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ENDPOINTS = new Map([['/login', 'POST'], ['/me', 'GET'], ['/logout', 'POST']]);

export function createAuthRouter(service, { allowLoopbackHttp, hosted, deletionEnabled }, httpLimit, registrationService) {
  const router = Router();
  const controller = createAuthController(service);
  const endpoints = new Map(ENDPOINTS);
  if (deletionEnabled) endpoints.set('/account/delete', 'POST');
  if (registrationService) for (const path of ['/register', '/register/resend', '/register/verify']) endpoints.set(path, 'POST');
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const method = endpoints.get(req.path);
    if (!method) return notFound(req, res);
    // Explicit methods also prevent Express from executing GET /me for HEAD.
    if (req.method !== method) return res.set('Allow', method).status(405).json({ error: 'Método no permitido' });
    const secure = hosted ? hasTrustedRenderHttps(req)
      : req.secure || (allowLoopbackHttp && LOOPBACK.has(req.socket.remoteAddress));
    if (secure) return next();
    res.status(403).json({ error: 'La autenticación requiere HTTPS' });
  });
  if (httpLimit) router.use(httpLimit);
  router.post('/login', express.json({ limit: 8192 }), controller.login);
  router.get('/me', controller.me);
  router.post('/logout', controller.logout);
  if (deletionEnabled) router.post('/account/delete', express.json({ limit: 8192 }), controller.deleteAccount);
  if (registrationService) {
    const signup = createRegistrationController(registrationService);
    router.post('/register', express.json({ limit: 8192 }), signup.request);
    router.post('/register/resend', express.json({ limit: 4096 }), signup.resend);
    router.post('/register/verify', express.json({ limit: 4096 }), signup.verify);
  }
  return router;
}
