import { getHealth } from '../services/health.service.js';

export function health(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.json(getHealth());
}
