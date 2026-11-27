import { createHash } from 'node:crypto';
import { readBearer } from '../validators/validacion-login.js';
import { validateProfileName, validatePromotions, validateOpposition, validateOppositionQuery, validFolio } from '../validators/validacion-privacidad.js';
import { logFailure } from '../log-operativo.js';

const tokenDigest = token => createHash('sha256').update(token).digest();

const unauthorized = res => res.set('WWW-Authenticate', 'Bearer').status(401)
  .json({ error: 'Sesión inválida o vencida' });

export function createPrivacyController(repository, resolveToken = tokenDigest) {
  const handle = (operation, validate) => async (req, res) => {
    const token = readBearer(req.get('Authorization'));
    if (!token) return unauthorized(res);
    const input = validate?.(req.body);
    if (validate && input === null) return res.status(400).json({ error: 'Revisa el nombre.' });
    try {
      const hash = resolveToken(token);
      if (!hash) return unauthorized(res);
      const result = await repository[operation](hash, ...(validate ? [input] : []));
      return result ? res.json(result) : unauthorized(res);
    } catch {
      logFailure('privacy_request_failed');
      return res.status(503).json({ error: 'Privacidad no disponible por ahora.' });
    }
  };
  const opposition = (operation, parse) => async (req, res) => {
    const token = readBearer(req.get('Authorization'));
    if (!token) return unauthorized(res);
    const payload = parse(req);
    if (payload === null) return res.status(400).json({ error: 'Revisa los datos de la solicitud.' });
    try {
      const hash = resolveToken(token);
      if (!hash) return unauthorized(res);
      const result = await repository[operation](hash, payload);
      if (!result) return unauthorized(res);
      if (result.missing) return res.status(404).json({ error: 'Solicitud no encontrada.' });
      if (result.conflict) return res.status(409).json({ error: 'La clave de operación ya se usó con otros datos.' });
      if (result.request) return res.status(result.created ? 201 : 200).json(result.request);
      return res.json(result);
    } catch {
      logFailure('privacy_opposition_failed');
      return res.status(503).json({ error: 'Solicitudes no disponibles por ahora.' });
    }
  };
  return {
    createOpposition: opposition('createOpposition', req => validateOpposition(req.body)),
    listOppositions: opposition('listOppositions', req => validateOppositionQuery(req.query)),
    readOpposition: opposition('readOpposition', req => validFolio(req.params.folio) ? req.params.folio : null),
    preferences: handle('readPrivacyPreferences'),
    data: handle('readPrivacyData'),
    profile: handle('updateProfileName', validateProfileName),
    async promotions(req, res) {
      const token = readBearer(req.get('Authorization'));
      if (!token) return unauthorized(res);
      const input = validatePromotions(req.body);
      if (!input) return res.status(400).json({ error: 'Revisa la decisión de promociones.' });
      try {
        const hash = resolveToken(token);
        if (!hash) return unauthorized(res);
        const result = await repository.recordPromotions(hash, input);
        if (result === 'unauthorized') return unauthorized(res);
        if (result === 'recorded') return res.status(204).end();
        if (result === 'documents_changed' || result === 'conflict') {
          return res.status(409).json({ error: 'Revisa la versión del aviso o vuelve a iniciar la operación.' });
        }
      } catch { logFailure('privacy_promotions_failed'); }
      return res.status(503).json({ error: 'Privacidad no disponible por ahora.' });
    },
    async documents(_req, res) {
      try {
        const result = await repository.currentLegalDocuments();
        if (result) return res.json(result);
      } catch { logFailure('privacy_documents_failed'); }
      return res.status(503).json({ error: 'Todavía no hay documentos legales vigentes.' });
    },
  };
}
