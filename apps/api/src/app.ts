import cors from 'cors';
import express, { Application } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { httpLogger } from './middlewares/httpLogger';
import { metricsMiddleware } from './middlewares/metrics';
import { requestId } from './middlewares/requestId';
import { apiRouter, healthRouter } from './routes';

export function buildApp(): Application {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());

  const corsOrigins =
    env.CORS_ORIGINS === '*'
      ? '*'
      : env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: corsOrigins, credentials: false }));

  app.use(express.json({ limit: '100kb' }));
  app.use(requestId());
  app.use(httpLogger());
  app.use(metricsMiddleware());

  app.use('/', healthRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
