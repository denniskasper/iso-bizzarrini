import type { ReminderRun } from '@ricambi/contracts';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../db/client.js';
import type { Clock } from '../platform/clock.js';
import type { EmailSender } from '../platform/email.js';
import type { Logger } from '../platform/logger.js';
import type { PaymentProvider } from '../platform/payments.js';
import { createClubRepository } from '../repositories/club-repository.js';
import { createReminderRepository } from '../repositories/reminder-repository.js';
import { createClubService } from '../services/club-service.js';
import { createReminderService, type ReminderService } from '../services/reminder-service.js';

/**
 * **The nightly reminder run** (issue #3), as the running application calls it.
 *
 * A function here rather than wiring inside `main.ts` for the reason the retention sweep is: a
 * job nothing exercises is discovered to be wrong by the people it wrote to. The tests call
 * this, with a clock they move and a mailbox they can count.
 *
 * **It sends nothing unless three things are true** — the environment allows it, an
 * Administrator has switched it on, and the Club has said where the money goes — and says
 * nothing when they are not: a job that is off is not an error to log every night.
 */
export interface ReminderRunDependencies {
  db: Db;
  /** The injected one. The window, the once-only rule and "weekly" are all measured on it. */
  clock: Clock;
  logger: Logger;
  emailSender: EmailSender;
  paymentProvider: PaymentProvider;
  config: Pick<AppConfig, 'remindersEnabled' | 'publicUrl'>;
}

export function createReminders(dependencies: ReminderRunDependencies): ReminderService {
  const { db, clock, logger, emailSender, paymentProvider, config } = dependencies;

  return createReminderService({
    clock,
    reminderRepository: createReminderRepository(db),
    clubService: createClubService({ clock, clubRepository: createClubRepository(db) }),
    emailSender,
    logger,
    remindersEnabled: config.remindersEnabled,
    takesPayments: paymentProvider.takesPayments,
    publicUrl: config.publicUrl,
  });
}

export function runReminders(dependencies: ReminderRunDependencies): Promise<ReminderRun> {
  return createReminders(dependencies).runNightly();
}

const A_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Once now and then daily, for as long as the process lives. A failure is logged and the next
 * day tries again; the once-per-term mark is what makes "again" safe.
 *
 * Answers with how to stop it, for a clean shutdown.
 */
export function scheduleReminders(dependencies: ReminderRunDependencies): () => void {
  const run = (): void => {
    runReminders(dependencies).catch((error: unknown) => {
      dependencies.logger.error({ err: error }, 'The reminder run failed');
    });
  };

  run();
  const timer = setInterval(run, A_DAY_MS);
  timer.unref();

  return () => clearInterval(timer);
}
