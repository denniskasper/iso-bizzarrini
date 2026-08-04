import { asc, eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { models, type ModelRow, type NewModelRow } from '../db/schema.js';

/**
 * Models. The repository knows about rows; nothing above it does.
 */
export interface ModelRepository {
  listAll(): Promise<ModelRow[]>;
  listByBrand(brand: string): Promise<ModelRow[]>;
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
