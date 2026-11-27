import { ipKeyGenerator } from 'express-rate-limit';
import { clientAddress } from '../middlewares/ingreso-render.js';
import { validateSignup, validateSignupChallenge } from '../validators/validacion-alta.js';
import { validatePrivacySignup } from '../validators/validacion-privacidad.js';
import { logFailure } from '../log-operativo.js';
export function createRegistrationController(service) {
  const handler = (operation, validator) => async (req, res) => {
    const data = validator(req.body);
    if (!data) return res.status(400).json({ error: 'Revisa los datos. La contraseña requiere al menos 8 caracteres y confirmación exacta.' });
    try {
      const result = await service[operation](data, ipKeyGenerator(clientAddress(req)));
      if (result.status === 'limited') return res.set('Retry-After', '900').status(429)
        .json({ error: 'Demasiados intentos. Espera antes de reintentar.' });
      if (result.status === 'documents_changed') return res.status(409)
        .json({ error: 'Revisa las versiones vigentes antes de continuar.' });
      if (operation === 'verify') return result.status === 'verified' ? res.json({ verified: true })
        : res.status(400).json({ error: 'Código inválido, vencido o utilizado' });
      return res.status(202).json(result.data);
    } catch {
      logFailure('registration_request_failed');
      return res.status(503).json({ error: 'Registro no disponible. No se ha confirmado la activación.' });
    }
  };
  return { request: handler('request', validateSignup), requestV2: handler('request', validatePrivacySignup),
    resend: handler('resend', body => validateSignupChallenge(body)),
    verify: handler('verify', body => validateSignupChallenge(body, true)) };
}
