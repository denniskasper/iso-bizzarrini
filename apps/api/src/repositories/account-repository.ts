import type { TokenPurpose } from '@ricambi/contracts';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  accounts,
  accountTokens,
  memberships,
  type AccountRow,
  type AccountTokenRow,
  type MembershipRow,
  type NewAccountRow,
  type NewAccountTokenRow,
  type NewMembershipRow,
} from '../db/schema.js';

/**
 * People, the terms they have paid for, and the links that let them set a password. One
 * repository because they are one thing — an Account with nothing hanging off it is a row nobody
 * can use — and because every question the roster screen asks spans at least two of them.
 */
export interface AccountRepository {
  findById(id: string): Promise<AccountRow | null>;
  /** By e-mail, normalised. The only lookup sign-in has. */
  findByEmail(email: string): Promise<AccountRow | null>;
  add(account: NewAccountRow): Promise<AccountRow>;
  /** Corrects a name or a role. Never a password — that goes through `setPassword`. */
  correct(id: string, fields: Partial<Pick<AccountRow, 'name' | 'role'>>): Promise<AccountRow>;
  /**
   * The member choosing their own password. Bumps the session epoch with it, so every session
   * issued under the old number is dead — which is the point of resetting one.
   */
  setPassword(id: string, hash: string, at: Date): Promise<AccountRow>;

  /** Everyone, in the order a roster is read: by name. */
  listAll(): Promise<AccountRow[]>;

  /** The furthest Paid-through across every term, or null where none was ever recorded. */
  paidThrough(accountId: string): Promise<string | null>;
  /** The same question for the whole roster at once, so one screen is one query rather than N. */
  paidThroughForEveryone(): Promise<Map<string, string>>;
  listMemberships(accountId: string): Promise<MembershipRow[]>;
  grantMembership(membership: NewMembershipRow): Promise<MembershipRow>;

  /**
   * Issues a link, and **cancels whatever was outstanding for the same purpose**. Re-sending an
   * invitation (story 5) must not leave two live keys to one account lying in two inboxes.
   */
  issueToken(token: NewAccountTokenRow): Promise<AccountTokenRow>;
  findLiveToken(tokenHash: string, now: Date): Promise<AccountTokenRow | null>;
  /** Single use, and the update is the check: a second redemption changes no rows. */
  redeemToken(id: string, at: Date): Promise<boolean>;
  /** The outstanding invitation, for the roster screen to report. */
  findOutstandingToken(accountId: string, purpose: TokenPurpose): Promise<AccountTokenRow | null>;
  outstandingInvitations(now: Date): Promise<Map<string, AccountTokenRow>>;
}

export function createAccountRepository(db: DbSession): AccountRepository {
  async function readBack(id: string): Promise<AccountRow> {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    if (!row) {
      throw new Error('Reading an Account back returned nothing.');
    }
    return row;
  }

  return {
    async findById(id) {
      const [row] = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
      return row ?? null;
    },

    async findByEmail(email) {
      const [row] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
      return row ?? null;
    },

    async add(account) {
      const [row] = await db.insert(accounts).values(account).returning();
      if (!row) {
        throw new Error('Inserting an Account returned nothing.');
      }
      return row;
    },

    async correct(id, fields) {
      if (Object.keys(fields).length === 0) {
        return readBack(id);
      }
      const [row] = await db.update(accounts).set(fields).where(eq(accounts.id, id)).returning();
      if (!row) {
        throw new Error('Correcting an Account returned nothing.');
      }
      return row;
    },

    async setPassword(id, hash, at) {
      const [row] = await db
        .update(accounts)
        .set({
          passwordHash: hash,
          passwordSetAt: at,
          sessionEpoch: sql`${accounts.sessionEpoch} + 1`,
        })
        .where(eq(accounts.id, id))
        .returning();
      if (!row) {
        throw new Error('Setting a password returned nothing.');
      }
      return row;
    },

    listAll() {
      return db.select().from(accounts).orderBy(asc(accounts.name), asc(accounts.email));
    },

    async paidThrough(accountId) {
      const [row] = await db
        .select({ furthest: sql<string | null>`max(${memberships.paidThrough})` })
        .from(memberships)
        .where(eq(memberships.accountId, accountId));
      return row?.furthest ?? null;
    },

    async paidThroughForEveryone() {
      const rows = await db
        .select({
          accountId: memberships.accountId,
          furthest: sql<string>`max(${memberships.paidThrough})`,
        })
        .from(memberships)
        .where(isNotNull(memberships.accountId))
        .groupBy(memberships.accountId);

      // A payment record whose Account is gone (ADR 0007) is nobody's Paid-through.
      return new Map(rows.flatMap((row) => (row.accountId ? [[row.accountId, row.furthest]] : [])));
    },

    listMemberships(accountId) {
      return db
        .select()
        .from(memberships)
        .where(eq(memberships.accountId, accountId))
        .orderBy(desc(memberships.paidThrough), desc(memberships.recordedAt));
    },

    async grantMembership(membership) {
      const [row] = await db.insert(memberships).values(membership).returning();
      if (!row) {
        throw new Error('Granting a Membership returned nothing.');
      }
      return row;
    },

    async issueToken(token) {
      // The cancellation and the issue are one statement each, in that order: a link that has
      // been superseded must stop working even if the insert below then fails.
      await db
        .update(accountTokens)
        .set({ usedAt: token.issuedAt })
        .where(
          and(
            eq(accountTokens.accountId, token.accountId),
            eq(accountTokens.purpose, token.purpose),
            isNull(accountTokens.usedAt),
          ),
        );

      const [row] = await db.insert(accountTokens).values(token).returning();
      if (!row) {
        throw new Error('Issuing a token returned nothing.');
      }
      return row;
    },

    async findLiveToken(tokenHash, now) {
      const [row] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.tokenHash, tokenHash),
            isNull(accountTokens.usedAt),
            sql`${accountTokens.expiresAt} > ${now}`,
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async redeemToken(id, at) {
      // `usedAt is null` in the `where` is what makes this single-use under a double submit:
      // two requests race, one updates a row and the other updates none.
      const redeemed = await db
        .update(accountTokens)
        .set({ usedAt: at })
        .where(and(eq(accountTokens.id, id), isNull(accountTokens.usedAt)))
        .returning({ id: accountTokens.id });

      return redeemed.length === 1;
    },

    async findOutstandingToken(accountId, purpose) {
      const [row] = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.accountId, accountId),
            eq(accountTokens.purpose, purpose),
            isNull(accountTokens.usedAt),
          ),
        )
        .orderBy(desc(accountTokens.issuedAt))
        .limit(1);
      return row ?? null;
    },

    async outstandingInvitations(now) {
      const rows = await db
        .select()
        .from(accountTokens)
        .where(
          and(
            eq(accountTokens.purpose, 'invitation'),
            isNull(accountTokens.usedAt),
            sql`${accountTokens.expiresAt} > ${now}`,
          ),
        )
        .orderBy(desc(accountTokens.issuedAt));

      const newest = new Map<string, AccountTokenRow>();
      for (const row of rows) {
        if (!newest.has(row.accountId)) {
          newest.set(row.accountId, row);
        }
      }
      return newest;
    },
  };
}
