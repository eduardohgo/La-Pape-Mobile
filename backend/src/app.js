import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHealthRouter } from './routes/health.routes.js';
import { errorHandler, notFound } from './middlewares/errors.js';

export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
      const error = new Error('Origen no permitido');
      error.code = 'ORIGIN_DENIED';
      return callback(error);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  }));
  app.use(rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones, intenta más tarde' },
  }));
  app.use(express.json({ limit: config.jsonBodyLimitBytes }));
  app.use(createHealthRouter());
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
