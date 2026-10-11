import { and, desc, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  accounts,
  memberships,
  paymentEvents,
  subscriptions,
  type MembershipRow,
  type NewMembershipRow,
  type SubscriptionRow,
} from '../db/schema.js';

/**
 * What the archive has been told about members' subscriptions, the payments they produced, and
 * which of the provider's deliveries have already been acted on.
 *
 * Built on a `DbSession`, so the service decides whether that is the pool or the one
 * transaction an event is handled in — which is what lets "seen this delivery before" and
 * "granted the term" be the same commit.
 */
export interface SubscriptionRepository {
  /**
   * Every subscription of theirs that is still running, newest first. Nearly always none or
   * one — but two browser tabs can start two before the provider has told the archive about
   * either, and one nobody can see is one nobody can cancel.
   */
  listLive(accountId: string): Promise<SubscriptionRow[]>;
  find(providerSubscriptionId: string): Promise<SubscriptionRow | null>;
  /**
   * Records a subscription the first time anything names it. Either of two events can be the
   * first to arrive, so both call this; one already recorded only learns when it next collects.
   */
  ensure(subscription: {
    accountId: string;
    providerSubscriptionId: string;
    renewsOn: string | null;
    at: Date;
  }): Promise<void>;
  /**
   * What is now true of one, **as of a moment**. Changes nothing where it was never recorded,
   * and nothing where something more recent has already been written — which is how a delivery
   * that arrives late does not undo the one that overtook it.
   */
  update(
    providerSubscriptionId: string,
    fields: { renews?: boolean; renewsOn?: string | null; endedAt?: Date | null },
    asOf: Date,
  ): Promise<void>;

  /** Marks a delivery as acted on. `false` where it already had been — a redelivery. */
  recordEvent(id: string, kind: string, at: Date): Promise<boolean>;

  /**
   * Holds one Account for the rest of the transaction and answers with its furthest
   * Paid-through, and whether a live Subscription of theirs renews itself — or `undefined` where
   * there is no such Account. Two payments for one person confirmed at the same moment are then
   * counted one after the other, each from where the last one left the date.
   */
  holdAccount(
    accountId: string,
  ): Promise<{ paidThrough: string | null; renewsItself: boolean } | undefined>;
  /** Grants the term a payment bought. `false` where that payment had already bought one. */
  grantPaidTerm(term: NewMembershipRow & { providerPaymentId: string }): Promise<boolean>;
  /** Every payment the Club has received from this person, newest first. */
  listPayments(accountId: string): Promise<MembershipRow[]>;
  /** One of this person's payments, and nobody else's. */
  findPayment(accountId: string, membershipId: string): Promise<MembershipRow | null>;
}

export function createSubscriptionRepository(db: DbSession): SubscriptionRepository {
  return {
    listLive(accountId) {
      return db
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.accountId, accountId), isNull(subscriptions.endedAt)))
        .orderBy(desc(subscriptions.startedAt));
    },

    async find(providerSubscriptionId) {
      const [row] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.providerSubscriptionId, providerSubscriptionId))
        .limit(1);
      return row ?? null;
    },

    async ensure({ accountId, providerSubscriptionId, renewsOn, at }) {
      await db
        .insert(subscriptions)
        .values({ accountId, providerSubscriptionId, renewsOn, startedAt: at, updatedAt: at })
        // Already recorded: the one thing a later mention can add is when it next collects.
        .onConflictDoUpdate({
          target: subscriptions.providerSubscriptionId,
          set: { renewsOn: sql`coalesce(excluded.renews_on, ${subscriptions.renewsOn})` },
        });
    },

    async update(providerSubscriptionId, fields, asOf) {
      await db
        .update(subscriptions)
        .set({ ...fields, stateAsOf: asOf, updatedAt: asOf })
        .where(
          and(
            eq(subscriptions.providerSubscriptionId, providerSubscriptionId),
            or(isNull(subscriptions.stateAsOf), lte(subscriptions.stateAsOf, asOf)),
          ),
        );
    },

    async recordEvent(id, kind, at) {
      const recorded = await db
        .insert(paymentEvents)
        .values({ id, kind, receivedAt: at })
        .onConflictDoNothing({ target: paymentEvents.id })
        .returning({ id: paymentEvents.id });
      return recorded.length === 1;
    },

    async holdAccount(accountId) {
      const [account] = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update')
        .limit(1);
      if (!account) {
        return undefined;
      }

      const [[term], [renewing]] = await Promise.all([
        db
          .select({ furthest: sql<string | null>`max(${memberships.paidThrough})` })
          .from(memberships)
          .where(eq(memberships.accountId, accountId)),
        db
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.accountId, accountId),
              isNull(subscriptions.endedAt),
              eq(subscriptions.renews, true),
            ),
          )
          .limit(1),
      ]);
      return { paidThrough: term?.furthest ?? null, renewsItself: renewing !== undefined };
    },

    async grantPaidTerm(term) {
      const granted = await db
        .insert(memberships)
        .values(term)
        .onConflictDoNothing({ target: memberships.providerPaymentId })
        .returning({ id: memberships.id });
      return granted.length === 1;
    },

    async findPayment(accountId, membershipId) {
      const [row] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), eq(memberships.accountId, accountId)))
        .limit(1);
      return row ?? null;
    },

    listPayments(accountId) {
      return db
        .select()
        .from(memberships)
        .where(and(eq(memberships.accountId, accountId), isNotNull(memberships.amount)))
        .orderBy(desc(memberships.receivedOn), desc(memberships.recordedAt));
    },
  };
}
