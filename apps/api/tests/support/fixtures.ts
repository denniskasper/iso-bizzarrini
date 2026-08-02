import type { Db } from '../../src/db/client.js';
import { models, type ModelRow, type NewModelRow } from '../../src/db/schema.js';

/**
 * Catalog fixtures. Models are seeded straight into the database because nothing creates them
 * over HTTP yet — the Editor screens arrive with ticket 03.
 */
export async function givenModels(db: Db, ...rows: NewModelRow[]): Promise<ModelRow[]> {
  return db.insert(models).values(rows).returning();
}
