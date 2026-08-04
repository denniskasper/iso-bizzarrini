import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  EQUIVALENT_KINDS,
  equivalents,
  fitments,
  models,
  sources,
  type EquivalentRow,
  type FitmentRow,
  type ModelRow,
  type NewEquivalentRow,
  type NewFitmentRow,
  type NewSourceRow,
  type SourceRow,
} from '../db/schema.js';

/**
 * What fits a Part, what can be bought instead of it, and where it has been available.
 *
 * **Three tables in one file, and "the Part's record" is not a fourth noun.** None of the three
 * is a thing a member navigates to: they are read together, on the Part, at the moment somebody
 * decides whether to order something — so a file each would be three files nothing ever opens
 * one of. The language of the archive is unchanged (`CONTEXT.md`); this is only where the code
 * for it lives.
 *
 * Every read takes a **set** of Part ids rather than one, because a Position carrying two
 * alternatives and three fixings is five Parts, and answering one click with fifteen queries is
 * how a screen becomes slow without anybody deciding to make it slow.
 */

/** A Fitment as it is read: the car, whole, because it may not be the one being looked at. */
export interface FitmentWithModel extends FitmentRow {
  model: ModelRow;
}

/**
 * The three, for one Part. They travel together because they are read together — a member
 * deciding what to order is weighing "does it fit", "what else would do" and "who has one"
 * against each other, in one glance at one panel.
 */
export interface PartRecordRows {
  fitments: FitmentWithModel[];
  equivalents: EquivalentRow[];
  sources: SourceRow[];
}

/** The editable fields of a Fitment — everything but which Part it belongs to. */
export type FitmentFields = Pick<NewFitmentRow, 'modelId' | 'qualifier'>;
export type EquivalentFields = Pick<NewEquivalentRow, 'kind' | 'maker' | 'reference' | 'note'>;
export type SourceFields = Omit<NewSourceRow, 'id' | 'partId'>;

export interface PartRecordRepository {
  listFitments(partIds: string[]): Promise<FitmentWithModel[]>;
  listEquivalents(partIds: string[]): Promise<EquivalentRow[]>;
  listSources(partIds: string[]): Promise<SourceRow[]>;

  addFitment(row: NewFitmentRow): Promise<FitmentRow>;
  addEquivalent(row: NewEquivalentRow): Promise<EquivalentRow>;
  addSource(row: NewSourceRow): Promise<SourceRow>;

  /**
   * Correcting and removing both answer with the row **as it was on the way past**, and never
   * with a bare boolean. What every one of these writes has to produce afterwards is the whole
   * Part re-read, and the row is the only thing that knows which Part that is.
   */
  updateFitment(id: string, fields: FitmentFields): Promise<FitmentRow | null>;
  updateEquivalent(id: string, fields: EquivalentFields): Promise<EquivalentRow | null>;
  updateSource(id: string, fields: SourceFields): Promise<SourceRow | null>;

  removeFitment(id: string): Promise<FitmentRow | null>;
  removeEquivalent(id: string): Promise<EquivalentRow | null>;
  removeSource(id: string): Promise<SourceRow | null>;
}

export function createPartRecordRepository(db: Db): PartRecordRepository {
  /**
   * The catalog's own order for the cars a Part fits — the order somebody who owns one of these
   * would look through a shelf of catalogs, rather than the order an Editor happened to type.
   */
  const byCar = [asc(models.brand), asc(models.name), sql`${models.series} asc nulls last`];

  /**
   * **From the original supplier outwards to the scrapyard**, which is the order in
   * `EQUIVALENT_KINDS` and not an alphabetical accident. `array_position` reads that list
   * directly, so adding a fifth kind one day changes the order in exactly one place.
   */
  const byHowCloseToTheOriginal = [
    sql`array_position(array[${sql.raw(EQUIVALENT_KINDS.map((kind) => `'${kind}'`).join(','))}]::text[], ${equivalents.kind})`,
    asc(equivalents.maker),
    sql`${equivalents.reference} asc nulls last`,
    asc(equivalents.id),
  ];

  /**
   * **Most recently seen first**, because the same shop at two prices on two dates is a price
   * history and the useful end of it is the recent one. A Source nobody recorded a price for has
   * no date either — that is the rule the table enforces — and sorts last, where a list of prices
   * puts the entry that is not one.
   */
  const byWhatWasSeenLast = [
    sql`${sources.observedOn} desc nulls last`,
    asc(sources.name),
    asc(sources.id),
  ];

  return {
    async listFitments(partIds) {
      if (partIds.length === 0) {
        return [];
      }

      const rows = await db
        .select({ fitment: fitments, model: models })
        .from(fitments)
        .innerJoin(models, eq(fitments.modelId, models.id))
        .where(inArray(fitments.partId, partIds))
        .orderBy(...byCar);

      return rows.map((row) => ({ ...row.fitment, model: row.model }));
    },

    listEquivalents(partIds) {
      if (partIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .select()
        .from(equivalents)
        .where(inArray(equivalents.partId, partIds))
        .orderBy(...byHowCloseToTheOriginal);
    },

    listSources(partIds) {
      if (partIds.length === 0) {
        return Promise.resolve([]);
      }
      return db
        .select()
        .from(sources)
        .where(inArray(sources.partId, partIds))
        .orderBy(...byWhatWasSeenLast);
    },

    async addFitment(row) {
      const [added] = await db.insert(fitments).values(row).returning();
      if (!added) {
        throw new Error('Inserting a Fitment returned nothing.');
      }
      return added;
    },

    async addEquivalent(row) {
      const [added] = await db.insert(equivalents).values(row).returning();
      if (!added) {
        throw new Error('Inserting an Equivalent returned nothing.');
      }
      return added;
    },

    async addSource(row) {
      const [added] = await db.insert(sources).values(row).returning();
      if (!added) {
        throw new Error('Inserting a Source returned nothing.');
      }
      return added;
    },

    async updateFitment(id, fields) {
      const [updated] = await db
        .update(fitments)
        .set(fields)
        .where(eq(fitments.id, id))
        .returning();
      return updated ?? null;
    },

    async updateEquivalent(id, fields) {
      const [updated] = await db
        .update(equivalents)
        .set(fields)
        .where(eq(equivalents.id, id))
        .returning();
      return updated ?? null;
    },

    async updateSource(id, fields) {
      const [updated] = await db.update(sources).set(fields).where(eq(sources.id, id)).returning();
      return updated ?? null;
    },

    async removeFitment(id) {
      const [removed] = await db.delete(fitments).where(eq(fitments.id, id)).returning();
      return removed ?? null;
    },

    async removeEquivalent(id) {
      const [removed] = await db.delete(equivalents).where(eq(equivalents.id, id)).returning();
      return removed ?? null;
    },

    async removeSource(id) {
      const [removed] = await db.delete(sources).where(eq(sources.id, id)).returning();
      return removed ?? null;
    },
  };
}
