import type {
  Erasure,
  RetentionCandidate,
  RetentionReport,
  RetentionTerms,
} from '@ricambi/contracts';
import { ConflictError, NotFoundError } from '../http/errors.js';
import { today, type Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { RetentionRepository } from '../repositories/retention-repository.js';
import { photographKeyPrefix, type FileStore } from '../storage/file-store.js';

/**
 * Retention and erasure (ADR 0007): **the personal data goes and the knowledge stays.**
 *
 * A Contribution is personal data and it is also the archive. Deleting what somebody taught the
 * Club because they left, died or asked to be forgotten would destroy the thing this platform
 * exists to preserve, so what is deleted is the *identification*: the Account, its password, its
 * address, and every unpublished thing that was only ever theirs. What they published stays and
 * reads "a former member".
 *
 * Two things are deliberately not done here. **A Contribution's text is never altered** — a name
 * inside a sentence is an editorial job on that sentence, for an Editor who can read it. And
 * **a payment the Club received is not erased**: it is kept, with the payer's name, for the
 * statutory accounting period, and the privacy statement says so rather than promising otherwise.
 */
export interface RetentionService {
  /** The figures the sweep applies, for the privacy statement to quote. */
  terms(): RetentionTerms;
  /** An Administrator deleting one person's personal data on request (story 131). */
  erase(accountId: string, askedBy: string): Promise<Erasure>;
  /**
   * **The dry run**: what a sweep would delete today, read exactly as the sweep reads it and
   * writing nothing.
   */
  report(): Promise<RetentionReport>;
  /**
   * Deletes every Account lapsed beyond the retention period, and every payment record whose
   * statutory period has run out (story 133). Answers with what it deleted, in the shape the dry
   * run promised it in.
   */
  sweep(): Promise<RetentionReport>;
}

export function createRetentionService(dependencies: {
  terms: RetentionTerms;
  clock: Clock;
  accountRepository: AccountRepository;
  retentionRepository: RetentionRepository;
  fileStore: FileStore;
  logger: Logger;
}): RetentionService {
  const { terms, clock, accountRepository, retentionRepository, fileStore, logger } = dependencies;

  /**
   * The rows first, in their transaction, and the files after it: a file is not part of any
   * transaction, and a picture left on disk with no row pointing at it is unreachable — there is
   * no address that serves it — whereas a row pointing at a file already gone is a broken page.
   */
  async function erase(
    accountId: string,
    unless?: (paidThrough: string | null) => boolean,
  ): Promise<Erasure | null> {
    const erased = await retentionRepository.erase(accountId, unless);
    if (!erased) {
      return null;
    }

    const { removedPhotographIds, ...counts } = erased;
    for (const photographId of removedPhotographIds) {
      await fileStore.remove(photographKeyPrefix(photographId)).catch((error: unknown) => {
        logger.warn({ err: error, photographId }, 'Could not remove an erased member’s photograph');
      });
    }

    // The id and the counts, and nothing that says who: the log is kept on the box under no
    // retention rule of its own, so a name written here would outlive the erasure it reports.
    logger.info({ accountId, ...counts }, 'Deleted an Account and its personal data');
    return counts;
  }

  /**
   * One reading, used by the dry run and by the sweep alike — which is the whole of what makes
   * the dry run worth believing. **`now` is the injected clock's**, read once, so every date in
   * a report was measured against the same day.
   */
  async function report(): Promise<RetentionReport> {
    const asOf = today(clock);

    const [everyone, paidThrough, paymentRecords] = await Promise.all([
      accountRepository.listAll(),
      accountRepository.paidThroughForEveryone(),
      retentionRepository.countPaymentRecordsReceivedBefore(
        paymentRecordsReleasedBefore(asOf, terms),
      ),
    ]);

    const accounts: RetentionCandidate[] = [];
    for (const account of everyone) {
      const furthest = paidThrough.get(account.id) ?? null;
      const keptUntil = keptUntilFor(account.addedAt, furthest);
      if (keptUntil < asOf) {
        accounts.push({
          id: account.id,
          name: account.name,
          email: account.email,
          paidThrough: furthest,
          keptUntil,
        });
      }
    }

    return { asOf, retention: terms, accounts, paymentRecords };
  }

  /**
   * The last day an Account is kept. Somebody with no term at all never had a Membership to
   * lapse, so for them the period runs from the day they were put on the roster instead.
   */
  function keptUntilFor(addedAt: Date, paidThrough: string | null): string {
    return yearsOn(paidThrough ?? addedAt.toISOString().slice(0, 10), terms.accountYears);
  }

  return {
    terms: () => terms,

    report,

    async sweep() {
      const due = await report();

      // **The payment records first**, which is what keeps the dry run honest: these are the
      // ones that were already nobody's when the report was read. Whatever the Accounts erased
      // below leave behind is the *next* sweep's, reported by the next dry run before it goes.
      const paymentRecords = await retentionRepository.deletePaymentRecordsReceivedBefore(
        paymentRecordsReleasedBefore(due.asOf, terms),
      );

      // One at a time and each in a transaction of its own: a sweep interrupted half way has
      // deleted some of the people it should and none it should not, and the next one finishes.
      const accounts: RetentionCandidate[] = [];
      for (const account of due.accounts) {
        // Asked again with the Account held. A payment recorded since the report was read has
        // moved the date, and somebody who has just renewed is not somebody to delete.
        const erased = await erase(
          account.id,
          (paidThrough) => paidThrough !== null && paidThrough !== account.paidThrough,
        );
        if (erased) {
          accounts.push(account);
        }
      }

      return { ...due, accounts, paymentRecords };
    },

    async erase(accountId, askedBy) {
      /**
       * **Not yourself.** The Administrator pressing this would be signed out by it half way
       * through reading the answer, and a roster whose only Administrator has just erased
       * themselves is one nobody can open. Another Administrator can do it for them.
       */
      if (accountId === askedBy) {
        throw new ConflictError(
          'You cannot erase the Account you are signed in with. ' +
            'Ask another Administrator to do it for you.',
        );
      }

      const erased = await erase(accountId);
      if (!erased) {
        throw new NotFoundError('Nobody on the roster has that id.');
      }
      return erased;
    },
  };
}

/**
 * The same day, a number of years later — **real date arithmetic and not string arithmetic**. A
 * Membership running to 29 February has no anniversary, and `Date.UTC` rolls it to 1 March
 * rather than producing a day that does not exist.
 */
function yearsOn(day: string, years: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year + years, month - 1, date)).toISOString().slice(0, 10);
}

/**
 * The first day whose payment records must still be kept. **Whole calendar years, counted from
 * the end of the year the money arrived in** — which is how an accounting period is reckoned, and
 * errs on the side of keeping a record a few months longer rather than a day too short.
 */
function paymentRecordsReleasedBefore(asOf: string, terms: RetentionTerms): string {
  return `${Number(asOf.slice(0, 4)) - terms.paymentRecordYears}-01-01`;
}
