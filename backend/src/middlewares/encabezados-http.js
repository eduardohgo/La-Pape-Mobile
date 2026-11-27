// Node discards some duplicate fields (notably Authorization and Host) when
// constructing req.headers. Count the original pairs instead of trusting that map.
export const CRITICAL_HEADER_NAMES = Object.freeze([
  'authorization', 'host', 'cf-connecting-ip', 'x-forwarded-proto',
  'content-type', 'content-length', 'transfer-encoding',
]);
const CRITICAL = new Set(CRITICAL_HEADER_NAMES);

function validHost(value) {
  if (/[\s,\\/@?#]/u.test(value)) return false;
  try {
    const url = new URL('http://' + value);
    return Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function rejectAmbiguousHeaders(req, res, next) {
  const reject = () => res.set('Cache-Control', 'no-store').status(400)
    .json({ error: 'Encabezados HTTP inválidos' });
  const seen = new Set();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase();
    if (!CRITICAL.has(name)) continue;
    if (seen.has(name)) return reject();
    seen.add(name);
  }
  for (const name of CRITICAL) {
    const value = req.headers[name];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value || /[,\r\n]/u.test(value)) return reject();
  }
  if (seen.has('host') && !validHost(req.headers.host)) return reject();
  if (req.httpVersionMajor === 1 && req.httpVersionMinor >= 1 && !seen.has('host')) return reject();
  return next();
}
