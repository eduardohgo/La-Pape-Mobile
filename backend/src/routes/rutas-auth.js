import express, { Router } from 'express';
import { createAuthController } from '../controllers/controlador-auth.js';
import { hasTrustedRenderHttps } from '../middlewares/ingreso-render.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function createAuthRouter(service, { allowLoopbackHttp, hosted }) {
  const router = Router();
  const controller = createAuthController(service);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const secure = hosted ? hasTrustedRenderHttps(req)
      : req.secure || (allowLoopbackHttp && LOOPBACK.has(req.socket.remoteAddress));
    if (secure) return next();
    res.status(403).json({ error: 'La autenticación requiere HTTPS' });
  });
  router.post('/login', express.json({ limit: 8192 }), controller.login);
  router.get('/me', controller.me);
  router.post('/logout', controller.logout);
  return router;
}
