import { and, asc, count, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  accounts,
  contributionPhotographs,
  contributions,
  type ContributionPhotographRow,
  type ContributionRow,
  type NewContributionPhotographRow,
  type NewContributionRow,
} from '../db/schema.js';

/**
 * What members have written, **and the one rule about who is shown it.**
 *
 * That rule lives here, in the statement, rather than in a filter applied to rows already read:
 * *published, or still waiting and written by the person asking.* Members contribute on the
 * understanding that nothing of theirs appears unchecked, so the way a waiting Contribution
 * stays unseen is that no query on behalf of anybody else ever returns it — there is no list in
 * memory for a screen, or a later refactor, to forget to filter.
 */

/** A Contribution with its byline. `null` where the Account that wrote it is gone (ADR 0007). */
export interface ContributionWithAuthor extends ContributionRow {
  authorName: string | null;
}

/**
 * A photograph as it arrives from ingest: everything but where in the Contribution's order it
 * goes, which this file decides. The id comes with it — the files are written under it first.
 */
export type NewContributionPhotograph = Omit<NewContributionPhotographRow, 'sequence'>;

export interface ContributionRepository {
  add(contribution: NewContributionRow): Promise<ContributionRow>;

  /** One Contribution, if this reader may see it. `null` otherwise, whatever the reason. */
  findReadableBy(readerId: string, id: string): Promise<ContributionWithAuthor | null>;

  /**
   * Everything this reader may see about a number and the Parts listed at it, **oldest first** —
   * the order a conversation was had in, and ties broken on the id so two reads never disagree.
   */
  listReadableBy(
    readerId: string,
    about: { positionId: string; partIds: string[] },
  ): Promise<ContributionWithAuthor[]>;

  /** The photographs of several Contributions at once, each one's in the order attached. */
  listPhotographs(contributionIds: string[]): Promise<ContributionPhotographRow[]>;

  /**
   * Appends to a Contribution that is **still waiting and holds fewer than `atMost`**, and says
   * which of the two it was when it does not.
   *
   * Both are asked inside one transaction holding the Contribution's own row. Two photographs
   * sent at the same moment are counted one after the other rather than against the same total;
   * and a photograph still on its way up when an Editor decides is refused, rather than landing
   * on something that was published without it.
   */
  addPhotograph(
    photograph: NewContributionPhotograph,
    atMost: number,
  ): Promise<ContributionPhotographRow | 'decided' | 'full'>;

  /**
   * One photograph, **if this reader may see the Contribution it belongs to**. The rule about
   * the words is the rule about the picture, asked in the same statement.
   */
  findPhotographReadableBy(
    readerId: string,
    photographId: string,
  ): Promise<ContributionPhotographRow | null>;
}

export function createContributionRepository(db: DbSession): ContributionRepository {
  /** **The rule.** Every read in this file is narrowed by it and none is written without it. */
  function readableBy(readerId: string): SQL | undefined {
    return or(
      eq(contributions.state, 'published'),
      and(eq(contributions.state, 'waiting'), eq(contributions.authorId, readerId)),
    );
  }

  function readable(readerId: string, where: SQL | undefined) {
    return db
      .select({ contribution: contributions, authorName: accounts.name })
      .from(contributions)
      .leftJoin(accounts, eq(accounts.id, contributions.authorId))
      .where(and(where, readableBy(readerId)))
      .orderBy(asc(contributions.writtenAt), asc(contributions.id));
  }

  return {
    async add(contribution) {
      const [added] = await db.insert(contributions).values(contribution).returning();
      if (!added) {
        throw new Error('Inserting a Contribution returned nothing.');
      }
      return added;
    },

    async findReadableBy(readerId, id) {
      const [row] = await readable(readerId, eq(contributions.id, id)).limit(1);
      return row ? { ...row.contribution, authorName: row.authorName } : null;
    },

    async listReadableBy(readerId, about) {
      const rows = await readable(
        readerId,
        or(
          eq(contributions.positionId, about.positionId),
          about.partIds.length > 0 ? inArray(contributions.partId, about.partIds) : undefined,
        ),
      );
      return rows.map((row) => ({ ...row.contribution, authorName: row.authorName }));
    },

    listPhotographs(contributionIds) {
      if (contributionIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .select()
        .from(contributionPhotographs)
        .where(inArray(contributionPhotographs.contributionId, contributionIds))
        .orderBy(asc(contributionPhotographs.sequence), asc(contributionPhotographs.id));
    },

    async addPhotograph(photograph, atMost) {
      return db.transaction(async (tx) => {
        const [contribution] = await tx
          .select({ state: contributions.state })
          .from(contributions)
          .where(eq(contributions.id, photograph.contributionId))
          .for('update');
        if (contribution?.state !== 'waiting') {
          return 'decided';
        }

        const [held] = await tx
          .select({ count: count() })
          .from(contributionPhotographs)
          .where(eq(contributionPhotographs.contributionId, photograph.contributionId));
        const sequence = held?.count ?? 0;
        if (sequence >= atMost) {
          return 'full';
        }

        // Nothing removes one of these, so the count is also the next place in the order.
        const [added] = await tx
          .insert(contributionPhotographs)
          .values({ ...photograph, sequence })
          .returning();
        if (!added) {
          throw new Error('Inserting a Contribution’s photograph returned nothing.');
        }
        return added;
      });
    },

    async findPhotographReadableBy(readerId, photographId) {
      const [row] = await db
        .select({ photograph: contributionPhotographs })
        .from(contributionPhotographs)
        .innerJoin(contributions, eq(contributions.id, contributionPhotographs.contributionId))
        .where(and(eq(contributionPhotographs.id, photographId), readableBy(readerId)))
        .limit(1);
      return row?.photograph ?? null;
    },
  };
}
