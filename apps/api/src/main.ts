import { createApp } from './app.js';
import { seedPracticeArchiveIfEmpty } from './catalog/practice-archive.js';
import { assertSeedable } from './composition/environment-safety.js';
import { scheduleRetentionSweep } from './composition/retention-sweep.js';
import {
  createBreachedPasswordCheck,
  createEmailSender,
  createPaymentProvider,
} from './composition/platform.js';
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

const app = createApp({
  config,
  clock: systemClock,
  db: database.db,
  emailSender: createEmailSender(config, logger),
  paymentProvider: createPaymentProvider(config),
  breachedPasswords: createBreachedPasswordCheck(config, logger),
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
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, environment: config.environmentName }, 'Ricambi API listening');
});

/**
 * **Nothing in front of this API may be holding a connection this server has already closed.**
 * Caddy pools its upstream connections (ADR 0009) and Node's five-second default expires long
 * before Caddy's two minutes, so requests were being written into sockets on their way out and
 * lost — `socket hang up`, intermittent, unreproducible. Ticket 26; the reasoning, both numbers
 * and the reproduction are in `http/keep-alive.ts` and its test. Not defaults being restated.
 */
applyKeepAlivePolicy(server);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
    stopRetentionSweep();
    server.close(() => {
      void database.close().then(() => process.exit(0));
    });
  });
}
