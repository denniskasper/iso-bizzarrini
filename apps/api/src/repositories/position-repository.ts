import { asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  marks,
  positions,
  type MarkRow,
  type NewMarkRow,
  type NewPositionRow,
  type PositionRow,
} from '../db/schema.js';

/**
 * Positions and their Marks, which are one thing to read and one thing to write.
 *
 * A Mark alone means nothing — it is a circle on a drawing, and what a member clicks it for is
 * the Position underneath. So nothing here returns a bare Mark: every write answers with the
 * Position entire, which is also what makes a screen's job a replacement rather than a merge.
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
}

export function createPositionRepository(db: Db): PositionRepository {
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
        where: (table, { and, eq: is }) =>
          and(is(table.tavolaId, row.tavolaId), is(table.number, row.number)),
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
  };
}
