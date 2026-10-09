import type { RetentionReport, RetentionTerms } from '@ricambi/contracts';
import type { Db } from '../db/client.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { PaymentProvider } from '../platform/payments.js';
import { createAccountRepository } from '../repositories/account-repository.js';
import { createRetentionRepository } from '../repositories/retention-repository.js';
import { createRetentionService } from '../services/retention-service.js';
import { createSubscriptionEnding } from '../services/subscription-service.js';
import type { FileStore } from '../storage/file-store.js';

/**
 * **The retention rule, applied rather than remembered** (story 133, ADR 0007).
 *
 * Nobody presses a button for this. The running application calls it once a day, and
 * `roster:retention-sweep` calls it from the command line — which is why it is a function here
 * rather than a page of wiring in either: a sweep nothing exercises is one that is discovered to
 * be wrong by the person it deleted.
 *
 * `dryRun` reads exactly what the sweep reads and writes nothing. It is the same report either
 * way, so what a rehearsal said is what the sweep then does.
 */
export interface RetentionSweepDependencies {
  db: Db;
  /** The injected one. Nothing here knows what the machine thinks the time is. */
  clock: Clock;
  logger: Logger;
  fileStore: FileStore;
  retention: RetentionTerms;
  /** So that somebody the sweep deletes stops being charged. */
  paymentProvider: PaymentProvider;
}

export async function runRetentionSweep(
  dependencies: RetentionSweepDependencies,
  options: { dryRun?: boolean } = {},
): Promise<RetentionReport> {
  const { db, clock, logger, fileStore, retention, paymentProvider } = dependencies;

  const service = createRetentionService({
    terms: retention,
    endSubscriptions: createSubscriptionEnding({ db, clock, paymentProvider, logger }),
    clock,
    accountRepository: createAccountRepository(db),
    retentionRepository: createRetentionRepository(db),
    fileStore,
    logger,
  });

  const report = options.dryRun ? await service.report() : await service.sweep();

  // Counts and never names, like every other line about a person in this log.
  logger.info(
    {
      asOf: report.asOf,
      accounts: report.accounts.length,
      paymentRecords: report.paymentRecords,
      dryRun: options.dryRun === true,
    },
    options.dryRun ? 'Rehearsed the retention sweep' : 'Ran the retention sweep',
  );

  return report;
}

/** Once a day is as often as a rule measured in years needs applying. */
const A_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Runs the sweep now and then daily, for as long as the process lives. **A failure is logged and
 * the next day tries again** — the archive does not stop serving its members because a
 * housekeeping pass could not reach the database at four in the morning.
 *
 * Answers with how to stop it, for a clean shutdown.
 */
export function scheduleRetentionSweep(dependencies: RetentionSweepDependencies): () => void {
  const sweep = (): void => {
    runRetentionSweep(dependencies).catch((error: unknown) => {
      dependencies.logger.error({ err: error }, 'The retention sweep failed');
    });
  };

  sweep();
  const timer = setInterval(sweep, A_DAY_MS);
  // The sweep is not a reason to keep the process alive once the server has closed.
  timer.unref();

  return () => clearInterval(timer);
}
