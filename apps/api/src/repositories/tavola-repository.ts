import { asc, eq, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  tavole,
  type CategoryRow,
  type ModelRow,
  type NewTavolaRow,
  type ScanRow,
  type TavolaRow,
} from '../db/schema.js';

/**
 * A Tavola never travels alone: it is meaningless without its Category, and a screen showing
 * one always wants to know whether there is a scan behind it. Reading them separately would be
 * three round trips and three chances to forget one, so the repository returns them together.
 */
export interface TavolaWithCategoryAndScan extends TavolaRow {
  category: CategoryRow;
  scan: ScanRow | null;
}

export interface TavolaInContext extends TavolaWithCategoryAndScan {
  model: ModelRow;
}

export interface TavolaRepository {
  listByModel(modelId: string): Promise<TavolaWithCategoryAndScan[]>;
  findById(id: string): Promise<TavolaInContext | null>;
  /**
   * Whether there is such a sheet, and nothing more. Placing a Mark is the one request an
   * Editor makes hundreds of times an evening, and it has no use for a Tavola's Category, its
   * Model or its scan — only for the difference between a real sheet and a made-up id.
   */
  exists(id: string): Promise<boolean>;
  add(tavola: NewTavolaRow): Promise<TavolaRow>;
}

export function createTavolaRepository(db: DbSession): TavolaRepository {
  // The catalog prints 2, 10 and 12 in that order; sorting the strings would print 10, 12, 2.
  // Nulls last, because a Tavola numbered "bis" is the exception and belongs at the end.
  const byNumber = [sql`${tavole.numberSort} asc nulls last`, asc(tavole.number)];

  return {
    listByModel(modelId) {
      return db.query.tavole.findMany({
        where: eq(tavole.modelId, modelId),
        with: { category: true, scan: true },
        orderBy: byNumber,
      });
    },

    async findById(id) {
      const row = await db.query.tavole.findFirst({
        where: eq(tavole.id, id),
        with: { category: true, scan: true, model: true },
      });
      return row ?? null;
    },

    async exists(id) {
      const [row] = await db
        .select({ id: tavole.id })
        .from(tavole)
        .where(eq(tavole.id, id))
        .limit(1);
      return row !== undefined;
    },

    async add(tavola) {
      const [row] = await db.insert(tavole).values(tavola).returning();
      if (!row) {
        throw new Error('Inserting a Tavola returned nothing.');
      }
      return row;
    },
  };
}
