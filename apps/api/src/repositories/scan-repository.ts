import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { scans, type NewScanRow, type ScanRow } from '../db/schema.js';

export interface ScanRepository {
  findById(id: string): Promise<ScanRow | null>;
  /**
   * Makes this the Tavola's scan, and reports the one it replaced so its files can be dropped.
   *
   * One statement, in one transaction, because the alternative — delete, then insert — leaves
   * a Tavola with no scan for as long as it takes, and a crash in between leaves it that way
   * for good. A re-upload must never orphan a Tavola.
   */
  replaceForTavola(scan: NewScanRow): Promise<{ current: ScanRow; replaced: ScanRow | null }>;
}

export function createScanRepository(db: Db): ScanRepository {
  return {
    async findById(id) {
      const [row] = await db.select().from(scans).where(eq(scans.id, id)).limit(1);
      return row ?? null;
    },

    async replaceForTavola(scan) {
      return db.transaction(async (tx) => {
        const [replaced] = await tx
          .delete(scans)
          .where(eq(scans.tavolaId, scan.tavolaId))
          .returning();

        const [current] = await tx.insert(scans).values(scan).returning();
        if (!current) {
          throw new Error('Inserting a Scan returned nothing.');
        }

        return { current, replaced: replaced ?? null };
      });
    },
  };
}
