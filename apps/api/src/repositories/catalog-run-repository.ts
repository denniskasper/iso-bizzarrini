import { eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  catalogRuns,
  models,
  type CatalogRunRow,
  type ModelRow,
  type NewCatalogRunRow,
} from '../db/schema.js';

/** A Catalog run with the Model it is for, which is how it is always shown. */
export interface CatalogRunWithModel {
  run: CatalogRunRow;
  model: ModelRow;
}

/** Catalog runs (ADR 0018). The repository knows about rows; nothing above it does. */
export interface CatalogRunRepository {
  add(run: NewCatalogRunRow): Promise<CatalogRunRow>;
  findById(id: string): Promise<CatalogRunWithModel | null>;
}

export function createCatalogRunRepository(db: DbSession): CatalogRunRepository {
  return {
    async add(run) {
      const [row] = await db.insert(catalogRuns).values(run).returning();
      if (!row) {
        throw new Error('Recording a Catalog run returned nothing.');
      }
      return row;
    },

    async findById(id) {
      const [row] = await db
        .select({ run: catalogRuns, model: models })
        .from(catalogRuns)
        .innerJoin(models, eq(models.id, catalogRuns.modelId))
        .where(eq(catalogRuns.id, id))
        .limit(1);
      return row ?? null;
    },
  };
}
