import { and, asc, eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  readingDoubts,
  tableSheets,
  type ReadingDoubtRow,
  type TableSheetRow,
} from '../db/schema.js';

/**
 * **What the read command left on a Tavola** besides its Listings (ADR 0017): the Table sheets it
 * read them from, and what it was unsure of. A Tavola recorded by hand has neither.
 */
export interface ReadingRepository {
  /** In the order the factory printed them. */
  listTableSheets(tavolaId: string): Promise<TableSheetRow[]>;
  findTableSheet(tavolaId: string, sheet: number): Promise<TableSheetRow | null>;
  /** In no particular order: they are read in the order of the rows they concern. */
  listDoubts(tavolaId: string): Promise<ReadingDoubtRow[]>;
  findDoubt(id: string): Promise<ReadingDoubtRow | null>;
  /** `null` when there is no such doubt any longer. */
  rewriteDoubt(id: string, reason: string): Promise<ReadingDoubtRow | null>;
  removeDoubt(id: string): Promise<boolean>;
}

export function createReadingRepository(db: DbSession): ReadingRepository {
  return {
    listTableSheets(tavolaId) {
      return db
        .select()
        .from(tableSheets)
        .where(eq(tableSheets.tavolaId, tavolaId))
        .orderBy(asc(tableSheets.sheet));
    },

    async findTableSheet(tavolaId, sheet) {
      const [row] = await db
        .select()
        .from(tableSheets)
        .where(and(eq(tableSheets.tavolaId, tavolaId), eq(tableSheets.sheet, sheet)))
        .limit(1);
      return row ?? null;
    },

    listDoubts(tavolaId) {
      return db.select().from(readingDoubts).where(eq(readingDoubts.tavolaId, tavolaId));
    },

    async findDoubt(id) {
      const [row] = await db.select().from(readingDoubts).where(eq(readingDoubts.id, id)).limit(1);
      return row ?? null;
    },

    async rewriteDoubt(id, reason) {
      const [row] = await db
        .update(readingDoubts)
        .set({ reason })
        .where(eq(readingDoubts.id, id))
        .returning();
      return row ?? null;
    },

    async removeDoubt(id) {
      const removed = await db
        .delete(readingDoubts)
        .where(eq(readingDoubts.id, id))
        .returning({ id: readingDoubts.id });
      return removed.length > 0;
    },
  };
}
