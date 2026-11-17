import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { createHealthRouter } from './routes/rutas-salud.js';
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

export function createApp(config, { catalogRepository, authService, authRepository } = {}) {
  const app = express();
  const databases = [];
  let closing;
  app.locals.closeDatabases = () => {
    closing ??= Promise.allSettled(databases.map(({ repository }) =>
      Promise.resolve().then(() => repository.close?.()))).then(results => {
      if (results.some(result => result.status === 'rejected')) throw new Error('Error al cerrar pools PostgreSQL');
    });
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
  app.use(renderIngress(config.runtime === 'render' ? config.proxyIps : []));
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error('Origen no permitido');
      error.code = 'ORIGIN_DENIED';
      return callback(error);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  }));
  app.use(createHealthRouter());
  app.use(rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => ipKeyGenerator(clientAddress(req)),
    message: { error: 'Demasiadas peticiones, intenta más tarde' },
  }));
  if (config.auth) {
    const hasher = authService ? null : createPasswordHasher();
    const repository = authService ? null : authRepository ?? createAuthRepository(config.auth.database);
    const service = authService ?? createAuthService(repository, hasher, config.auth.limitKey);
    if (repository) databases.push({ name: 'auth', repository });
    app.use('/auth', createAuthRouter(service, config.auth));
  }
  app.use(express.json({ limit: config.jsonBodyLimitBytes }));
  if (config.catalogApiEnabled) {
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
