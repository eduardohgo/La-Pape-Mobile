import { isIP } from 'node:net';
import { performance } from 'node:perf_hooks';
import { CRITICAL_HEADER_NAMES } from './encabezados-http.js';
import { logFailure } from '../log-operativo.js';

const CASE_HEADER = 'x-lapape-ingress-case';
const CASES = new Set(['baseline', 'cf-spoof', 'proto-spoof', 'duplicates', 'alternate', 'ipv6']);
const MAX_RECORDS = 50;
const MAX_WINDOW_MS = 30 * 60 * 1000;

function responseClass(status) {
  if (status >= 200 && status < 300) return 'success';
  if (status >= 300 && status < 400) return 'redirect';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500 && status < 600) return 'server-error';
  return 'other';
}

// This only describes syntax. None of these categories establish proxy trust.
function sample(req) {
  if (!['GET', 'HEAD'].includes(req.method) || req.path !== '/health') return null;
  const counts = new Map();
  const firstIndex = new Map();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (!firstIndex.has(name)) firstIndex.set(name, i + 1);
  }
  // No automatic health-check logging. A recognized category is only an opt-in
  // selector, never a credential or evidence of the request's provenance.
  if (counts.get(CASE_HEADER) !== 1) return null;
  const probeCase = req.rawHeaders[firstIndex.get(CASE_HEADER)];
  if (!CASES.has(probeCase)) return null;

  function classify(name, values) {
    const count = counts.get(name) ?? 0;
    if (!count) return 'absent';
    if (count !== 1) return 'duplicate';
    const value = req.rawHeaders[firstIndex.get(name)];
    return typeof value === 'string' ? values(value) : 'invalid';
  }

  return Object.freeze({
    level: 'info',
    event: 'ingress_observation',
    probe_case: probeCase,
    method: req.method === 'GET' ? 'get' : 'head',
    socket_tls: req.socket.encrypted === true,
    cf_ip_format: classify('cf-connecting-ip', value => {
      const family = value.includes('%') ? 0 : isIP(value);
      return family === 4 ? 'ipv4' : family === 6 ? 'ipv6' : 'invalid';
    }),
    forwarded_proto: classify('x-forwarded-proto', value =>
      value === 'https' ? 'https' : value === 'http' ? 'http' : 'invalid'),
    critical_duplicates: CRITICAL_HEADER_NAMES.some(name => (counts.get(name) ?? 0) > 1),
    forwarded_chain_present: counts.has('forwarded') || counts.has('x-forwarded-for'),
    trust_assessed: false,
  });
}

export function createIngressObserver(config, {
  write = entry => console.info(JSON.stringify(entry)),
  now = Date.now,
  monotonicNow = () => performance.now(),
} = {}) {
  if (!config.ingressObserver) return null;
  if (config.apiProfile !== 'auth-only' || config.auth !== null || config.database !== null
    || config.catalogApiEnabled || config.catalogDemoApiEnabled || config.cloudinary) {
    throw new Error('El observador requiere auth-only sin autenticación ni otros módulos');
  }
  const expiresAt = config.ingressObserver.expiresAt;
  if (!Number.isFinite(expiresAt)) throw new Error('Configuración inválida del observador');
  const deadline = monotonicNow() + Math.min(MAX_WINDOW_MS, Math.max(0, expiresAt - now()));
  let expired = false;
  const active = () => {
    expired ||= now() >= expiresAt || monotonicNow() >= deadline;
    return !expired;
  };
  let remaining = MAX_RECORDS;
  let failed = false;

  return (req, res, next) => {
    if (!active() || remaining === 0 || failed) return next();
    const entry = sample(req);
    if (!entry) return next();
    remaining--;

    function detach() {
      res.off('finish', report);
      res.off('close', detach);
    }
    function report() {
      detach();
      if (!active() || failed) return;
      try {
        write(Object.freeze({ ...entry, response_class: responseClass(res.statusCode) }));
      } catch {
        failed = true;
        // Diagnostic failures never alter HTTP responses or disclose exceptions.
        try { logFailure('ingress_observer_write_failed'); } catch { /* No recursive logging. */ }
      }
    }
    res.once('finish', report);
    res.once('close', detach);
    return next();
  };
}
