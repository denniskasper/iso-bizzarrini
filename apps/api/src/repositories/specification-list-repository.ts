import { asc, count, eq, sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import {
  specificationNames,
  specifications,
  units,
  type SpecificationNameRow,
  type UnitRow,
} from '../db/schema.js';

/** A Unit and how many Specification names are counted in it. */
export interface UnitWithCount extends UnitRow {
  names: number;
}

/** A Specification name with its Unit, and how many Parts have a value for it. */
export interface SpecificationNameInFull {
  id: string;
  name: string;
  slug: string;
  unit: UnitRow | null;
  parts: number;
}

/** What correcting a name came to. */
export type NameCorrection =
  | { outcome: 'corrected'; row: SpecificationNameRow }
  | { outcome: 'missing' }
  /** Its Unit was asked to change while a Part has a value counted in the old one. */
  | { outcome: 'counted' };

/**
 * The two lists an Administrator keeps for Specifications: the Units, and the names.
 *
 * **Sameness is the database's to refuse**, as it is for Categories: `units_key_unique` and
 * `specification_names_slug_unique`. So is removal while something depends on the entry — a
 * name counted in a Unit, a Part's value under a name — through the foreign keys, which is why
 * the two `remove` methods throw rather than answer.
 */
export interface SpecificationListRepository {
  /** By symbol, case folded for the order and nothing else. */
  listUnits(): Promise<UnitWithCount[]>;
  addUnit(symbol: string, key: string): Promise<UnitRow>;
  /** `null` when there is no such Unit. */
  renameUnit(id: string, symbol: string, key: string): Promise<UnitRow | null>;
  /** `null` when there is no such Unit. Refused by the foreign key while a name is counted in it. */
  removeUnit(id: string): Promise<UnitRow | null>;
  /** The names counted in a Unit, in the list's order. */
  namesCountedIn(unitId: string): Promise<string[]>;

  /** In the list's order. */
  listNames(): Promise<SpecificationNameInFull[]>;
  findName(id: string): Promise<SpecificationNameInFull | null>;
  /** At the end of the list. */
  addName(name: string, slug: string, unitId: string | null): Promise<SpecificationNameRow>;
  correctName(
    id: string,
    changes: { name?: string; slug?: string; unitId?: string | null },
  ): Promise<NameCorrection>;
  /** `false`, and nothing written, unless the ids are exactly the list's, each once. */
  reorderNames(ids: string[]): Promise<boolean>;
  /** `null` when there is no such name. Refused by the foreign key while a Part has a value. */
  removeName(id: string): Promise<SpecificationNameRow | null>;
}

export function createSpecificationListRepository(db: DbSession): SpecificationListRepository {
  /** Ties break on the id, so the order is total and two reads never disagree. */
  const namesInOrder = [asc(specificationNames.sequence), asc(specificationNames.id)];

  function namesInFull() {
    return db
      .select({
        id: specificationNames.id,
        name: specificationNames.name,
        slug: specificationNames.slug,
        unitId: units.id,
        unitSymbol: units.symbol,
        unitKey: units.key,
        parts: count(specifications.id),
      })
      .from(specificationNames)
      .leftJoin(units, eq(units.id, specificationNames.unitId))
      .leftJoin(specifications, eq(specifications.nameId, specificationNames.id))
      .groupBy(specificationNames.id, units.id)
      .orderBy(...namesInOrder)
      .$dynamic();
  }

  const toInFull = (row: {
    id: string;
    name: string;
    slug: string;
    unitId: string | null;
    unitSymbol: string | null;
    unitKey: string | null;
    parts: number;
  }): SpecificationNameInFull => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    unit:
      row.unitId === null || row.unitSymbol === null || row.unitKey === null
        ? null
        : { id: row.unitId, symbol: row.unitSymbol, key: row.unitKey },
    parts: row.parts,
  });

  return {
    listUnits() {
      return db
        .select({
          id: units.id,
          symbol: units.symbol,
          key: units.key,
          names: count(specificationNames.id),
        })
        .from(units)
        .leftJoin(specificationNames, eq(specificationNames.unitId, units.id))
        .groupBy(units.id)
        .orderBy(sql`lower(${units.symbol})`, asc(units.symbol));
    },

    async addUnit(symbol, key) {
      const [row] = await db.insert(units).values({ symbol, key }).returning();
      if (!row) {
        throw new Error('Inserting a Unit returned nothing.');
      }
      return row;
    },

    async renameUnit(id, symbol, key) {
      const [row] = await db.update(units).set({ symbol, key }).where(eq(units.id, id)).returning();
      return row ?? null;
    },

    async removeUnit(id) {
      const [row] = await db.delete(units).where(eq(units.id, id)).returning();
      return row ?? null;
    },

    async namesCountedIn(unitId) {
      const rows = await db
        .select({ name: specificationNames.name })
        .from(specificationNames)
        .where(eq(specificationNames.unitId, unitId))
        .orderBy(...namesInOrder);
      return rows.map((row) => row.name);
    },

    async listNames() {
      return (await namesInFull()).map(toInFull);
    },

    async findName(id) {
      const [row] = await namesInFull().where(eq(specificationNames.id, id));
      return row ? toInFull(row) : null;
    },

    async addName(name, slug, unitId) {
      // The end of the list is read and written in one statement. Two Administrators adding at
      // the same moment can still take the same place; ties break on the id, and the list's
      // order stays total until somebody next puts it in order.
      const [row] = await db
        .insert(specificationNames)
        .values({
          name,
          slug,
          unitId,
          sequence: sql`(SELECT coalesce(max(${specificationNames.sequence}) + 1, 0) FROM ${specificationNames})`,
        })
        .returning();
      if (!row) {
        throw new Error('Inserting a Specification name returned nothing.');
      }
      return row;
    },

    async correctName(id, changes) {
      return db.transaction(async (tx): Promise<NameCorrection> => {
        // Locked, so a value recorded while the Unit is being changed waits for the answer.
        const [current] = await tx
          .select()
          .from(specificationNames)
          .where(eq(specificationNames.id, id))
          .for('update');
        if (!current) {
          return { outcome: 'missing' };
        }

        if (changes.unitId !== undefined && changes.unitId !== current.unitId) {
          const [counted] = await tx
            .select({ parts: count() })
            .from(specifications)
            .where(eq(specifications.nameId, id));
          if ((counted?.parts ?? 0) > 0) {
            return { outcome: 'counted' };
          }
        }

        const [row] = await tx
          .update(specificationNames)
          .set(changes)
          .where(eq(specificationNames.id, id))
          .returning();
        if (!row) {
          throw new Error('Correcting a Specification name returned nothing.');
        }
        return { outcome: 'corrected', row };
      });
    },

    async reorderNames(ids) {
      return db.transaction(async (tx) => {
        const held = await tx
          .select({ id: specificationNames.id })
          .from(specificationNames)
          .for('update');

        const asked = new Set(ids);
        if (asked.size !== ids.length || asked.size !== held.length) {
          return false;
        }
        if (held.some((row) => !asked.has(row.id))) {
          return false;
        }

        for (const [sequence, id] of ids.entries()) {
          await tx
            .update(specificationNames)
            .set({ sequence })
            .where(eq(specificationNames.id, id));
        }
        return true;
      });
    },

    async removeName(id) {
      const [row] = await db
        .delete(specificationNames)
        .where(eq(specificationNames.id, id))
        .returning();
      return row ?? null;
    },
  };
}
