/**
 * **The retention sweep, by hand** — and, with `--dry-run`, the rehearsal of it.
 *
 * The running application applies the rule once a day without being asked (ADR 0007, story
 * 133), so nobody needs this to keep the Club compliant. It is here for the two moments somebody
 * wants to look first: before the retention period is changed, and before a deployment that has
 * been switched off for a while is switched back on.
 *
 *   pnpm roster:retention-sweep -- --dry-run
 *
 * **It lives under `src/` so that it is compiled into the image**, like the other command an
 * operator runs on the box:
 *
 *   node dist/cli/retention-sweep.js --dry-run
 *
 * The dry run prints who would be deleted and deletes nobody. Without the flag it deletes them,
 * and what they published stays under "a former member".
 */
import { parseArgs } from 'node:util';
import { assertSafeForEnvironment } from '../composition/environment-safety.js';
import { createEmailSender, createPaymentProvider } from '../composition/platform.js';
import { runRetentionSweep } from '../composition/retention-sweep.js';
import { loadConfig } from '../config/config.js';
import { loadEnvFile } from '../config/env-file.js';
import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { systemClock } from '../platform/clock.js';
import { createLogger } from '../platform/logger.js';
import { createFileStore } from '../storage/file-store.js';

const { values } = parseArgs({
  // `pnpm roster:retention-sweep -- --dry-run` hands the `--` down to the script, where it would
  // otherwise turn the flag after it into a positional — and a sweep that mistook `--dry-run`
  // for nothing at all is the one mistake this command must not be able to make.
  args: process.argv.slice(2).filter((token) => token !== '--'),
  options: {
    'dry-run': { type: 'boolean', default: false },
  },
});

const dryRun = values['dry-run'];

loadEnvFile();
const config = loadConfig();
const logger = createLogger(config);

// ADR 0012: an entry point that does not build the application owes the environment guard a
// call of its own.
assertSafeForEnvironment({
  config,
  emailSender: createEmailSender(config, logger),
  paymentProvider: createPaymentProvider(config),
});

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });

try {
  await runMigrations(database.db);

  const report = await runRetentionSweep(
    {
      db: database.db,
      clock: systemClock,
      logger,
      fileStore: createFileStore(config.files.storagePath),
      retention: config.retention,
    },
    { dryRun },
  );

  const would = dryRun ? 'would be deleted' : 'deleted';
  console.log(
    `As of ${report.asOf}, with Accounts kept ${report.retention.accountYears} years after they ` +
      `lapse and payment records ${report.retention.paymentRecordYears} years:`,
  );
  for (const account of report.accounts) {
    console.log(`  ${account.name} <${account.email}> — kept until ${account.keptUntil}, ${would}`);
  }
  console.log(
    `${report.accounts.length} Account(s) ${would}; ` +
      `${report.paymentRecords} payment record(s) past the statutory period ${would}.`,
  );
  if (dryRun) {
    console.log('Nothing was written. Run it without --dry-run, or leave it to the daily sweep.');
  }
} finally {
  await database.close();
}
