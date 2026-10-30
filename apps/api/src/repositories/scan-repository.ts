import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { QuarterTurn } from '@ricambi/contracts';
import type { DbSession } from '../db/client.js';
import {
  marks,
  positions,
  scans,
  subAssemblies,
  type NewScanRow,
  type ScanRow,
} from '../db/schema.js';

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
  findByTavola(tavolaId: string): Promise<ScanRow | null>;
  /**
   * Puts the same drawing, turned a quarter, in place of `turned`, and turns every Mark and every
   * Sub-assembly's outline on the Tavola with it — in one transaction, so no Mark and no outline
   * is ever on the drawing the wrong way round.
   * `null` when `turned` is no longer the Tavola's scan: somebody turned or replaced it meanwhile.
   */
  turn(turned: ScanRow, direction: QuarterTurn, scan: NewScanRow): Promise<ScanRow | null>;
}

/**
 * Where a Mark lands when the drawing under it turns, in fractions of the drawing (ADR 0013).
 * Postgres reads every right-hand side from the row as it was, so `x` and `y` swap cleanly.
 */
const TURNED = {
  clockwise: { x: sql`1 - ${marks.y}`, y: sql`${marks.x}` },
  anticlockwise: { x: sql`${marks.y}`, y: sql`1 - ${marks.x}` },
} as const;

/**
 * The same turn for an outline's corners, which are a list in one column rather than a row each:
 * every corner is rebuilt in place, and `with ordinality` keeps them in the order they were drawn.
 */
function turnedOutline(direction: QuarterTurn) {
  const [x, y] =
    direction === 'clockwise'
      ? [sql`1 - (corner->>'y')::float8`, sql`(corner->>'x')::float8`]
      : [sql`(corner->>'y')::float8`, sql`1 - (corner->>'x')::float8`];
  return sql`(
    select jsonb_agg(jsonb_build_object('x', ${x}, 'y', ${y}) order by place)
    from jsonb_array_elements(${subAssemblies.outline}) with ordinality as corners(corner, place)
  )`;
}

export function createScanRepository(db: DbSession): ScanRepository {
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

    async findByTavola(tavolaId) {
      const [row] = await db.select().from(scans).where(eq(scans.tavolaId, tavolaId)).limit(1);
      return row ?? null;
    },

    async turn(turned, direction, scan) {
      return db.transaction(async (tx) => {
        const [gone] = await tx
          .delete(scans)
          .where(and(eq(scans.id, turned.id), eq(scans.tavolaId, scan.tavolaId)))
          .returning({ id: scans.id });
        if (!gone) {
          return null;
        }

        const [current] = await tx.insert(scans).values(scan).returning();
        if (!current) {
          throw new Error('Inserting a Scan returned nothing.');
        }

        await tx
          .update(marks)
          .set(TURNED[direction])
          .where(
            inArray(
              marks.positionId,
              tx
                .select({ id: positions.id })
                .from(positions)
                .where(eq(positions.tavolaId, scan.tavolaId)),
            ),
          );

        await tx
          .update(subAssemblies)
          .set({ outline: turnedOutline(direction) })
          .where(and(eq(subAssemblies.tavolaId, scan.tavolaId), isNotNull(subAssemblies.outline)));

        return current;
      });
    },
  };
}
