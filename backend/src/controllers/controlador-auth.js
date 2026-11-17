import { ipKeyGenerator } from 'express-rate-limit';
import { readBearer, validateLogin } from '../validators/validacion-login.js';
import { clientAddress } from '../middlewares/ingreso-render.js';
import { logFailure } from '../log-operativo.js';

const INVALID = 'Correo o contraseña incorrectos';
const NO_SESSION = 'Sesión inválida o vencida';

function handle(operation) {
  return async (req, res) => {
    try {
      await operation(req, res);
    } catch {
      logFailure('auth_request_failed');
      res.status(503).json({ error: 'Servicio de autenticación no disponible' });
    }
  };
}

export function createAuthController(service) {
  return {
    login: handle(async (req, res) => {
      const credentials = validateLogin(req.body);
      if (!credentials) return res.status(400).json({ error: 'Correo o contraseña inválidos' });
      const result = await service.login(credentials, ipKeyGenerator(clientAddress(req)));
      if (result.status === 'limited') {
        res.set('Retry-After', '900');
        return res.status(429).json({ error: 'Demasiados intentos, intenta más tarde' });
      }
      if (result.status !== 'ok') return res.status(401).json({ error: INVALID });
      res.status(200).json(result.data);
    }),
    me: handle(async (req, res) => {
      const token = readBearer(req.get('Authorization'));
      const session = token ? await service.session(token) : null;
      if (!session) return res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: NO_SESSION });
      res.status(200).json(session);
    }),
    logout: handle(async (req, res) => {
      const token = readBearer(req.get('Authorization'));
      if (!token) return res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: NO_SESSION });
      await service.logout(token);
      res.sendStatus(204);
    }),
  };
}
