import { Router } from 'express';
import { health } from '../controllers/controlador-salud.js';

export function createHealthRouter() {
  const router = Router();
  router.get('/health', health);
  return router;
}
