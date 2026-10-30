import { createApp } from './app.js';
import { seedPracticeArchiveIfEmpty } from './catalog/practice-archive.js';
import { assertSeedable } from './composition/environment-safety.js';
import { scheduleReminders } from './composition/reminder-run.js';
import { scheduleRetentionSweep } from './composition/retention-sweep.js';
import {
  createBreachedPasswordCheck,
  createEmailSender,
  createPaymentProvider,
} from './composition/platform.js';
import { configureReading } from './composition/reading.js';
import { loadConfig } from './config/config.js';
import { loadEnvFile } from './config/env-file.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { applyKeepAlivePolicy } from './http/keep-alive.js';
import { systemClock } from './platform/clock.js';
import { createLogger } from './platform/logger.js';
import { createFileStore } from './storage/file-store.js';

/**
 * The composition root. The only place that reads the environment, knows the real time, opens
 * a database connection or chooses an implementation for an external edge.
 */
loadEnvFile();

const config = loadConfig();
const logger = createLogger(config);

const database = createDatabase(config.databaseUrl);
const fileStore = createFileStore(config.files.storagePath);

/**
 * **Migrations run before the first request, not by somebody remembering.** A deployment whose
 * schema has not been applied does not fail loudly — it answers every request with a 500
 * against tables that are not there, which looks like a bug in the application rather than a
 * step nobody took. There is one container (ADR 0009), so there is no second writer to race.
 *
 * `MIGRATE_ON_START=false` is for the case where a person wants to run them by hand first.
 */
if (config.migrateOnStart) {
  await runMigrations(database.db);
  logger.info('Schema is up to date');
}

/**
 * A practice system with nothing in it is not a practice system.
 *
 * Only ever **when the catalog is empty**, so a redeployment cannot take away what an Editor
 * recorded through the screens, and only in an environment that has said out loud that it is
 * not the archive — `assertSeedable` refuses production and refuses silence alike.
 */
if (config.seedPracticeArchive) {
  assertSeedable(config);
  const seeded = await seedPracticeArchiveIfEmpty({
    db: database.db,
    fileStore,
    clock: systemClock,
    logger,
    config,
  });
  logger.info(
    seeded ?? {},
    seeded
      ? 'Wrote an invented catalog into an empty practice archive'
      : 'Catalog already has content — left it alone',
  );
}

const paymentProvider = createPaymentProvider(config, systemClock);
const emailSender = createEmailSender(config, logger);

const app = createApp({
  config,
  clock: systemClock,
  db: database.db,
  emailSender,
  paymentProvider,
  breachedPasswords: createBreachedPasswordCheck(config, logger),
  reading: configureReading(config.reading),
  fileStore,
  logger,
});

/**
 * **The retention rule is applied by the system, not by somebody remembering** (story 133).
 * Once now and then daily: Accounts lapsed beyond the retention period are deleted, and what
 * they published stays (ADR 0007). After `createApp`, so the environment guard has already had
 * its say; `roster:retention-sweep --dry-run` rehearses the same thing from the command line.
 */
const stopRetentionSweep = scheduleRetentionSweep({
  db: database.db,
  clock: systemClock,
  logger,
  fileStore,
  retention: config.retention,
  paymentProvider,
});

/**
 * **Renewal reminders, nightly** (issue #3). Scheduled in every environment and sending in
 * almost none: nothing leaves unless this environment allows it, an Administrator has switched
 * it on and the Club has said where the money goes. `createApp` has already refused to start a
 * practice system that claims it may send them.
 */
const stopReminders = scheduleReminders({
  db: database.db,
  clock: systemClock,
  logger,
  emailSender,
  paymentProvider,
  config,
});

/**
 * Every interface, as a deployment behind Traefik needs — except while `DEV_SIGN_IN_AS` lets in
 * every request without a session, when only this machine (and Vite's proxy on it) may ask.
 */
function listening(): void {
  logger.info({ port: config.port, environment: config.environmentName }, 'Ricambi API listening');
}
const server =
  config.session.devSignInAs === undefined
    ? app.listen(config.port, listening)
    : app.listen(config.port, '127.0.0.1', () => {
        listening();
        logger.warn(
          { as: config.session.devSignInAs },
          'DEV_SIGN_IN_AS is set: every request without a session is signed in as this Account',
        );
      });

/**
 * **Nothing in front of this API may be holding a connection this server has already closed.**
 * Traefik pools its upstream connections (ADR 0009) and Node's five-second default expires long
 * before Traefik's ninety seconds, so requests were being written into sockets on their way out and
 * lost — `socket hang up`, intermittent, unreproducible. Ticket 26; the reasoning, both numbers
 * and the reproduction are in `http/keep-alive.ts` and its test. Not defaults being restated.
 */
applyKeepAlivePolicy(server);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
    stopRetentionSweep();
    stopReminders();
    app.interruptCatalogRuns();
    server.close(() => {
      void database.close().then(() => process.exit(0));
    });
  });
}
