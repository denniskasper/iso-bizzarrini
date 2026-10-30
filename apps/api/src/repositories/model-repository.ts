import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { models, tavole, type ModelRow, type NewModelRow } from '../db/schema.js';

/**
 * Models. The repository knows about rows; nothing above it does.
 */
export interface ModelRepository {
  listAll(): Promise<ModelRow[]>;
  listByBrand(brand: string): Promise<ModelRow[]>;
  /**
   * Each Model with at least one Published Tavola, and how many it has — what a Visitor is shown
   * of the archive's depth (ADR 0019). Counted in the database, which is where a count belongs.
   */
  listCovered(): Promise<(ModelRow & { publishedTavole: number })[]>;
  findById(id: string): Promise<ModelRow | null>;
  add(model: NewModelRow): Promise<ModelRow>;
}

export function createModelRepository(db: DbSession): ModelRepository {
  const ordered = [asc(models.brand), asc(models.name), asc(models.series)];

  return {
    listAll() {
      return db
        .select()
        .from(models)
        .orderBy(...ordered);
    },

    listByBrand(brand) {
      return db
        .select()
        .from(models)
        .where(eq(models.brand, brand))
        .orderBy(...ordered);
    },

    listCovered() {
      return (
        db
          .select({
            id: models.id,
            brand: models.brand,
            name: models.name,
            series: models.series,
            modelYears: models.modelYears,
            // `count` is a `bigint`, which reaches this process as a string unless it is cast.
            publishedTavole: sql<number>`count(${tavole.id})::int`,
          })
          .from(models)
          // An inner join, so a Model with nothing published is not listed at all.
          .innerJoin(tavole, and(eq(tavole.modelId, models.id), eq(tavole.state, 'published')))
          .groupBy(models.id)
          .orderBy(...ordered)
      );
    },

    async findById(id) {
      const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1);
      return row ?? null;
    },

    async add(model) {
      const [row] = await db.insert(models).values(model).returning();
      if (!row) {
        throw new Error('Inserting a Model returned nothing.');
      }
      return row;
    },
  };
}
