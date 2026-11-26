import { ipKeyGenerator } from 'express-rate-limit';
import { readBearer, validCurrentPassword, validateLogin } from '../validators/validacion-login.js';
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
    deleteAccount: handle(async (req, res) => {
      const token = readBearer(req.get('Authorization'));
      const unauthorized = () => res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: NO_SESSION });
      if (!token) return unauthorized();
      const body = req.body;
      if (!body || Object.keys(body).length !== 2 || !Object.hasOwn(body, 'password')
        || !Object.hasOwn(body, 'confirm') || body.confirm !== true
        || !validCurrentPassword(body.password)) {
        return res.status(400).json({ error: 'Confirma la eliminación e introduce tu contraseña actual' });
      }
      const result = await service.deleteAccount(token, body.password, ipKeyGenerator(clientAddress(req)));
      if (result === 'limited') return res.set('Retry-After', '900').status(429).json({ error: 'Demasiados intentos' });
      if (result === 'incorrect') return res.status(422).json({ error: 'No se pudo verificar tu identidad' });
      if (result !== 'deleted') return unauthorized();
      res.status(200).json({ deleted: true });
    }),
    logout: handle(async (req, res) => {
      const token = readBearer(req.get('Authorization'));
      if (!token) return res.set('WWW-Authenticate', 'Bearer').status(401).json({ error: NO_SESSION });
      await service.logout(token);
      res.sendStatus(204);
    }),
  };
}
