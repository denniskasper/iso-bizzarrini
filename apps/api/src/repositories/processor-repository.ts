import type { ProcessorRole } from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { processors, type NewProcessorRow, type ProcessorRow } from '../db/schema.js';

/** Who handles members' data on the association's behalf — one row per role, if any. */
export interface ProcessorRepository {
  list(): Promise<ProcessorRow[]>;
  /** Writes the row for its role, replacing whoever held that role before. */
  save(processor: NewProcessorRow): Promise<ProcessorRow>;
  remove(role: ProcessorRole): Promise<void>;
}

export function createProcessorRepository(db: DbSession): ProcessorRepository {
  return {
    list() {
      return db.select().from(processors);
    },

    async save(processor) {
      const { role, ...fields } = processor;
      const [row] = await db
        .insert(processors)
        .values(processor)
        .onConflictDoUpdate({ target: processors.role, set: fields })
        .returning();

      if (!row) {
        throw new Error(`Saving the ${role} processor returned nothing.`);
      }
      return row;
    },

    async remove(role) {
      await db.delete(processors).where(eq(processors.role, role));
    },
  };
}
