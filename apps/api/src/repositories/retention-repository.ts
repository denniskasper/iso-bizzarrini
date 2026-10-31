import type { Erasure } from '@ricambi/contracts';
import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  accounts,
  contributionPhotographs,
  contributions,
  memberships,
  proposals,
  proposalScreenshots,
  signInFailures,
} from '../db/schema.js';

/**
 * Letting go of a person, **in one transaction** (ADR 0007).
 *
 * Everything else here reaches the database through a repository per table. This does not,
 * because erasing somebody is one act across five of them, and half of it carried out is the
 * worst outcome available: a person still on the roster whose payments no longer name them, or a
 * person gone whose unpublished words are still waiting in an Editor's queue.
 */
export interface ErasedAccount extends Erasure {
  /** Photographs that went with the Contributions removed. Their files are the caller's to clear. */
  removedPhotographIds: string[];
  /** Screenshots that went with the Drafts removed. Their files are the caller's to clear too. */
  removedScreenshotIds: string[];
}

export interface RetentionRepository {
  /**
   * Deletes one Account and everything that identifies its owner. `null` where there was nobody
   * by that id, which is also what a second erasure of the same person finds.
   *
   * `unless` is asked **inside the transaction, holding the Account**, and handed the furthest
   * Paid-through as it stands at that moment. It is how the sweep changes its mind: a payment
   * recorded between reading who is due and deleting them is seen here, and the person is kept.
   */
  erase(
    accountId: string,
    unless?: (paidThrough: string | null) => boolean,
  ): Promise<ErasedAccount | null>;

  /** Payment records of people already erased, received before this day. */
  countPaymentRecordsReceivedBefore(day: string): Promise<number>;
  deletePaymentRecordsReceivedBefore(day: string): Promise<number>;
}

export function createRetentionRepository(db: Db): RetentionRepository {
  /**
   * The day a payment record is dated: when the money arrived, as read off the statement, and
   * where nobody wrote that down, the day it was recorded.
   */
  const receivedOn = sql`coalesce(${memberships.receivedOn}, (${memberships.recordedAt} at time zone 'UTC')::date)`;

  const releasedBefore = (day: string) =>
    and(isNull(memberships.accountId), sql`${receivedOn} < ${day}::date`);

  return {
    erase(accountId, unless) {
      return db.transaction(async (tx) => {
        // Held for the length of the transaction. Recording a payment takes a share of this
        // row through its foreign key, so one arriving at the same moment waits — and is then
        // refused, rather than landing on nobody.
        const [account] = await tx
          .select({ name: accounts.name, email: accounts.email })
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for('update')
          .limit(1);
        if (!account) {
          return null;
        }

        if (unless) {
          const [term] = await tx
            .select({ furthest: sql<string | null>`max(${memberships.paidThrough})` })
            .from(memberships)
            .where(eq(memberships.accountId, accountId));
          if (unless(term?.furthest ?? null)) {
            return null;
          }
        }

        // **The money outlives the person on it.** A term somebody paid for is a payment record
        // and is kept for the statutory accounting period; it takes the payer's name with it,
        // because the foreign key is about to let go and an unattributed payment is no record.
        const paymentRecords = await tx
          .update(memberships)
          .set({ payerName: account.name })
          .where(and(eq(memberships.accountId, accountId), isNotNull(memberships.amount)))
          .returning({ id: memberships.id });

        // A term nobody paid for — an opening entry, a line of the annual list — records no
        // money, so there is nothing statutory about it and it goes with the person.
        await tx
          .delete(memberships)
          .where(and(eq(memberships.accountId, accountId), isNull(memberships.amount)));

        // **Published Contributions remain**, and only those: what nobody had published was
        // never the archive's, so it is the member's own and goes with them. Held first, so an
        // Editor publishing one at this moment is decided one way or the other and not both.
        const unpublished = await tx
          .select({ id: contributions.id })
          .from(contributions)
          .where(and(eq(contributions.authorId, accountId), ne(contributions.state, 'published')))
          .for('update');
        const unpublishedIds = unpublished.map((row) => row.id);

        let removedPhotographIds: string[] = [];
        if (unpublishedIds.length > 0) {
          const pictures = await tx
            .select({ id: contributionPhotographs.id })
            .from(contributionPhotographs)
            .where(inArray(contributionPhotographs.contributionId, unpublishedIds));
          removedPhotographIds = pictures.map((row) => row.id);

          await tx.delete(contributions).where(inArray(contributions.id, unpublishedIds));
        }

        const contributionsKept = await tx.$count(
          contributions,
          eq(contributions.authorId, accountId),
        );

        // **A Draft is its author's alone**, so it goes with them; what they handed over stays,
        // as a published Contribution does, and its key to them lets go (issue #157).
        const shownOnDrafts = await tx
          .select({ id: proposalScreenshots.id })
          .from(proposalScreenshots)
          .innerJoin(proposals, eq(proposals.id, proposalScreenshots.proposalId))
          .where(and(eq(proposals.authorId, accountId), eq(proposals.status, 'draft')));
        await tx
          .delete(proposals)
          .where(and(eq(proposals.authorId, accountId), eq(proposals.status, 'draft')));
        const removedScreenshotIds = shownOnDrafts.map((row) => row.id);

        // Kept against the address rather than the Account, so the Account going does not take
        // it: the last place the e-mail address would otherwise still be written down.
        await tx.delete(signInFailures).where(eq(signInFailures.email, account.email));

        // The rest is the schema's: tokens cascade, and every reference to this person from a
        // Contribution or somebody else's payment record goes to null.
        await tx.delete(accounts).where(eq(accounts.id, accountId));

        return {
          contributionsKept,
          contributionsRemoved: unpublishedIds.length,
          paymentRecordsKept: paymentRecords.length,
          removedPhotographIds,
          removedScreenshotIds,
        };
      });
    },

    countPaymentRecordsReceivedBefore(day) {
      return db.$count(memberships, releasedBefore(day));
    },

    async deletePaymentRecordsReceivedBefore(day) {
      const deleted = await db
        .delete(memberships)
        .where(releasedBefore(day))
        .returning({ id: memberships.id });
      return deleted.length;
    },
  };
}
