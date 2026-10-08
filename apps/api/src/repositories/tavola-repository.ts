import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DbSession } from '../db/client.js';
import {
  listings,
  marks,
  models,
  positions,
  tavole,
  type CategoryRow,
  type ModelRow,
  type NewTavolaRow,
  type ScanRow,
  type TavolaRow,
} from '../db/schema.js';

/**
 * A Tavola never travels alone: a screen showing one always wants the system it is filed under
 * and whether there is a scan behind it. Reading them separately would be three round trips and
 * three chances to forget one, so the repository returns them together.
 *
 * Either may be missing — no Category yet, no scan yet — and both are legitimate states.
 */
export interface TavolaWithCategoryAndScan extends TavolaRow {
  category: CategoryRow | null;
  scan: ScanRow | null;
}

export interface TavolaInContext extends TavolaWithCategoryAndScan {
  model: ModelRow;
}

/** How much of one sheet has been done, counted rather than read. */
export interface TavolaProgressRow {
  tavolaId: string;
  positions: number;
  marked: number;
  listed: number;
}

export interface TavolaRepository {
  listByModel(modelId: string): Promise<TavolaWithCategoryAndScan[]>;
  /**
   * Every Tavola filed under one Category, on whichever car — brand, then Model, then the order
   * each catalog prints its sheets in, so the answer is already grouped the way it is shown.
   */
  listByCategory(categoryId: string): Promise<TavolaInContext[]>;
  findById(id: string): Promise<TavolaInContext | null>;
  /**
   * How much of each of a Model's sheets has been done, **in one query rather than one a sheet.**
   *
   * A Model may carry sixty Tavole and a Tavola two hundred Positions, so the alternative — read
   * every sheet and count in the process — is twelve thousand rows crossing a wire to produce
   * three numbers each. The database is where a count belongs.
   */
  progressByModel(modelId: string): Promise<TavolaProgressRow[]>;
  /**
   * Whether there is such a sheet, and nothing more. Placing a Mark is the one request an
   * Editor makes hundreds of times an evening, and it has no use for a Tavola's Category, its
   * Model or its scan — only for the difference between a real sheet and a made-up id.
   */
  exists(id: string): Promise<boolean>;
  add(tavola: NewTavolaRow): Promise<TavolaRow>;
  /** Files the sheet under a Category, or under none. `false` when there is no such sheet. */
  setCategory(id: string, categoryId: string | null): Promise<boolean>;
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

    async listByCategory(categoryId) {
      // The order is another table's columns, which the relational reader cannot sort by — so
      // the ids are put in order first and the sheets read whole afterwards, by those ids.
      const ordered = await db
        .select({ id: tavole.id })
        .from(tavole)
        .innerJoin(models, eq(models.id, tavole.modelId))
        .where(eq(tavole.categoryId, categoryId))
        .orderBy(asc(models.brand), asc(models.name), asc(models.series), ...byNumber);

      if (ordered.length === 0) {
        return [];
      }

      const rows = await db.query.tavole.findMany({
        where: inArray(
          tavole.id,
          ordered.map((row) => row.id),
        ),
        with: { category: true, scan: true, model: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      return ordered.flatMap(({ id }) => byId.get(id) ?? []);
    },

    async findById(id) {
      const row = await db.query.tavole.findFirst({
        where: eq(tavole.id, id),
        with: { category: true, scan: true, model: true },
      });
      return row ?? null;
    },

    progressByModel(modelId) {
      /*
       * **Marked and listed are two independent questions asked of the same number**, which is
       * why each is its own `exists` rather than a join. Joining to Marks and to Listings at once
       * would multiply a number printed four times by the three Parts recorded at it and count it
       * twelve times; `count(distinct …)` would undo that, but only after the database had built
       * the twelve rows. Asking whether there is *any* stops at the first, on the index each of
       * those tables already carries for its Position.
       *
       * `left join`, so a Tavola nobody has opened yet reports three zeroes rather than falling
       * out of the list. A sheet with nothing on it is the state most sheets start in and the one
       * an Editor most wants to see.
       *
       * The counts are cast because `count` is a `bigint`, and a `bigint` reaches this process as
       * a string — a number of Positions that arrived as `"200"` would be reported as one.
       */
      // The column names its own table, so there is no pair of arguments here that could
      // disagree — `anyOf(marks.positionId)` cannot be asked about the wrong table.
      const anyOf = (column: AnyPgColumn) =>
        sql`exists (select 1 from ${column.table} where ${column} = ${positions.id})`;

      return (
        db
          .select({
            tavolaId: tavole.id,
            positions: sql<number>`count(${positions.id})::int`,
            marked: sql<number>`(count(${positions.id}) filter (where ${anyOf(marks.positionId)}))::int`,
            listed: sql<number>`(count(${positions.id}) filter (where ${anyOf(listings.positionId)}))::int`,
          })
          .from(tavole)
          .leftJoin(positions, eq(positions.tavolaId, tavole.id))
          .where(eq(tavole.modelId, modelId))
          .groupBy(tavole.id)
          // The catalog's own order, the same one the Model's list of sheets is read in — so the
          // table of counts and the contact sheet beside it name the drawings in one order.
          .orderBy(...byNumber)
      );
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

    async setCategory(id, categoryId) {
      const written = await db
        .update(tavole)
        .set({ categoryId })
        .where(eq(tavole.id, id))
        .returning({ id: tavole.id });
      return written.length > 0;
    },
  };
}
