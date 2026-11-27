import { getHealth } from '../services/servicio-salud.js';

export function health(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(getHealth());
}
