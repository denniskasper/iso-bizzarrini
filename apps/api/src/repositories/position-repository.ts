import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  marks,
  positions,
  relatedPositions,
  subAssemblies,
  type MarkRow,
  type NewMarkRow,
  type NewPositionRow,
  type PositionRow,
  type RelatedPositionRow,
  type SubAssemblyRow,
} from '../db/schema.js';

/**
 * Positions and their Marks, which are one thing to read and one thing to write.
 *
 * A Mark alone means nothing — it is a circle on a drawing, and what a member clicks it for is
 * the Position underneath. So nothing here returns a bare Mark: every write answers with the
 * Position entire, which is also what makes a screen's job a replacement rather than a merge.
 *
 * The same file carries what belongs *with* a number — the Sub-assembly it sits in and the
 * numbers it has been linked to — because both are read with the sheet and neither is navigable
 * on its own.
 */
export interface PositionWithMarks extends PositionRow {
  marks: MarkRow[];
}

export interface PositionRepository {
  listByTavola(tavolaId: string): Promise<PositionWithMarks[]>;
  findById(id: string): Promise<PositionWithMarks | null>;
  /** The Position that number names on that sheet, recording it if the archive has none. */
  findOrAdd(row: NewPositionRow): Promise<{ position: PositionRow; added: boolean }>;
  remove(id: string): Promise<boolean>;
  addMark(row: NewMarkRow): Promise<MarkRow>;
  /** Both answer with the Mark as it was, so the caller knows which Position to read back. */
  moveMark(markId: string, at: { x: number; y: number }): Promise<MarkRow | null>;
  removeMark(markId: string): Promise<MarkRow | null>;

  /** The sheet's Sub-assemblies, by name. Ordered here, so no screen orders a catalog. */
  listSubAssemblies(tavolaId: string): Promise<SubAssemblyRow[]>;
  /**
   * Putting numbers into the Sub-assembly that name means on that sheet, **in one write**.
   *
   * Finding or recording the name, moving the numbers into it, and sweeping whatever was left
   * empty are one transaction because two of the three states between them are ones the archive
   * says cannot exist: a Sub-assembly with nothing in it, and a number that left one without
   * arriving in another.
   *
   * A number already in another Sub-assembly is **moved**. Membership is a column, so joining
   * one is leaving the other, and an Editor naming this number here means it.
   */
  putInSubAssembly(tavolaId: string, name: string, positionIds: string[]): Promise<void>;
  takeOutOfSubAssembly(positionId: string): Promise<PositionRow | null>;
  removeSubAssembly(id: string): Promise<SubAssemblyRow | null>;
  /**
   * **A Sub-assembly with nothing in it is not one.** Run after every membership change, so a
   * name left pointing at no numbers never survives the write that emptied it.
   */
  removeEmptySubAssemblies(tavolaId: string): Promise<void>;

  /** Every link on the sheet, both ends of each, in no particular order. */
  listRelatedOnTavola(tavolaId: string): Promise<RelatedPositionRow[]>;
  /** One row for the pair, whichever way round it arrived. */
  relate(positionId: string, otherPositionId: string): Promise<RelatedPositionRow>;
  removeRelated(id: string): Promise<RelatedPositionRow | null>;
}

export function createPositionRepository(db: DbSession): PositionRepository {
  // The catalog prints 1, 2, 10; sorting the strings would print 1, 10, 2. Nulls last, because
  // a Position numbered with no leading digit at all is the exception and belongs at the end.
  const byNumber = [sql`${positions.numberSort} asc nulls last`, asc(positions.number)];

  /**
   * Reading order down the sheet, which is the order somebody looking at the drawing would come
   * across the same number printed four times — and therefore the order a member cycling
   * through them expects. It needs no column of its own: moving a Mark moves its place in the
   * order too, which is the right answer rather than a compromise.
   */
  const byReadingOrder = [asc(marks.y), asc(marks.x), asc(marks.id)];

  return {
    listByTavola(tavolaId) {
      return db.query.positions.findMany({
        where: eq(positions.tavolaId, tavolaId),
        with: { marks: { orderBy: byReadingOrder } },
        orderBy: byNumber,
      });
    },

    async findById(id) {
      const row = await db.query.positions.findFirst({
        where: eq(positions.id, id),
        with: { marks: { orderBy: byReadingOrder } },
      });
      return row ?? null;
    },

    async findOrAdd(row) {
      // The insert is the lookup, so two Editors clicking the same number at the same moment
      // cannot both pass a check and both write. The unique constraint on the pair is what
      // decides, rather than whoever read first.
      const [inserted] = await db
        .insert(positions)
        .values(row)
        .onConflictDoNothing({ target: [positions.tavolaId, positions.number] })
        .returning();

      if (inserted) {
        return { position: inserted, added: true };
      }

      const existing = await db.query.positions.findFirst({
        where: (table, { and: both, eq: is }) =>
          both(is(table.tavolaId, row.tavolaId), is(table.number, row.number)),
      });

      if (!existing) {
        throw new Error(`Position "${row.number}" was neither inserted nor found.`);
      }
      return { position: existing, added: false };
    },

    async remove(id) {
      const removed = await db.delete(positions).where(eq(positions.id, id)).returning();
      return removed.length > 0;
    },

    async addMark(row) {
      const [mark] = await db.insert(marks).values(row).returning();
      if (!mark) {
        throw new Error('Inserting a Mark returned nothing.');
      }
      return mark;
    },

    async moveMark(markId, at) {
      const [moved] = await db
        .update(marks)
        .set({ x: at.x, y: at.y })
        .where(eq(marks.id, markId))
        .returning();
      return moved ?? null;
    },

    async removeMark(markId) {
      const [removed] = await db.delete(marks).where(eq(marks.id, markId)).returning();
      return removed ?? null;
    },

    listSubAssemblies(tavolaId) {
      // By name, because a Sub-assembly has no number and nothing orders it — that is the whole
      // of "it is not a bill of materials", and the alternative would be inventing a rank the
      // archive has no opinion about.
      return db
        .select()
        .from(subAssemblies)
        .where(eq(subAssemblies.tavolaId, tavolaId))
        .orderBy(asc(subAssemblies.name));
    },

    async putInSubAssembly(tavolaId, name, positionIds) {
      if (positionIds.length === 0) {
        return;
      }

      await db.transaction(async (write) => {
        // The insert is the lookup: a sheet has one *Door Lock*, and the unique constraint on the
        // pair is what decides that rather than whoever read first.
        const [inserted] = await write
          .insert(subAssemblies)
          .values({ tavolaId, name })
          .onConflictDoNothing({ target: [subAssemblies.tavolaId, subAssemblies.name] })
          .returning();

        const found =
          inserted ??
          (
            await write
              .select()
              .from(subAssemblies)
              .where(and(eq(subAssemblies.tavolaId, tavolaId), eq(subAssemblies.name, name)))
              .limit(1)
          )[0];

        if (!found) {
          throw new Error(`The Sub-assembly "${name}" was neither inserted nor found.`);
        }

        // One column, so joining one Sub-assembly is leaving whichever one the number was in.
        // That is the "at most one" rule enforced by the shape of the table rather than here.
        await write
          .update(positions)
          .set({ subAssemblyId: found.id })
          .where(inArray(positions.id, positionIds));

        await emptyOnesGo(write, tavolaId);
      });
    },

    async takeOutOfSubAssembly(positionId) {
      return db.transaction(async (write) => {
        const [updated] = await write
          .update(positions)
          .set({ subAssemblyId: null })
          .where(eq(positions.id, positionId))
          .returning();

        if (updated) {
          await emptyOnesGo(write, updated.tavolaId);
        }
        return updated ?? null;
      });
    },

    async removeSubAssembly(id) {
      // The Positions stay: `sub_assembly_id` is set null rather than cascading, because
      // dissolving one is not deleting the numbers that were in it.
      const [removed] = await db.delete(subAssemblies).where(eq(subAssemblies.id, id)).returning();
      return removed ?? null;
    },

    async removeEmptySubAssemblies(tavolaId) {
      await emptyOnesGo(db, tavolaId);
    },

    listRelatedOnTavola(tavolaId) {
      // Scoped through either end, which is the same thing: a link is between two numbers on one
      // sheet, so a row whose first end is on this Tavola has its second end here too.
      return db
        .select({
          id: relatedPositions.id,
          positionId: relatedPositions.positionId,
          relatedPositionId: relatedPositions.relatedPositionId,
        })
        .from(relatedPositions)
        .innerJoin(positions, eq(positions.id, relatedPositions.positionId))
        .where(eq(positions.tavolaId, tavolaId));
    },

    async relate(positionId, otherPositionId) {
      /*
       * **One link is one row, in ascending order** — which the check constraint insists on, and
       * which is why recording it from either end records it once. The order the two ids arrived
       * in is the Editor's typing and nothing about the two parts.
       *
       * **Postgres decides which is the lesser, not this process.** A `uuid` is a value with its
       * own ordering and not the text somebody typed, so `B1…` sorts below `a2…` there and above
       * it in JavaScript. Ordering them here and having the constraint disagree would refuse a
       * perfectly ordinary link — and only for a client that happened to send its hex in capitals.
       */
      const [added] = await db
        .insert(relatedPositions)
        .values({
          positionId: sql`least(${positionId}::uuid, ${otherPositionId}::uuid)`,
          relatedPositionId: sql`greatest(${positionId}::uuid, ${otherPositionId}::uuid)`,
        })
        .returning();

      if (!added) {
        throw new Error('Inserting a Related Position returned nothing.');
      }
      return added;
    },

    async removeRelated(id) {
      const [removed] = await db
        .delete(relatedPositions)
        .where(eq(relatedPositions.id, id))
        .returning();
      return removed ?? null;
    },
  };
}

/**
 * **A Sub-assembly with nothing in it is not one**, swept in whatever session emptied it — so the
 * two writes that can empty one do it inside their own transaction and never leave a name
 * pointing at no numbers, even for the length of a failed request.
 *
 * `not exists` rather than "not in the ids that are held": membership is a nullable column, and
 * `not in` over a set containing a NULL is a set nothing is ever outside of. This asks the
 * question the other way round and cannot be got wrong.
 */
function emptyOnesGo(session: DbSession, tavolaId: string): Promise<unknown> {
  return session
    .delete(subAssemblies)
    .where(
      and(
        eq(subAssemblies.tavolaId, tavolaId),
        sql`not exists (select 1 from ${positions} where ${positions.subAssemblyId} = ${subAssemblies.id})`,
      ),
    );
}
