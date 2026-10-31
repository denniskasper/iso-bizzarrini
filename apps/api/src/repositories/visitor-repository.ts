import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { listings, marks, models, parts, positions, samples, tavole } from '../db/schema.js';

/**
 * A Sample's heading, as a Visitor may read it. **Every column named**, never a whole row: what
 * this file selects is the whole of what leaves for a Visitor (ADR 0019), so a column added to a
 * Tavola, a Part or a Model is left behind until somebody names it here on purpose.
 */
export interface VisitorSampleRow {
  tavolaId: string;
  number: string;
  nameIt: string;
  nameEn: string;
  brand: string;
  modelName: string;
  series: string | null;
  modelYears: string | null;
  openPositionId: string;
  openNumber: string;
  drawingId: string;
  drawingWidth: number;
  drawingHeight: number;
}

export interface VisitorPositionRow {
  id: string;
  number: string;
  marks: { x: number; y: number }[];
}

export interface VisitorListingRow {
  catalogNumber: string | null;
  nameIt: string | null;
  nameEn: string | null;
  quantityPerCar: number | null;
  catalogNote: string | null;
}

export interface VisitorRepository {
  /** Every Sample on a Published Tavola, in the order they were first shown. */
  listSamples(): Promise<VisitorSampleRow[]>;
  /** `null` for a Tavola that is not a Sample, or not Published. */
  findSample(tavolaId: string): Promise<VisitorSampleRow | null>;
  /** The sheet's numbers and where each is drawn, in the catalog's order. */
  listPositions(tavolaId: string): Promise<VisitorPositionRow[]>;
  /** What is listed at one number, drawn Parts first, as a member reads them. */
  listListings(positionId: string): Promise<VisitorListingRow[]>;
}

export function createVisitorRepository(db: DbSession): VisitorRepository {
  const sample = {
    tavolaId: tavole.id,
    number: tavole.number,
    nameIt: tavole.nameIt,
    nameEn: tavole.nameEn,
    brand: models.brand,
    modelName: models.name,
    series: models.series,
    modelYears: models.modelYears,
    openPositionId: samples.positionId,
    openNumber: positions.number,
    drawingId: samples.drawingId,
    drawingWidth: samples.drawingWidth,
    drawingHeight: samples.drawingHeight,
  };

  function samplesShown() {
    return (
      db
        .select(sample)
        .from(samples)
        .innerJoin(tavole, eq(samples.tavolaId, tavole.id))
        .innerJoin(models, eq(tavole.modelId, models.id))
        .innerJoin(positions, eq(samples.positionId, positions.id))
        // Marking refuses an Unchecked Tavola; this says so again where the public reads.
        .where(eq(tavole.state, 'published'))
        .$dynamic()
    );
  }

  return {
    listSamples() {
      return samplesShown().orderBy(asc(samples.markedAt), asc(samples.tavolaId));
    },

    async findSample(tavolaId) {
      const [row] = await samplesShown()
        .where(and(eq(tavole.state, 'published'), eq(samples.tavolaId, tavolaId)))
        .limit(1);
      return row ?? null;
    },

    async listPositions(tavolaId) {
      const rows = await db
        .select({
          id: positions.id,
          number: positions.number,
          x: marks.x,
          y: marks.y,
        })
        .from(positions)
        .leftJoin(marks, eq(marks.positionId, positions.id))
        .where(eq(positions.tavolaId, tavolaId))
        .orderBy(
          sql`${positions.numberSort} asc nulls last`,
          asc(positions.number),
          asc(marks.y),
          asc(marks.x),
          asc(marks.id),
        );

      const byPosition = new Map<string, VisitorPositionRow>();
      for (const row of rows) {
        const position = byPosition.get(row.id) ?? { id: row.id, number: row.number, marks: [] };
        if (row.x !== null && row.y !== null) {
          position.marks.push({ x: row.x, y: row.y });
        }
        byPosition.set(row.id, position);
      }
      return [...byPosition.values()];
    },

    listListings(positionId) {
      return db
        .select({
          catalogNumber: parts.catalogNumber,
          nameIt: parts.nameIt,
          nameEn: parts.nameEn,
          quantityPerCar: listings.quantityPerCar,
          catalogNote: parts.catalogNote,
        })
        .from(listings)
        .innerJoin(parts, eq(listings.partId, parts.id))
        .where(eq(listings.positionId, positionId))
        .orderBy(
          desc(listings.drawn),
          sql`${parts.catalogNumber} asc nulls last`,
          sql`${parts.nameEn} asc nulls last`,
          asc(parts.id),
        );
    },
  };
}
