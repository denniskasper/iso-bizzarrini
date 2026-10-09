import { and, asc, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  accounts,
  contributionPhotographs,
  contributions,
  photographs,
  type ContributionPhotographRow,
  type ContributionRow,
  type NewContributionPhotographRow,
  type NewContributionRow,
  type PhotographRow,
} from '../db/schema.js';

/**
 * What members have written, **and the one rule about who is shown it.**
 *
 * That rule lives here, in the statement, rather than in a filter applied to rows already read:
 * *published, or still waiting and written by the person asking.* Members contribute on the
 * understanding that nothing of theirs appears unchecked, so the way a waiting Contribution
 * stays unseen is that no query on behalf of anybody else ever returns it — there is no list in
 * memory for a screen, or a later refactor, to forget to filter.
 *
 * **An Editor's reads are the one exception and are named for it** (issue #6): `listWaiting`
 * and the rest of the second half of this interface answer whoever calls them, and what makes
 * that safe is that every address reaching them is an Editor's.
 */

/**
 * Who is asking for a photograph. `decides` is an Editor — who is shown a waiting Contribution's
 * pictures because they cannot judge what they are not shown.
 */
export interface PhotographReader {
  id: string;
  decides: boolean;
}

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
    reader: PhotographReader,
    photographId: string,
  ): Promise<ContributionPhotographRow | null>;

  /** One Contribution whatever its state, **for an Editor**: to say why it cannot be decided. */
  find(id: string): Promise<ContributionRow | null>;

  /** Everything nobody has decided, **oldest first**, for an Editor (story 115). */
  listWaiting(): Promise<ContributionWithAuthor[]>;
  countWaiting(): Promise<number>;

  /**
   * Publishes or discards, **if it is still waiting** — a condition the write carries, so two
   * Editors deciding the same one at the same moment are one decision and one refusal. `null`
   * when it was not there to decide.
   */
  decide(id: string, state: 'published' | 'discarded'): Promise<ContributionRow | null>;

  /**
   * Makes a waiting Contribution about a number be about a Part instead (story 120), **holding
   * the Contribution while that Part is recorded.**
   *
   * `record` is handed the number and answers with the Part it put there. It runs while this
   * holds the Contribution's row, so two Editors pressing at once record one Part and not two:
   * the second waits, and then finds the Contribution is already about a Part. If `record`
   * refuses, nothing here has been written and its refusal is what the caller hears.
   */
  recordPartFor(
    id: string,
    record: (positionId: string) => Promise<string>,
  ): Promise<ContributionRow | 'missing' | 'decided' | 'about-a-part'>;

  /**
   * **Moves** a photograph onto the Part its Contribution is about (story 119): the same id, the
   * same files, a row in the Part's own table at the end of the Part's own order.
   *
   * One transaction holding the Contribution's row, so it cannot be decided — or the picture
   * moved twice — in the middle. Says which it was when it does not happen.
   */
  movePhotographToPart(
    photographId: string,
  ): Promise<PhotographRow | 'missing' | 'decided' | 'about-a-position'>;
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

    async findPhotographReadableBy(reader, photographId) {
      const [row] = await db
        .select({ photograph: contributionPhotographs })
        .from(contributionPhotographs)
        .innerJoin(contributions, eq(contributions.id, contributionPhotographs.contributionId))
        .where(
          and(
            eq(contributionPhotographs.id, photographId),
            // The rule, and one thing more for whoever is checking. Never a discarded one.
            reader.decides
              ? or(readableBy(reader.id), eq(contributions.state, 'waiting'))
              : readableBy(reader.id),
          ),
        )
        .limit(1);
      return row?.photograph ?? null;
    },

    async find(id) {
      const [row] = await db.select().from(contributions).where(eq(contributions.id, id)).limit(1);
      return row ?? null;
    },

    async listWaiting() {
      const rows = await db
        .select({ contribution: contributions, authorName: accounts.name })
        .from(contributions)
        .leftJoin(accounts, eq(accounts.id, contributions.authorId))
        .where(eq(contributions.state, 'waiting'))
        .orderBy(asc(contributions.writtenAt), asc(contributions.id));
      return rows.map((row) => ({ ...row.contribution, authorName: row.authorName }));
    },

    async countWaiting() {
      const [row] = await db
        .select({ count: count() })
        .from(contributions)
        .where(eq(contributions.state, 'waiting'));
      return row?.count ?? 0;
    },

    async decide(id, state) {
      const [decided] = await db
        .update(contributions)
        .set({ state })
        .where(and(eq(contributions.id, id), eq(contributions.state, 'waiting')))
        .returning();
      return decided ?? null;
    },

    async recordPartFor(id, record) {
      return db.transaction(async (tx) => {
        const [contribution] = await tx
          .select()
          .from(contributions)
          .where(eq(contributions.id, id))
          .for('update');
        if (!contribution) {
          return 'missing';
        }
        if (contribution.state !== 'waiting') {
          return 'decided';
        }
        if (contribution.positionId === null) {
          return 'about-a-part';
        }

        const partId = await record(contribution.positionId);

        const [retargeted] = await tx
          .update(contributions)
          .set({ partId, positionId: null })
          .where(eq(contributions.id, id))
          .returning();
        if (!retargeted) {
          throw new Error('A Contribution held for its Part to be recorded was not there.');
        }
        return retargeted;
      });
    },

    async movePhotographToPart(photographId) {
      return db.transaction(async (tx) => {
        const [found] = await tx
          .select({ contributionId: contributionPhotographs.contributionId })
          .from(contributionPhotographs)
          .where(eq(contributionPhotographs.id, photographId));
        if (!found) {
          return 'missing';
        }

        const [contribution] = await tx
          .select({ state: contributions.state, partId: contributions.partId })
          .from(contributions)
          .where(eq(contributions.id, found.contributionId))
          .for('update');
        if (contribution?.state !== 'waiting') {
          return 'decided';
        }
        if (contribution.partId === null) {
          return 'about-a-position';
        }

        // Taken out under the lock: another Editor's press that got here first has left nothing.
        const [moving] = await tx
          .delete(contributionPhotographs)
          .where(eq(contributionPhotographs.id, photographId))
          .returning();
        if (!moving) {
          return 'missing';
        }

        const [last] = await tx
          .select({ sequence: photographs.sequence })
          .from(photographs)
          .where(eq(photographs.partId, contribution.partId))
          .orderBy(desc(photographs.sequence))
          .limit(1);

        const { contributionId: _left, ...picture } = moving;
        const [moved] = await tx
          .insert(photographs)
          .values({
            ...picture,
            partId: contribution.partId,
            sequence: (last?.sequence ?? -1) + 1,
          })
          .returning();
        if (!moved) {
          throw new Error('Moving a photograph onto its Part returned nothing.');
        }
        return moved;
      });
    },
  };
}
