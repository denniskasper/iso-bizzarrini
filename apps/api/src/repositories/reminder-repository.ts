import { and, eq, isNull, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { accounts, club, memberships, SOLE_CLUB_ROW, subscriptions } from '../db/schema.js';

/**
 * What the reminder run reads and the two things it writes: that a term has had its reminder,
 * and that the treasurer has had a digest.
 */

/** One person and the term their Membership currently runs to. */
export interface FurthestTerm {
  membershipId: string;
  accountId: string;
  name: string;
  email: string;
  paidThrough: string;
  /** The day the term began to count: when the money arrived, or when it was recorded. */
  startedOn: string;
  reminderSentAt: Date | null;
}

export interface ReminderRepository {
  /** Everybody's furthest term, one row each, in the order a roster is read. */
  furthestTerms(): Promise<FurthestTerm[]>;
  /** Whose Subscription will collect the fee without being asked. */
  accountsThatRenewThemselves(): Promise<Set<string>>;
  /**
   * Marks a term as reminded, **if it has not been**. The update is the check: two runs at the
   * same moment mark it once, and the one that did not is told so and sends nothing.
   */
  claim(membershipId: string, at: Date): Promise<boolean>;
  /** Unmarks one whose letter then could not be sent, so the next run tries again. */
  release(membershipId: string): Promise<void>;

  digestLastSentAt(): Promise<Date | null>;
  /**
   * Takes this week's digest, **if nobody else has since `previous` was read**. The same idea
   * as `claim`: a run by hand overlapping the nightly one sends one digest and not two.
   */
  claimDigest(previous: Date | null, at: Date): Promise<boolean>;
  /** Puts the mark back where it was, for a digest that then could not be sent. */
  releaseDigest(previous: Date | null): Promise<void>;
}

export function createReminderRepository(db: DbSession): ReminderRepository {
  return {
    async furthestTerms() {
      const rows = await db
        .selectDistinctOn([memberships.accountId], {
          membershipId: memberships.id,
          accountId: accounts.id,
          name: accounts.name,
          email: accounts.email,
          paidThrough: memberships.paidThrough,
          startedOn: sql<string>`coalesce(${memberships.receivedOn}, (${memberships.recordedAt} at time zone 'UTC')::date)::text`,
          reminderSentAt: memberships.reminderSentAt,
        })
        .from(memberships)
        .innerJoin(accounts, eq(accounts.id, memberships.accountId))
        .orderBy(
          memberships.accountId,
          sql`${memberships.paidThrough} desc`,
          sql`${memberships.recordedAt} desc`,
        );

      return rows.sort(
        (one, other) => one.name.localeCompare(other.name) || one.email.localeCompare(other.email),
      );
    },

    async accountsThatRenewThemselves() {
      const rows = await db
        .select({ accountId: subscriptions.accountId })
        .from(subscriptions)
        .where(and(isNull(subscriptions.endedAt), eq(subscriptions.renews, true)));
      return new Set(rows.map((row) => row.accountId));
    },

    async claim(membershipId, at) {
      const claimed = await db
        .update(memberships)
        .set({ reminderSentAt: at })
        .where(and(eq(memberships.id, membershipId), isNull(memberships.reminderSentAt)))
        .returning({ id: memberships.id });
      return claimed.length === 1;
    },

    async release(membershipId) {
      await db
        .update(memberships)
        .set({ reminderSentAt: null })
        .where(eq(memberships.id, membershipId));
    },

    async digestLastSentAt() {
      const [row] = await db
        .select({ at: club.treasurerDigestSentAt })
        .from(club)
        .where(eq(club.id, SOLE_CLUB_ROW))
        .limit(1);
      return row?.at ?? null;
    },

    async claimDigest(previous, at) {
      const claimed = await db
        .update(club)
        .set({ treasurerDigestSentAt: at })
        .where(
          and(
            eq(club.id, SOLE_CLUB_ROW),
            previous === null
              ? isNull(club.treasurerDigestSentAt)
              : eq(club.treasurerDigestSentAt, previous),
          ),
        )
        .returning({ id: club.id });
      return claimed.length === 1;
    },

    async releaseDigest(previous) {
      await db
        .update(club)
        .set({ treasurerDigestSentAt: previous })
        .where(eq(club.id, SOLE_CLUB_ROW));
    },
  };
}
