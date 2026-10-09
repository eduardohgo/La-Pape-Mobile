import { isIP } from 'node:net';

const DEFAULT_ORIGINS = 'http://localhost:8081,http://localhost:19006';

function integer(value, fallback, name, minimum, maximum) {
  const input = String(value ?? '').trim();
  if (input !== '' && !/^\d+$/.test(input)) {
    throw new Error(`Configuración inválida: ${name}`);
  }
  const result = input === '' ? fallback : Number(input);
  if (!/^\d+$/.test(String(result)) || !Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`Configuración inválida: ${name}`);
  }
  return result;
}

function origins(value) {
  const items = String(value ?? DEFAULT_ORIGINS).split(',').map((item) => item.trim()).filter(Boolean);
  return Object.freeze([...new Set(items.map((item) => {
    let url;
    try {
      url = new URL(item);
    } catch {
      throw new Error('Configuración inválida: FRONTEND_ORIGINS');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Configuración inválida: FRONTEND_ORIGINS');
    }
    return url.origin;
  }))]);
}

function database(env, nodeEnv) {
  const connectionString = String(env.DATABASE_URL ?? '').trim();
  const sslSetting = String(env.PG_SSL ?? '').trim();
  if (sslSetting && !['true', 'false'].includes(sslSetting)) {
    throw new Error('Configuración inválida: PG_SSL');
  }
  if (!connectionString) return null;

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('Configuración inválida: DATABASE_URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.search || url.hash) {
    throw new Error('DATABASE_URL debe identificar PostgreSQL sin parámetros de URL');
  }

  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase());
  const tlsRequired = nodeEnv === 'production' || !local;
  if (tlsRequired && sslSetting === 'false') {
    throw new Error('PG_SSL no puede desactivar TLS para una base remota o de producción');
  }
  return Object.freeze({
    connectionString,
    ssl: tlsRequired || sslSetting === 'true' ? Object.freeze({ rejectUnauthorized: true }) : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 5,
  });
}

export function loadConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV ?? 'development').trim();
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('Configuración inválida: NODE_ENV');
  }
  const host = String(env.HOST ?? '127.0.0.1').trim();
  if (host !== 'localhost' && !isIP(host)) {
    throw new Error('Configuración inválida: HOST');
  }
  return Object.freeze({
    nodeEnv,
    host,
    port: integer(env.PORT, 3000, 'PORT', 1, 65535),
    allowedOrigins: origins(env.FRONTEND_ORIGINS),
    trustProxy: integer(env.TRUST_PROXY, 0, 'TRUST_PROXY', 0, 1),
    rateLimitMax: integer(env.RATE_LIMIT_MAX, 100, 'RATE_LIMIT_MAX', 1, 10000),
    rateLimitWindowMs: integer(env.RATE_LIMIT_WINDOW_MS, 900000, 'RATE_LIMIT_WINDOW_MS', 1000, 3600000),
    jsonBodyLimitBytes: integer(env.JSON_BODY_LIMIT_BYTES, 65536, 'JSON_BODY_LIMIT_BYTES', 1, 1048576),
    database: database(env, nodeEnv),
  });
}
