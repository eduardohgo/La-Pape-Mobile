import { isIP } from 'node:net';
import { validEmail } from '../validators/validacion-registro.js';

const DEFAULT_ORIGINS = 'http://localhost:8081,http://localhost:19006';
const FREE_PUBLIC_INGRESS = new Map([
  ['srv-dc2rth7lk1mc73arpul0', 'la-pape-mobile-auth-tigre10.onrender.com'],
  ['srv-dc4q9pkipgvc738j3lq0', 'la-pape-mobile-jwt-arco-staging.onrender.com'],
]);
const JWT_STAGING_SERVICE = 'srv-dc4q9pkipgvc738j3lq0';
const JWT_STAGING_DATABASE_HOST = 'ep-flat-union-bbqi1nl3.c-15.us-east-1.aws.neon.tech';

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

function origins(value, render) {
  const items = String(value ?? (render ? '' : DEFAULT_ORIGINS)).split(',').map((item) => item.trim()).filter(Boolean);
  return Object.freeze([...new Set(items.map((item) => {
    let url;
    try {
      url = new URL(item);
    } catch {
      throw new Error('Configuración inválida: FRONTEND_ORIGINS');
    }
    if (!(render ? ['https:'] : ['http:', 'https:']).includes(url.protocol)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
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
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) {
    throw new Error('DATABASE_URL debe identificar una base PostgreSQL sin fragmentos');
  }

  // Validate percent escapes before pg parses credentials, so errors never contain the URL.
  try {
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
    decodeURIComponent(url.pathname);
  } catch {
    throw new Error('Configuración inválida: DATABASE_URL');
  }

  const allowedParameters = new Set(['sslmode', 'channel_binding']);
  for (const [name] of url.searchParams) {
    if (!allowedParameters.has(name) || url.searchParams.getAll(name).length !== 1) {
      throw new Error('DATABASE_URL contiene parámetros no admitidos o repetidos');
    }
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode !== null && !['require', 'verify-full'].includes(sslMode)) {
    throw new Error('DATABASE_URL requiere sslmode=require o verify-full');
  }
  const channelBinding = url.searchParams.get('channel_binding');
  if (channelBinding === 'require') {
    // pg 8.20 enables PLUS when offered, but cannot enforce libpq's require semantics.
    throw new Error('pg 8.20 no garantiza channel_binding=require; use prefer con TLS verificado');
  }
  if (channelBinding !== null && channelBinding !== 'prefer') {
    throw new Error('DATABASE_URL solo admite channel_binding=prefer');
  }

  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname.toLowerCase());
  const tlsRequired = nodeEnv === 'production' || !local || sslMode !== null || channelBinding !== null;
  if (tlsRequired && sslSetting === 'false') {
    throw new Error('PG_SSL no puede desactivar TLS requerido por la base o su URL');
  }
  const ssl = tlsRequired || sslSetting === 'true' ? Object.freeze({ rejectUnauthorized: true }) : false;
  // pg lets URL SSL parameters replace the explicit ssl object. Translate first, strip them.
  url.search = '';
  return Object.freeze({
    connectionString: url.href,
    ssl,
    enableChannelBinding: Boolean(ssl),
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 5,
  });
}

function cloudinary(env) {
  const enabled = env.CLOUDINARY_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled)) {
    throw new Error('Configuración inválida: CLOUDINARY_ENABLED');
  }
  // Disabled means optional: do not read credentials or expose a partial configuration.
  if (enabled === 'false') return null;

  const rules = [
    ['CLOUDINARY_CLOUD_NAME', /^[a-z0-9][a-z0-9_-]{0,127}$/],
    ['CLOUDINARY_API_KEY', /^[0-9]{1,128}$/],
    ['CLOUDINARY_API_SECRET', /^[\x21-\x7e]{1,1024}$/],
  ];
  const values = rules.map(([name, pattern]) => {
    const value = env[name];
    // Validate without trimming, coercing or echoing credential values.
    if (typeof value !== 'string' || /\s/.test(value) || !pattern.test(value)) {
      throw new Error(`Configuración inválida: ${name}`);
    }
    return value;
  });
  const config = { cloudName: values[0] };
  // Available to a future server-side adapter, omitted from ordinary JSON/spread/logging.
  Object.defineProperties(config, {
    apiKey: { value: values[1], enumerable: false },
    apiSecret: { value: values[2], enumerable: false },
  });
  return Object.freeze(config);
}

function flag(value, name) {
  const option = value ?? 'false';
  if (!['true', 'false'].includes(option)) throw new Error('Configuración inválida: ' + name);
  return option === 'true';
}

function assertNeonRole(config, name, role) {
  if (!config) throw new Error('Se requiere ' + name);
  const url = new URL(config.connectionString);
  if (!/^ep-[a-z0-9-]+(?:\.[a-z0-9-]+)+\.neon\.tech$/.test(url.hostname)
    || (url.port && url.port !== '5432') || !url.password
    || decodeURIComponent(url.username) !== role || decodeURIComponent(url.pathname) !== '/lapape_mobile_dev'
    || config.ssl?.rejectUnauthorized !== true) {
    throw new Error(name + ' requiere el rol dedicado, la base esperada y TLS verificado en Neon');
  }
  return url.hostname;
}

function authentication(env, nodeEnv, render, catalogDatabase, proxyIps, managedFreeEdge) {
  const enabled = env.AUTH_ENABLED ?? 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('Configuración inválida: AUTH_ENABLED');
  const jwtEnabled = flag(env.AUTH_JWT_ENABLED, 'AUTH_JWT_ENABLED');
  if (jwtEnabled && (enabled !== 'true' || env.API_PROFILE !== 'auth-only')) {
    throw new Error('JWT requiere autenticación y perfil auth-only');
  }
  const mode = env.AUTH_MODE ?? 'pilot';
  if (!['pilot', 'hosted'].includes(mode)) throw new Error('Configuración inválida: AUTH_MODE');
  if (enabled === 'false') return null;
  if ((mode === 'hosted') !== render || (mode === 'pilot' && nodeEnv === 'production')) {
    throw new Error('La autenticación piloto requiere desarrollo o pruebas; Render requiere AUTH_MODE=hosted');
  }
  const allowLoopbackHttp = flag(env.AUTH_ALLOW_LOOPBACK_HTTP, 'AUTH_ALLOW_LOOPBACK_HTTP');
  if (render && (allowLoopbackHttp || (!proxyIps.length && !managedFreeEdge))) {
    throw new Error('La autenticación alojada requiere proxies verificados y HTTPS obligatorio');
  }
  const db = database({ DATABASE_URL: env.AUTH_DATABASE_URL }, nodeEnv);
  if (!db) throw new Error('Se requiere AUTH_DATABASE_URL');
  const url = new URL(db.connectionString);
  if (decodeURIComponent(url.username) !== 'lapape_auth_runtime'
    || decodeURIComponent(url.pathname) !== '/lapape_mobile_dev') {
    throw new Error('AUTH_DATABASE_URL requiere el rol y la base del piloto');
  }
  if (render) {
    const authHost = assertNeonRole(db, 'AUTH_DATABASE_URL', 'lapape_auth_runtime');
    if (env.AUTH_DATABASE_HOST !== authHost) throw new Error('AUTH_DATABASE_HOST no coincide con el destino aprobado de autenticación');
    const endpoint = host => host.replace('-pooler.', '.');
    if (catalogDatabase && endpoint(new URL(catalogDatabase.connectionString).hostname) === endpoint(authHost)) {
      throw new Error('El catálogo y la autenticación requieren endpoints de Neon separados');
    }
  }

  const input = env.AUTH_RATE_LIMIT_KEY;
  const key = typeof input === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input)
    ? Buffer.from(input, 'base64url') : null;
  if (!key || key.length !== 32 || key.toString('base64url') !== input || new Set(key).size === 1) {
    throw new Error('Configuración inválida: AUTH_RATE_LIMIT_KEY');
  }
  const config = { allowLoopbackHttp, hosted: render, jwtEnabled,
    stagingDeletionUserId: env.AUTH_STAGING_DELETION_USER_ID ?? null,
    deletionEnabled: flag(env.AUTH_ACCOUNT_DELETION_ENABLED, 'AUTH_ACCOUNT_DELETION_ENABLED') };
  let jwt = null;
  if (jwtEnabled) {
    const decodeKey = (name) => {
      const encoded = env[name];
      if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new Error('Configuración JWT inválida: ' + name);
      }
      const content = Buffer.from(encoded, 'base64');
      if (content.toString('base64') !== encoded || content.length < 100 || content.length > 4096) {
        throw new Error('Configuración JWT inválida: ' + name);
      }
      return content.toString('utf8');
    };
    const issuer = env.AUTH_JWT_ISSUER;
    const audience = env.AUTH_JWT_AUDIENCE;
    const kid = env.AUTH_JWT_KID;
    if (typeof issuer !== 'string' || !/^https:\/\/[a-z0-9.-]+$/.test(issuer)
      || typeof audience !== 'string' || !/^[a-z0-9:_-]{3,80}$/.test(audience)
      || typeof kid !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(kid)) {
      throw new Error('Configuración JWT inválida');
    }
    jwt = Object.freeze({ privateKey: decodeKey('AUTH_JWT_PRIVATE_KEY_B64'),
      publicKey: decodeKey('AUTH_JWT_PUBLIC_KEY_B64'), issuer, audience, kid });
  }
  Object.defineProperties(config, {
    privacyEnabled: { value: flag(env.AUTH_PRIVACY_PHASE1_ENABLED, 'AUTH_PRIVACY_PHASE1_ENABLED') },
    database: { value: db },
    limitKey: { value: key },
    registration: { value: registration(env, key) },
    jwt: { value: jwt },
  });
  return Object.freeze(config);
}

function registration(env, limitKey) {
  if (!flag(env.AUTH_REGISTRATION_ENABLED, 'AUTH_REGISTRATION_ENABLED')) return null;
  const input = env.AUTH_REGISTRATION_HMAC_KEY;
  const key = typeof input === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input) ? Buffer.from(input, 'base64url') : null;
  if (!key || key.length !== 32 || key.toString('base64url') !== input || new Set(key).size < 16 || key.equals(limitKey)) {
    throw new Error('Configuración inválida: AUTH_REGISTRATION_HMAC_KEY');
  }
  if (env.AUTH_MAIL_PROVIDER !== 'brevo' || typeof env.BREVO_API_KEY !== 'string'
    || !/^[\x21-\x7e]{20,512}$/.test(env.BREVO_API_KEY)
    || typeof env.AUTH_MAIL_FROM !== 'string' || !validEmail(env.AUTH_MAIL_FROM)) {
    throw new Error('Configuración inválida del correo de registro');
  }
  const mail = {};
  Object.defineProperties(mail, { apiKey: { value: env.BREVO_API_KEY }, sender: { value: env.AUTH_MAIL_FROM } });
  const config = {};
  Object.defineProperties(config, { key: { value: key }, mail: { value: Object.freeze(mail) } });
  return Object.freeze(config);
}

function ingressObservation(env, apiProfile) {
  if (!flag(env.INGRESS_OBSERVER_ENABLED, 'INGRESS_OBSERVER_ENABLED')) return null;
  // Reject before authentication() can read any database credential.
  if (apiProfile !== 'auth-only' || env.AUTH_ENABLED !== 'false') {
    throw new Error('El observador requiere API_PROFILE=auth-only y AUTH_ENABLED=false explícito');
  }
  const input = env.INGRESS_OBSERVER_EXPIRES_AT;
  const expiresAt = typeof input === 'string' ? Date.parse(input) : NaN;
  if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== input
    || expiresAt > Date.now() + 30 * 60 * 1000) {
    throw new Error('Configuración inválida: INGRESS_OBSERVER_EXPIRES_AT');
  }
  // An expired observer stays silent; health must survive subsequent cold starts.
  return Object.freeze({ expiresAt });
}

export function loadConfig(env = process.env) {
  const nodeEnv = String(env.NODE_ENV ?? 'development').trim();
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('Configuración inválida: NODE_ENV');
  }
  const runtime = env.APP_RUNTIME ?? 'local';
  if (!['local', 'render'].includes(runtime) || (runtime === 'render' && nodeEnv !== 'production')) {
    throw new Error('Configuración inválida: APP_RUNTIME');
  }
  const render = runtime === 'render';
  const apiProfile = env.API_PROFILE ?? 'shared';
  if (!['shared', 'auth-only'].includes(apiProfile)) throw new Error('Configuración inválida: API_PROFILE');
  if (apiProfile === 'auth-only') {
    const forbidden = ['CATALOG_API_ENABLED', 'CATALOG_DEMO_API_ENABLED', 'CLOUDINARY_ENABLED',
      'AUTH_RECOVERY_ENABLED'];
    if (forbidden.some(name => flag(env[name], name)) || String(env.DATABASE_URL ?? '').trim()) {
      throw new Error('API_PROFILE=auth-only no admite catálogo, módulos adicionales ni DATABASE_URL');
    }
  }
  if (flag(env.AUTH_REGISTRATION_ENABLED, 'AUTH_REGISTRATION_ENABLED')
    && (apiProfile !== 'auth-only' || env.AUTH_ENABLED !== 'true')) {
    throw new Error('Registro requiere auth-only y AUTH_ENABLED=true');
  }
  if (flag(env.AUTH_ACCOUNT_DELETION_ENABLED, 'AUTH_ACCOUNT_DELETION_ENABLED')
    && (apiProfile !== 'auth-only' || env.AUTH_ENABLED !== 'true')) {
    throw new Error('Eliminar cuenta requiere auth-only y AUTH_ENABLED=true');
  }
  if (render && env.RENDER_SERVICE_ID === JWT_STAGING_SERVICE
    && flag(env.AUTH_REGISTRATION_ENABLED, 'AUTH_REGISTRATION_ENABLED')) {
    throw new Error('El servicio JWT de pruebas no permite registro público');
  }
  const privacyEnabled = flag(env.AUTH_PRIVACY_PHASE1_ENABLED, 'AUTH_PRIVACY_PHASE1_ENABLED');
  const stagingPrivacy = render && env.RENDER_SERVICE_ID === JWT_STAGING_SERVICE
    && env.RENDER_EXTERNAL_URL === 'https://' + FREE_PUBLIC_INGRESS.get(JWT_STAGING_SERVICE)
    && env.RENDER === 'true' && env.RENDER_SERVICE_TYPE === 'web'
    && env.RENDER_FREE_PUBLIC_INGRESS === 'true' && env.AUTH_ENABLED === 'true'
    && env.AUTH_JWT_ENABLED === 'true' && env.AUTH_REGISTRATION_ENABLED !== 'true'
    && env.AUTH_PRIVACY_STAGING_DOCUMENT === 'DOCUMENTO DE PRUEBA';
  if (env.AUTH_PRIVACY_STAGING_DOCUMENT && !stagingPrivacy) {
    throw new Error('El documento de prueba solo se admite en el servicio JWT aislado');
  }
  if (privacyEnabled && (apiProfile !== 'auth-only' || env.AUTH_ENABLED !== 'true'
    || (render && !stagingPrivacy) || (!render && nodeEnv === 'production'))) {
    throw new Error('Privacidad fase 1 requiere un laboratorio autorizado');
  }
  const stagingDeletion = flag(env.AUTH_STAGING_DELETION_ENABLED, 'AUTH_STAGING_DELETION_ENABLED');
  if (stagingDeletion || env.AUTH_STAGING_DELETION_USER_ID
    || (render && env.RENDER_SERVICE_ID === JWT_STAGING_SERVICE
      && flag(env.AUTH_ACCOUNT_DELETION_ENABLED, 'AUTH_ACCOUNT_DELETION_ENABLED'))) {
    const db = database({ DATABASE_URL: env.AUTH_DATABASE_URL }, nodeEnv);
    if (!stagingDeletion || !stagingPrivacy || !privacyEnabled
      || !flag(env.AUTH_ACCOUNT_DELETION_ENABLED, 'AUTH_ACCOUNT_DELETION_ENABLED')
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(env.AUTH_STAGING_DELETION_USER_ID ?? '')
      || !db || assertNeonRole(db, 'AUTH_DATABASE_URL', 'lapape_auth_runtime') !== JWT_STAGING_DATABASE_HOST
      || env.AUTH_DATABASE_HOST !== JWT_STAGING_DATABASE_HOST) {
      throw new Error('Cancelación sintética requiere el servicio, la base y el titular aislados de staging');
    }
  }
  const observer = ingressObservation(env, apiProfile);
  const host = String(env.HOST ?? (render ? '0.0.0.0' : '127.0.0.1')).trim();
  if (render && (host !== '0.0.0.0' || !String(env.PORT ?? '').trim())) {
    throw new Error('Render requiere HOST=0.0.0.0 y PORT de la plataforma');
  }
  if (host !== 'localhost' && !isIP(host)) {
    throw new Error('Configuración inválida: HOST');
  }
  // A hop count cannot distinguish the public edge from a direct private peer.
  integer(env.TRUST_PROXY, 0, 'TRUST_PROXY', 0, 0);
  const proxyInput = env.RENDER_TRUSTED_PROXY_IPS?.trim() ?? '';
  const proxyIps = Object.freeze(proxyInput ? [...new Set(proxyInput.split(',').map(ip => ip.trim()))] : []);
  if (proxyIps.length > 32 || proxyIps.some(ip => !isIP(ip) || ip.includes('%')
    || ip === '0.0.0.0' || ip === '::' || ip === '::ffff:0.0.0.0') || (!render && proxyIps.length)) {
    throw new Error('Configuración inválida: RENDER_TRUSTED_PROXY_IPS');
  }
  // Render Free web services have no private-network ingress. This opt-in
  // must never be used after an upgrade or on another provider or service.
  const managedFreeEdge = flag(env.RENDER_FREE_PUBLIC_INGRESS, 'RENDER_FREE_PUBLIC_INGRESS');
  const expectedHost = FREE_PUBLIC_INGRESS.get(env.RENDER_SERVICE_ID) ?? '';
  if (managedFreeEdge && (!render || nodeEnv !== 'production'
    || apiProfile !== 'auth-only' || proxyIps.length || !expectedHost
    || env.RENDER !== 'true'
    || env.RENDER_SERVICE_TYPE !== 'web'
    || env.RENDER_EXTERNAL_URL !== 'https://' + expectedHost)) {
    throw new Error('Render Free public ingress requires the approved isolated web service');
  }
  const catalogDb = database(env, nodeEnv);
  const catalogApiEnabled = flag(env.CATALOG_API_ENABLED, 'CATALOG_API_ENABLED');
  if (render && catalogApiEnabled) assertNeonRole(catalogDb, 'DATABASE_URL', 'lapape_catalog_render');
  const config = {
    nodeEnv,
    runtime,
    apiProfile,
    ingressObserver: observer,
    host,
    port: integer(env.PORT, 3000, 'PORT', 1, 65535),
    allowedOrigins: origins(env.FRONTEND_ORIGINS, render),
    proxyIps,
    managedFreeEdge,
    expectedHost,
    rateLimitMax: integer(env.RATE_LIMIT_MAX, 100, 'RATE_LIMIT_MAX', 1, 10000),
    rateLimitWindowMs: integer(env.RATE_LIMIT_WINDOW_MS, 900000, 'RATE_LIMIT_WINDOW_MS', 1000, 3600000),
    jsonBodyLimitBytes: integer(env.JSON_BODY_LIMIT_BYTES, 65536, 'JSON_BODY_LIMIT_BYTES', 1, 1048576),
    catalogApiEnabled,
    // Never enable demo routes in test/staging/production, even if the flag leaks.
    catalogDemoApiEnabled: nodeEnv === 'development' && String(env.CATALOG_DEMO_API_ENABLED ?? 'false').trim() === 'true',
    cloudinary: cloudinary(env),
    auth: authentication(env, nodeEnv, render, catalogDb, proxyIps, managedFreeEdge),
  };
  // Keep the property copyable for callers composing config, but redact JSON output.
  Object.defineProperties(config, {
    database: { value: catalogDb, enumerable: true },
    toJSON: { value: () => ({ ...config, database: catalogDb ? '[configurada]' : null }) },
  });
  return Object.freeze(config);
}
