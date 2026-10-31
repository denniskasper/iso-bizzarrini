import { asc, desc, eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  endedSamples,
  samples,
  type EndedSampleRow,
  type ModelRow,
  type NewSampleRow,
  type SampleRow,
} from '../db/schema.js';

/** A Sample with what is said about it: the number it has open and who showed it. */
export interface SampleInContext extends SampleRow {
  position: { number: string };
  /** Who showed it, while their Account exists. Nothing else about them is read. */
  marker: { name: string } | null;
}

/** Which Tavola it is, for the list an Administrator reads. */
interface SampleTavolaRow {
  id: string;
  number: string;
  nameIt: string;
  nameEn: string;
  model: ModelRow;
}

export interface ListedSample extends SampleInContext {
  tavola: SampleTavolaRow;
}

export interface ListedEndedSample extends EndedSampleRow {
  tavola: SampleTavolaRow;
}

/** The drawing columns, which are all that changes when the Scan under a Sample does. */
export type SampleDrawing = Pick<
  SampleRow,
  'drawingId' | 'drawingKey' | 'drawingWidth' | 'drawingHeight' | 'drawingByteSize'
>;

export interface SampleRepository {
  findByTavola(tavolaId: string): Promise<SampleInContext | null>;
  findByDrawing(drawingId: string): Promise<SampleRow | null>;
  /** The Sample this Position is the open number of, if it is one. */
  findByOpenPosition(positionId: string): Promise<SampleInContext | null>;
  /** Every Sample, in the order they were first shown. */
  list(): Promise<ListedSample[]>;
  /**
   * Shows a Tavola. `false` when it was shown already — somebody else marked it meanwhile — and
   * nothing was written.
   */
  add(sample: NewSampleRow): Promise<boolean>;
  /** Another number opened on a Tavola already shown. `false` when it is not shown. */
  open(tavolaId: string, positionId: string): Promise<boolean>;
  /** A new copy in place of the old, which is returned so its file can go. */
  redraw(tavolaId: string, drawing: SampleDrawing): Promise<SampleRow | null>;
  /** Stops showing it. The row that was, so its file can go — or `null` if it was not shown. */
  remove(tavolaId: string): Promise<SampleRow | null>;

  /** Records that a Tavola's Sample ended by itself, in place of any ending recorded before. */
  recordEnded(ended: EndedSampleRow): Promise<void>;
  endedOf(tavolaId: string): Promise<EndedSampleRow | null>;
  /** Every Sample that ended by itself, the most recent first. */
  listEnded(): Promise<ListedEndedSample[]>;
  /** Forgets that it ended. `false` when there was nothing to forget. */
  forgetEnded(tavolaId: string): Promise<boolean>;
}

export function createSampleRepository(db: DbSession): SampleRepository {
  const said = {
    position: { columns: { number: true } },
    marker: { columns: { name: true } },
  } as const;
  const whichTavola = {
    tavola: {
      columns: { id: true, number: true, nameIt: true, nameEn: true },
      with: { model: true },
    },
  } as const;

  return {
    async findByTavola(tavolaId) {
      const row = await db.query.samples.findFirst({
        where: eq(samples.tavolaId, tavolaId),
        with: said,
      });
      return row ?? null;
    },

    async findByDrawing(drawingId) {
      const [row] = await db
        .select()
        .from(samples)
        .where(eq(samples.drawingId, drawingId))
        .limit(1);
      return row ?? null;
    },

    async findByOpenPosition(positionId) {
      const row = await db.query.samples.findFirst({
        where: eq(samples.positionId, positionId),
        with: said,
      });
      return row ?? null;
    },

    list() {
      return db.query.samples.findMany({
        with: { ...said, ...whichTavola },
        orderBy: [asc(samples.markedAt), asc(samples.tavolaId)],
      });
    },

    async add(sample) {
      const written = await db
        .insert(samples)
        .values(sample)
        .onConflictDoNothing({ target: samples.tavolaId })
        .returning({ tavolaId: samples.tavolaId });
      return written.length > 0;
    },

    async open(tavolaId, positionId) {
      const written = await db
        .update(samples)
        .set({ positionId })
        .where(eq(samples.tavolaId, tavolaId))
        .returning({ tavolaId: samples.tavolaId });
      return written.length > 0;
    },

    async redraw(tavolaId, drawing) {
      return db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(samples)
          .where(eq(samples.tavolaId, tavolaId))
          .for('update');
        if (!before) {
          return null;
        }
        await tx.update(samples).set(drawing).where(eq(samples.tavolaId, tavolaId));
        return before;
      });
    },

    async remove(tavolaId) {
      const [removed] = await db.delete(samples).where(eq(samples.tavolaId, tavolaId)).returning();
      return removed ?? null;
    },

    async recordEnded(ended) {
      await db
        .insert(endedSamples)
        .values(ended)
        .onConflictDoUpdate({
          target: endedSamples.tavolaId,
          set: { openNumber: ended.openNumber, endedAt: ended.endedAt, reason: ended.reason },
        });
    },

    async endedOf(tavolaId) {
      const [row] = await db
        .select()
        .from(endedSamples)
        .where(eq(endedSamples.tavolaId, tavolaId))
        .limit(1);
      return row ?? null;
    },

    listEnded() {
      return db.query.endedSamples.findMany({
        with: whichTavola,
        orderBy: [desc(endedSamples.endedAt), asc(endedSamples.tavolaId)],
      });
    },

    async forgetEnded(tavolaId) {
      const forgotten = await db
        .delete(endedSamples)
        .where(eq(endedSamples.tavolaId, tavolaId))
        .returning({ tavolaId: endedSamples.tavolaId });
      return forgotten.length > 0;
    },
  };
}
