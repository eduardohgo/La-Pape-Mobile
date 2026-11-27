import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createHealthRouter } from './routes/rutas-salud.js';
import { createPrivacyController } from './controllers/controlador-privacidad.js';
import { createAuthRouter } from './routes/rutas-auth.js';
import { createAuthRepository } from './repositories/repositorio-auth.js';
import { createAuthService } from './services/servicio-auth.js';
import { createPasswordHasher } from './services/credenciales-argon2id.js';
import { errorHandler, notFound } from './middlewares/manejo-errores.js';
import { createCatalogRouter } from './routes/rutas-catalogo.js';
import { createDemoCatalogRouter } from './routes/rutas-catalogo-demo.js';
import { createCatalogRepository } from './repositories/repositorio-catalogo.js';
import { clientAddress, renderIngress } from './middlewares/ingreso-render.js';
import { logFailure } from './log-operativo.js';
import { rejectAmbiguousHeaders } from './middlewares/encabezados-http.js';
import { createIngressObserver } from './middlewares/observador-ingreso.js';
import { createRegistrationService } from './services/servicio-registro.js';
import { createRegistrationMailer } from './services/correo-registro.js';

export function createApp(config, { catalogRepository, authService, authRepository, ingressObserverLogger, registrationService, registrationMailer } = {}) {
  const app = express();
  const observer = createIngressObserver(config, { write: ingressObserverLogger });
  const databases = [];
  const draining = [];
  let closing;
  app.locals.closeDatabases = () => {
    closing ??= (async () => {
      await Promise.allSettled(draining.map(service => Promise.resolve().then(() => service.close?.())));
      const results = await Promise.allSettled(databases.map(({ repository }) =>
        Promise.resolve().then(() => repository.close?.())));
      if (results.some(result => result.status === 'rejected')) throw new Error('Error al cerrar pools PostgreSQL');
    })();
    return closing;
  };
  app.locals.verifyDatabases = async () => {
    await Promise.all(databases.map(async ({ name, repository }) => {
      try {
        if (await repository.verifyPermissions()) return;
        logFailure(name + '_database_permissions_rejected');
      } catch {
        logFailure(name + '_database_preflight_failed');
      }
      throw new Error('Comprobación PostgreSQL rechazada');
    }));
  };
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use(helmet());
  // Observe sanitized syntax before validation/stripping, without changing trust.
  if (observer) app.use(observer);
  // Inspect the original header pairs before Node's merged values are trusted.
  app.use(rejectAmbiguousHeaders);
  app.use(renderIngress(config.runtime === 'render' ? config.proxyIps : [], {
    managedFreeEdge: config.managedFreeEdge === true,
    expectedHost: config.expectedHost,
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error('Origen no permitido');
      error.code = 'ORIGIN_DENIED';
      return callback(error);
    },
    methods: config.auth?.privacyEnabled ? ['GET', 'POST', 'PATCH', 'OPTIONS'] : ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  }));
  app.use(createHealthRouter());
  const httpLimit = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => ipKeyGenerator(clientAddress(req)),
    message: { error: 'Demasiadas peticiones, intenta más tarde' },
  });
  if (config.auth) {
    const needsRepository = !authService || (config.auth.registration && !registrationService) || config.auth.privacyEnabled;
    const hasher = needsRepository ? createPasswordHasher() : null;
    const repository = needsRepository ? authRepository ?? createAuthRepository(config.auth.database, { registrationEnabled: Boolean(config.auth.registration), deletionEnabled: config.auth.deletionEnabled, privacyEnabled: config.auth.privacyEnabled }) : null;
    const service = authService ?? createAuthService(repository, hasher, config.auth.limitKey);
    if (repository) databases.push({ name: 'auth', repository });
    // The router rejects ambiguous transport before consuming an IP budget or body.
    const signup = config.auth.registration ? registrationService ?? createRegistrationService(repository, hasher, {
      key: config.auth.registration.key, mailer: registrationMailer ?? createRegistrationMailer(config.auth.registration.mail),
    }) : null;
    if (signup) draining.push(signup);
    const privacy = config.auth.privacyEnabled ? createPrivacyController(repository) : null;
    app.use('/auth', createAuthRouter(service, config.auth, httpLimit, signup, privacy));
  }
  app.use(httpLimit);
  if (config.apiProfile !== 'auth-only') app.use(express.json({ limit: config.jsonBodyLimitBytes }));
  if (config.apiProfile !== 'auth-only' && config.catalogApiEnabled) {
    const repository = catalogRepository ?? createCatalogRepository(config.database);
    databases.push({ name: 'catalog', repository });
    app.use(createCatalogRouter(repository));
    if (config.nodeEnv === 'development' && config.catalogDemoApiEnabled) {
      app.use(createDemoCatalogRouter(repository));
    }
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
