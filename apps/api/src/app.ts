import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { createGate } from './access/gate.js';
import { createUncheckedTavolaGuard } from './access/unchecked-tavole.js';
import { createPasswordHasher, type PasswordHasher } from './access/passwords.js';
import { assertSafeForEnvironment } from './composition/environment-safety.js';
import type { ConfiguredReading } from './composition/reading.js';
import { createReminders } from './composition/reminder-run.js';
import type { AppConfig } from './config/config.js';
import { createBulkPasteController } from './controllers/bulk-paste-controller.js';
import { createCatalogController } from './controllers/catalog-controller.js';
import { createCatalogRunController } from './controllers/catalog-run-controller.js';
import { createCheckingController } from './controllers/checking-controller.js';
import { createCategoryController } from './controllers/category-controller.js';
import { createClubController } from './controllers/club-controller.js';
import { createLegalController } from './controllers/legal-controller.js';
import { createContributionController } from './controllers/contribution-controller.js';
import { createContributionReviewController } from './controllers/contribution-review-controller.js';
import { createPartController } from './controllers/part-controller.js';
import { createPartRecordController } from './controllers/part-record-controller.js';
import { createPhotographController } from './controllers/photograph-controller.js';
import { createPositionController } from './controllers/position-controller.js';
import { createReadingController } from './controllers/reading-controller.js';
import { createReminderController } from './controllers/reminder-controller.js';
import { createRetentionController } from './controllers/retention-controller.js';
import { createRosterController } from './controllers/roster-controller.js';
import { createRosterImportController } from './controllers/roster-import-controller.js';
import { createScanController } from './controllers/scan-controller.js';
import { createSearchController } from './controllers/search-controller.js';
import { createSessionController } from './controllers/session-controller.js';
import { createStatusController } from './controllers/status-controller.js';
import {
  createSubscriptionController,
  type RawBodied,
} from './controllers/subscription-controller.js';
import { createTavolaController } from './controllers/tavola-controller.js';
import type { Db } from './db/client.js';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import type { BreachedPasswordCheck } from './platform/breached-passwords.js';
import { readBuild, type Build } from './platform/build.js';
import type { Clock } from './platform/clock.js';
import type { EmailSender } from './platform/email.js';
import { createLogger, describeError, type Logger } from './platform/logger.js';
import type { PaymentProvider } from './platform/payments.js';
import { createAccountRepository } from './repositories/account-repository.js';
import { createCategoryRepository } from './repositories/category-repository.js';
import { createClubRepository } from './repositories/club-repository.js';
import { createProcessorRepository } from './repositories/processor-repository.js';
import { createContributionRepository } from './repositories/contribution-repository.js';
import { createModelRepository } from './repositories/model-repository.js';
import { createPartRecordRepository } from './repositories/part-record-repository.js';
import { createPartRepository } from './repositories/part-repository.js';
import { createPhotographRepository } from './repositories/photograph-repository.js';
import { createPositionRepository } from './repositories/position-repository.js';
import { createReadingRepository } from './repositories/reading-repository.js';
import { createCatalogRunRepository } from './repositories/catalog-run-repository.js';
import { createRetentionRepository } from './repositories/retention-repository.js';
import { createScanRepository } from './repositories/scan-repository.js';
import { createSignInFailureRepository } from './repositories/sign-in-failure-repository.js';
import { createSystemRepository } from './repositories/system-repository.js';
import { createTavolaRepository } from './repositories/tavola-repository.js';
import { API_MOUNT, createApiRouter, WEBHOOK_PATH } from './routes/api-router.js';
import { createAccountService } from './services/account-service.js';
import { createBulkPasteService } from './services/bulk-paste-service.js';
import { createCatalogService } from './services/catalog-service.js';
import { createCheckingService } from './services/checking-service.js';
import { createCategoryService } from './services/category-service.js';
import { createClubService } from './services/club-service.js';
import { createLegalService } from './services/legal-service.js';
import { createContributionReviewService } from './services/contribution-review-service.js';
import { createContributionService } from './services/contribution-service.js';
import { createPartRecordService } from './services/part-record-service.js';
import { createPartService } from './services/part-service.js';
import { createPhotographService } from './services/photograph-service.js';
import { createPositionService } from './services/position-service.js';
import { createRetentionService } from './services/retention-service.js';
import { createRosterImportService } from './services/roster-import-service.js';
import { createRosterService } from './services/roster-service.js';
import { createScanService } from './services/scan-service.js';
import { createCatalogRunService } from './services/catalog-run-service.js';
import { createSearchService } from './services/search-service.js';
import { createStatusService } from './services/status-service.js';
import {
  createSubscriptionEnding,
  createSubscriptionService,
} from './services/subscription-service.js';
import { createTavolaService } from './services/tavola-service.js';
import { createFileStore, type FileStore } from './storage/file-store.js';
import { createStaticSiteHandler } from './http/static-site.js';

/**
 * Everything the application needs from the outside world, handed in rather than reached for.
 * Tests supply a real database, a clock they can move, and fakes for the three external edges.
 */
export interface AppDependencies {
  config: AppConfig;
  clock: Clock;
  db: Db;
  emailSender: EmailSender;
  paymentProvider: PaymentProvider;
  /**
   * The third external edge (ADR 0003): somebody else's list of passwords already stolen. Faked
   * in tests for the same reason the other two are — a seam must not need a third party to be up.
   */
  breachedPasswords: BreachedPasswordCheck;
  /**
   * What the factory catalog is read with (issue #55): the one edge that talks to a model. Tests
   * hand in the method they want reported, or the fake one, as they hand in an e-mail sender.
   */
  reading: ConfiguredReading;
  logger?: Logger;
  /**
   * How hard passwords are to store. Defaults to the recommended cost, which is deliberately a
   * third of a second; a suite that signs in a hundred times hands in a cheaper one, and still
   * runs the same scrypt through the same encoding rather than a stub that proves nothing.
   */
  passwordHasher?: PasswordHasher;
  /**
   * Where the archive's images live. Defaults to the directory `config` names — handed in only
   * so a test can put a suite's scans in a directory of its own and throw it away afterwards.
   */
  fileStore?: FileStore;
  /**
   * Which Ricambi this is. Defaults to what the repository root says — handed in only so a test
   * can say it was built from a commit.
   */
  build?: Build;
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

/** Where the payment provider delivers, as the request itself spells it. */
const WEBHOOK_ADDRESS = API_MOUNT + WEBHOOK_PATH;

/** The application, and what the process that serves it tells it as it goes away. */
export type RicambiApp = Express & {
  /**
   * The process is going away: every Catalog run reading here stops before its next request and
   * is left running, for the next server to carry on (issue #59).
   */
  interruptCatalogRuns(): void;
};

export function createApp(dependencies: AppDependencies): RicambiApp {
  const { config, clock, db, emailSender, paymentProvider, reading } = dependencies;

  // Before anything else. A non-production environment that could reach a real member or a real
  // mandate does not get to exist, and neither does a production one that has not been told the
  // address its invitations point at — every way of starting this application comes through here.
  assertSafeForEnvironment({ config, emailSender, paymentProvider, reading });

  const logger = dependencies.logger ?? createLogger(config);
  const fileStore = dependencies.fileStore ?? createFileStore(config.files.storagePath);

  const passwordHasher = dependencies.passwordHasher ?? createPasswordHasher();

  // repositories → services → controllers → routes
  const systemRepository = createSystemRepository(db);
  const accountRepository = createAccountRepository(db);
  const signInFailureRepository = createSignInFailureRepository(db);
  const clubRepository = createClubRepository(db);
  const processorRepository = createProcessorRepository(db);
  const modelRepository = createModelRepository(db);
  const categoryRepository = createCategoryRepository(db);
  const tavolaRepository = createTavolaRepository(db);
  const readingRepository = createReadingRepository(db);
  const catalogRunRepository = createCatalogRunRepository(db);
  const positionRepository = createPositionRepository(db);
  const partRepository = createPartRepository(db);
  const partRecordRepository = createPartRecordRepository(db);
  const photographRepository = createPhotographRepository(db);
  const contributionRepository = createContributionRepository(db);
  const scanRepository = createScanRepository(db);
  const retentionRepository = createRetentionRepository(db);

  const statusService = createStatusService({
    clock,
    build: dependencies.build ?? readBuild(),
    environmentName: config.environmentName,
    environmentMode: config.environmentMode,
    systemRepository,
  });
  /**
   * **Who a person is** — and, deliberately, not what they may do. The gate below takes this as
   * its way of turning a session into somebody; the authorising happens there, downstream, so
   * that a lapsed member still authenticates and can be told plainly what is wrong (story 8).
   */
  const accountService = createAccountService({
    clock,
    accountRepository,
    signInFailureRepository,
    passwordHasher,
    breachedPasswords: dependencies.breachedPasswords,
    emailSender,
    publicUrl: config.publicUrl,
    renewalGraceDays: config.renewalGraceDays,
  });
  const gate = createGate({ config, clock, accounts: accountService });

  const rosterService = createRosterService({
    clock,
    accountRepository,
    accountService,
    logger,
    renewalGraceDays: config.renewalGraceDays,
  });
  /**
   * **Handed the database itself rather than repositories**, like bulk paste and for the same
   * reason: an import is one press that records a whole membership list, so it runs in a
   * transaction, and it re-reads the roster inside that transaction so that what an Administrator
   * was shown is what is carried out. The session decides the repositories, so the repositories
   * cannot be decided here.
   */
  const rosterImportService = createRosterImportService({
    db,
    clock,
    renewalGraceDays: config.renewalGraceDays,
  });
  const clubService = createClubService({ clock, clubRepository });
  // Handed the same retention figures the sweep below is, so the privacy statement and the thing
  // that carries it out cannot come to say different things (ADR 0007).
  const legalService = createLegalService({
    retention: config.retention,
    clock,
    clubService,
    processorRepository,
  });
  const subscriptionService = createSubscriptionService({
    db,
    clock,
    paymentProvider,
    clubService,
    accounts: accountService,
    renewalGraceDays: config.renewalGraceDays,
    logger,
    publicUrl: config.publicUrl,
  });
  const retentionService = createRetentionService({
    terms: config.retention,
    endSubscriptions: createSubscriptionEnding({ db, clock, paymentProvider, logger }),
    clock,
    accountRepository,
    retentionRepository,
    fileStore,
    logger,
  });

  const catalogService = createCatalogService({ modelRepository, tavolaRepository });
  // **The way into the archive that does not start at the car** (ticket 22). Two repositories and
  // nothing else: it asks what the query names and where those Parts are listed, and everything a
  // member then reads about one arrives when they open it on a drawing.
  const searchService = createSearchService({ partRepository, partRecordRepository });
  const positionService = createPositionService({ tavolaRepository, positionRepository });
  const partRecordService = createPartRecordService({
    clock,
    modelRepository,
    partRepository,
    partRecordRepository,
    photographRepository,
  });
  const partService = createPartService({
    tavolaRepository,
    positionRepository,
    partRepository,
    partRecordService,
  });
  // **The one service handed the database itself rather than repositories.** A paste is one
  // press that writes a whole catalog page, so it runs in a transaction — half a page written is
  // worse than none of it — and it re-reads the archive inside that transaction so that what an
  // Editor was shown is what is carried out. The session decides the repositories, so the
  // repositories cannot be decided here.
  const bulkPasteService = createBulkPasteService({ db });
  const categoryService = createCategoryService({ categoryRepository, tavolaRepository });
  const tavolaService = createTavolaService({
    clock,
    modelRepository,
    categoryRepository,
    tavolaRepository,
    readingRepository,
    positionService,
  });
  const photographService = createPhotographService({
    partRepository,
    photographRepository,
    partRecordService,
    fileStore,
    clock,
    logger,
  });
  const contributionService = createContributionService({
    contributionRepository,
    partRepository,
    positionRepository,
    fileStore,
    clock,
    logger,
  });
  const contributionReviewService = createContributionReviewService({
    contributionRepository,
    positionRepository,
    tavolaRepository,
    partService,
  });
  const scanService = createScanService({
    tavolaRepository,
    scanRepository,
    fileStore,
    clock,
    logger,
  });

  const uncheckedTavolaGuard = createUncheckedTavolaGuard({ gate, tavolaRepository });
  const statusController = createStatusController({ statusService });
  const sessionController = createSessionController({ gate, accountService });
  const rosterController = createRosterController({ gate, rosterService });
  const subscriptionController = createSubscriptionController({
    gate,
    paymentProvider,
    subscriptionService,
  });
  const reminderController = createReminderController({
    // Built the way the nightly run builds it, so the preview and the run are one reading.
    reminderService: createReminders({ db, clock, logger, emailSender, paymentProvider, config }),
  });
  const readingController = createReadingController({ reading });
  const catalogRunService = createCatalogRunService({
    reading,
    catalogRunRepository,
    modelRepository,
    fileStore,
    clock,
    db,
    logger,
  });
  const catalogRunController = createCatalogRunController({ gate, catalogRunService });
  const retentionController = createRetentionController({ gate, retentionService });
  const rosterImportController = createRosterImportController({ gate, rosterImportService });
  const clubController = createClubController({ gate, clubService });
  const legalController = createLegalController({ legalService });
  const searchController = createSearchController({ gate, searchService });
  const catalogController = createCatalogController({ gate, catalogService });
  const categoryController = createCategoryController({ gate, categoryService });
  const tavolaController = createTavolaController({ gate, tavolaService });
  const positionController = createPositionController({ positionService });
  const partController = createPartController({ gate, partService });
  const partRecordController = createPartRecordController({ partRecordService });
  const bulkPasteController = createBulkPasteController({ bulkPasteService });
  const photographController = createPhotographController({ photographService });
  const contributionController = createContributionController({ gate, contributionService });
  const contributionReviewController = createContributionReviewController({
    gate,
    contributionReviewService,
  });
  const scanController = createScanController({ scanService });
  const checkingController = createCheckingController({
    checkingService: createCheckingService({
      tavolaRepository,
      partRepository,
      readingRepository,
      fileStore,
      logger,
    }),
  });

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
      contentSecurityPolicy: {
        directives: {
          // Helmet's own `img-src`, and one thing more: a photograph a member has picked and
          // not yet sent is shown to them from a `blob:` address the browser made for it
          // (issue #5). That is a picture already on their own phone, addressed by this page
          // and readable by no other — nothing the archive serves is reachable through it.
          'img-src': ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  );
  // The request logger keeps serializers of its own, so it is handed the same account of an
  // error the rest of the log uses rather than left to write one out whole.
  app.use(pinoHttp({ logger, serializers: { err: describeError } }));

  // Members-only, in every environment: nothing here is for a search engine, and the
  // non-production system least of all. The markup says the same thing; this covers what a
  // crawler reaches that is not markup.
  app.use((_request, response, next) => {
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  app.use(
    express.json({
      limit: '1mb',
      /**
       * **The payment provider signs the bytes it sent**, and a body that has been parsed and
       * written out again is not those bytes. So for that one address, and for no other, the
       * bytes are kept beside what they parse to.
       */
      verify: (request, _response, body) => {
        if (request.url === WEBHOOK_ADDRESS) {
          (request as RawBodied).rawBody = body;
        }
      },
    }),
  );

  app.use(
    API_MOUNT,
    createApiRouter({
      gate,
      uncheckedTavolaGuard,
      maxScanBytes: config.files.maxScanBytes,
      maxPhotographBytes: config.files.maxPhotographBytes,
      maxCatalogBytes: config.files.maxCatalogBytes,
      statusController,
      sessionController,
      rosterController,
      subscriptionController,
      reminderController,
      readingController,
      catalogRunController,
      retentionController,
      rosterImportController,
      clubController,
      legalController,
      searchController,
      catalogController,
      categoryController,
      tavolaController,
      positionController,
      partController,
      partRecordController,
      bulkPasteController,
      photographController,
      contributionController,
      contributionReviewController,
      scanController,
      checkingController,
    }),
  );
  app.use(API_MOUNT, notFoundHandler);

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

  // **A Catalog run left running by the last server is carried on** (issue #59). Every merge
  // redeploys the preview, so this is the usual way a run meets a restart, not an accident.
  catalogRunService.pickUp().catch((error: unknown) => {
    logger.error({ err: error }, 'Could not carry on the Catalog runs left running');
  });

  return Object.assign(app, {
    interruptCatalogRuns: () => catalogRunService.interrupt(),
  });
}
