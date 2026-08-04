import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { photographs, type NewPhotographRow, type PhotographRow } from '../db/schema.js';

/**
 * The pictures of a Part, **in the order somebody decided on**.
 *
 * That order is the only thing here that is not obvious, and it is the reason this is a table
 * with a `sequence` rather than a list read back in whatever order Postgres felt like. The first
 * photograph is the one a member sees without scrolling — the one that answers "is this the thing
 * in my hand" — so which picture it is has to be an Editor's judgement about which is the clearest
 * one, not an accident of which was uploaded first.
 *
 * Reads take a **set** of Part ids, for the same reason every other collection on a Part does: a
 * Position carrying two alternatives and three fixings is five Parts, and five round trips to
 * answer one click is how a screen becomes slow without anybody deciding to make it slow.
 */

/**
 * A Photograph as it arrives from ingest: everything but where in the Part's order it goes, which
 * is the one field this file decides. The id comes with it — the files are written under it
 * before the row exists.
 */
export type NewPhotograph = Omit<NewPhotographRow, 'sequence'>;

export interface PhotographRepository {
  listForParts(partIds: string[]): Promise<PhotographRow[]>;
  findById(id: string): Promise<PhotographRow | null>;

  /** Appends. A photograph nobody has placed goes at the end, where the newest thing belongs. */
  add(photograph: NewPhotograph): Promise<PhotographRow>;

  /**
   * Rewrites one Part's order, or refuses.
   *
   * **All of them or none of them**, which is what `null` reports: a request naming a subset, a
   * duplicate, or a photograph belonging to another Part is a browser working from a list that has
   * moved on, and applying the half of it that made sense would leave an order nobody chose.
   */
  reorder(partId: string, photographIds: string[]): Promise<PhotographRow[] | null>;

  /** The row as it was on the way out, so its files can be dropped and its Part re-read. */
  remove(id: string): Promise<PhotographRow | null>;
}

export function createPhotographRepository(db: DbSession): PhotographRepository {
  /** Ties break on the id, so the order is total and two reads never disagree. */
  const inOrder = [asc(photographs.sequence), asc(photographs.id)];

  return {
    listForParts(partIds) {
      if (partIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .select()
        .from(photographs)
        .where(inArray(photographs.partId, partIds))
        .orderBy(...inOrder);
    },

    async findById(id) {
      const [row] = await db.select().from(photographs).where(eq(photographs.id, id)).limit(1);
      return row ?? null;
    },

    async add(photograph) {
      return db.transaction(async (tx) => {
        const [last] = await tx
          .select({ sequence: photographs.sequence })
          .from(photographs)
          .where(eq(photographs.partId, photograph.partId))
          .orderBy(desc(photographs.sequence))
          .limit(1);

        const [added] = await tx
          .insert(photographs)
          .values({ ...photograph, sequence: (last?.sequence ?? -1) + 1 })
          .returning();
        if (!added) {
          throw new Error('Inserting a Photograph returned nothing.');
        }
        return added;
      });
    },

    async reorder(partId, photographIds) {
      return db.transaction(async (tx) => {
        const held = await tx
          .select({ id: photographs.id })
          .from(photographs)
          .where(eq(photographs.partId, partId));

        /**
         * Compared as sets: the ids asked for have to be exactly the ids held, each once.
         *
         * That is a check against a **stale** list, and it is worth being precise about what it
         * does not cover. Two Editors reordering at once are serialised by the row locks below,
         * so the second reads what the first wrote and the loser's request is refused or applied
         * whole. An Editor *adding* a photograph at the same moment is the gap: `add` takes the
         * end of the sequence without locking, so under read-committed it can land beside the
         * rewritten order rather than after it. The list stays total — ties break on the id — and
         * the next reorder settles it, which for one club's Editors is the right amount of
         * machinery for the problem.
         */
        const asked = new Set(photographIds);
        if (asked.size !== photographIds.length || asked.size !== held.length) {
          return null;
        }
        if (held.some((row) => !asked.has(row.id))) {
          return null;
        }

        for (const [sequence, id] of photographIds.entries()) {
          await tx.update(photographs).set({ sequence }).where(eq(photographs.id, id));
        }

        return tx
          .select()
          .from(photographs)
          .where(eq(photographs.partId, partId))
          .orderBy(...inOrder);
      });
    },

    async remove(id) {
      // The gap the removal leaves in the sequence is left there. Order is what the column is
      // for and a gap does not disturb it; renumbering would be a write to every remaining row
      // to tidy something nobody can see.
      const [removed] = await db.delete(photographs).where(eq(photographs.id, id)).returning();
      return removed ?? null;
    },
  };
}
