import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/config.js';
import { createCatalogController } from './controllers/catalog-controller.js';
import { createStatusController } from './controllers/status-controller.js';
import type { Db } from './db/client.js';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import type { Clock } from './platform/clock.js';
import type { EmailSender } from './platform/email.js';
import { createLogger, type Logger } from './platform/logger.js';
import type { PaymentProvider } from './platform/payments.js';
import { createModelRepository } from './repositories/model-repository.js';
import { createSystemRepository } from './repositories/system-repository.js';
import { createApiRouter } from './routes/api-router.js';
import { createCatalogService } from './services/catalog-service.js';
import { createStatusService } from './services/status-service.js';
import { createStaticSiteHandler } from './http/static-site.js';

/**
 * Everything the application needs from the outside world, handed in rather than reached for.
 * Tests supply a real database, a clock they can move, and fakes for the two external edges.
 */
export interface AppDependencies {
  config: AppConfig;
  clock: Clock;
  db: Db;
  emailSender: EmailSender;
  paymentProvider: PaymentProvider;
  logger?: Logger;
  /**
   * Hook for the error reporter, called after the routes and before our own error handler —
   * which is the only place it can see a failure and still let us answer with clean JSON.
   */
  attachErrorReporting?: (app: Express) => void;
}

/** The injected edges, reachable from any handler that later needs them. */
export interface PlatformLocals {
  clock: Clock;
  emailSender: EmailSender;
  paymentProvider: PaymentProvider;
}

export function createApp(dependencies: AppDependencies): Express {
  const { config, clock, db, emailSender, paymentProvider } = dependencies;
  const logger = dependencies.logger ?? createLogger(config);

  // repositories → services → controllers → routes
  const systemRepository = createSystemRepository(db);
  const modelRepository = createModelRepository(db);

  const statusService = createStatusService({
    clock,
    environmentName: config.environmentName,
    systemRepository,
  });
  const catalogService = createCatalogService({ modelRepository });

  const statusController = createStatusController({ statusService });
  const catalogController = createCatalogController({ catalogService });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  const platform: PlatformLocals = { clock, emailSender, paymentProvider };
  app.locals.platform = platform;

  app.use(
    helmet({
      // The scans are served from this origin only; nothing is embedded anywhere else.
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', createApiRouter({ statusController, catalogController }));
  app.use('/api', notFoundHandler);

  const staticSite = createStaticSiteHandler(config.webDistPath);
  if (staticSite) {
    app.use(staticSite);
  }

  app.use(notFoundHandler);
  dependencies.attachErrorReporting?.(app);
  app.use(createErrorHandler(logger));

  return app;
}
