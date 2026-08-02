import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { models, type ModelRow } from '../db/schema.js';

/**
 * Reading Models. The repository knows about rows; nothing above it does. Creating a Model is
 * an Editor's job and arrives with ticket 03.
 */
export interface ModelRepository {
  listAll(): Promise<ModelRow[]>;
  listByBrand(brand: string): Promise<ModelRow[]>;
}

export function createModelRepository(db: Db): ModelRepository {
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
  };
}
