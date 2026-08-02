import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { createEditorGate } from './access/editor-gate.js';
import { assertSafeForEnvironment } from './composition/environment-safety.js';
import type { AppConfig } from './config/config.js';
import { createCatalogController } from './controllers/catalog-controller.js';
import { createScanController } from './controllers/scan-controller.js';
import { createSessionController } from './controllers/session-controller.js';
import { createStatusController } from './controllers/status-controller.js';
import { createTavolaController } from './controllers/tavola-controller.js';
import type { Db } from './db/client.js';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import type { Clock } from './platform/clock.js';
import type { EmailSender } from './platform/email.js';
import { createLogger, type Logger } from './platform/logger.js';
import type { PaymentProvider } from './platform/payments.js';
import { createCategoryRepository } from './repositories/category-repository.js';
import { createModelRepository } from './repositories/model-repository.js';
import { createScanRepository } from './repositories/scan-repository.js';
import { createSystemRepository } from './repositories/system-repository.js';
import { createTavolaRepository } from './repositories/tavola-repository.js';
import { createApiRouter } from './routes/api-router.js';
import { createCatalogService } from './services/catalog-service.js';
import { createScanService } from './services/scan-service.js';
import { createStatusService } from './services/status-service.js';
import { createTavolaService } from './services/tavola-service.js';
import { createFileStore, type FileStore } from './storage/file-store.js';
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
   * Where the archive's images live. Defaults to the directory `config` names — handed in only
   * so a test can put a suite's scans in a directory of its own and throw it away afterwards.
   */
  fileStore?: FileStore;
  /**
   * Where an error reporter would attach: after the routes, before our own error handler —
   * the only place it can see a failure and still let us answer with clean JSON.
   *
   * Nothing supplies this today. Ricambi has no error-tracking vendor (ADR 0011): unhandled
   * errors are logged to the box through pino, and adding a third party that receives stack
   * traces from a members-only archive was not worth a processor agreement before there is
   * even a deployment. This hook is the seam to reconsider at ticket 14, when there is one.
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

  // Before anything else. A non-production environment that could reach a real member or a real
  // mandate does not get to exist, and neither does a production one still wearing the stand-in
  // Editor gate — every way of starting this application comes through here.
  assertSafeForEnvironment({ config, emailSender, paymentProvider });

  const logger = dependencies.logger ?? createLogger(config);
  const fileStore = dependencies.fileStore ?? createFileStore(config.files.storagePath);

  if (config.editorGate.password === undefined) {
    logger.warn(
      'EDITOR_PASSWORD is not set, so nobody can sign in and no scan can be reached. ' +
        'Set it in .env to use the Editor screens.',
    );
  }

  const editorGate = createEditorGate({ config, clock });

  // repositories → services → controllers → routes
  const systemRepository = createSystemRepository(db);
  const modelRepository = createModelRepository(db);
  const categoryRepository = createCategoryRepository(db);
  const tavolaRepository = createTavolaRepository(db);
  const scanRepository = createScanRepository(db);

  const statusService = createStatusService({
    clock,
    environmentName: config.environmentName,
    environmentMode: config.environmentMode,
    systemRepository,
  });
  const catalogService = createCatalogService({ modelRepository, tavolaRepository });
  const tavolaService = createTavolaService({
    modelRepository,
    categoryRepository,
    tavolaRepository,
  });
  const scanService = createScanService({
    tavolaRepository,
    scanRepository,
    fileStore,
    clock,
    logger,
  });

  const statusController = createStatusController({ statusService });
  const sessionController = createSessionController({ editorGate });
  const catalogController = createCatalogController({ catalogService });
  const tavolaController = createTavolaController({ tavolaService });
  const scanController = createScanController({ scanService });

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

  // Members-only, in every environment: nothing here is for a search engine, and the
  // non-production system least of all. The markup says the same thing; this covers what a
  // crawler reaches that is not markup.
  app.use((_request, response, next) => {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.use(
    '/api',
    createApiRouter({
      editorGate,
      maxScanBytes: config.files.maxScanBytes,
      statusController,
      sessionController,
      catalogController,
      tavolaController,
      scanController,
    }),
  );
  app.use('/api', notFoundHandler);

  const staticSite = createStaticSiteHandler({
    webDistPath: config.webDistPath,
    environmentMode: config.environmentMode,
  });
  if (staticSite) {
    app.use(staticSite);
  }

  app.use(notFoundHandler);
  dependencies.attachErrorReporting?.(app);
  app.use(createErrorHandler(logger));

  return app;
}
