import type {
  SpecificationName,
  SpecificationNameListing,
  Unit,
  UnitListing,
} from '@ricambi/contracts';
import { specificationNameSlug, unitKey } from '../catalog/naming.js';
import { violates } from '../db/constraints.js';
import type { UnitRow } from '../db/schema.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type {
  SpecificationListRepository,
  SpecificationNameInFull,
} from '../repositories/specification-list-repository.js';

/**
 * The Units and the Specification names: the two lists an Administrator keeps so that the same
 * quantity is never written two ways (*g*, *G* and *gramm*), and *Weight*, *weight* and
 * *Gewicht* are never three things.
 *
 * Who may change them is the router's business; everything here is what a change may be.
 */
export interface SpecificationListService {
  listUnits(): Promise<UnitListing[]>;
  addUnit(symbol: string): Promise<Unit>;
  renameUnit(unitId: string, symbol: string): Promise<Unit>;
  removeUnit(unitId: string): Promise<void>;

  listNames(): Promise<SpecificationNameListing[]>;
  addName(name: string, unitId: string | null): Promise<SpecificationName>;
  correctName(
    nameId: string,
    changes: { name?: string; unitId?: string | null },
  ): Promise<SpecificationName>;
  orderNames(nameIds: string[]): Promise<SpecificationNameListing[]>;
  removeName(nameId: string): Promise<void>;
}

export function createSpecificationListService(dependencies: {
  specificationListRepository: SpecificationListRepository;
}): SpecificationListService {
  const { specificationListRepository: lists } = dependencies;

  /**
   * The symbol as it is to be printed, and the key that decides sameness. Composed, so the Ohm
   * sign a keyboard offers is stored as the omega every other Ω in the archive is.
   */
  function unitOf(written: string): { symbol: string; key: string } {
    const symbol = written.normalize('NFC').trim();
    const key = unitKey(symbol);
    if (key === '') {
      throw new ValidationError('A Unit needs a symbol.');
    }
    return { symbol, key };
  }

  function slugOf(name: string): string {
    const slug = specificationNameSlug(name);
    if (slug === '') {
      throw new ValidationError(
        'A Specification name needs at least one letter or digit in its name.',
      );
    }
    return slug;
  }

  const unitAlreadyListed = (symbol: string) => (error: unknown) => {
    if (violates(error, 'units_key_unique')) {
      throw new ConflictError(`There is already a Unit written “${symbol}”, or spaced like it.`);
    }
    throw error;
  };

  const nameAlreadyListed = (name: string) => (error: unknown) => {
    if (violates(error, 'specification_names_slug_unique')) {
      throw new ConflictError(
        `There is already a Specification name “${name}”, or one spelt like it.`,
      );
    }
    // Only reachable by naming a Unit that is not on the list, or was removed a moment ago.
    if (violates(error, 'specification_names_unit_id_units_id_fk')) {
      throw new ValidationError('That Unit is not on the list.');
    }
    throw error;
  };

  return {
    async listUnits() {
      return (await lists.listUnits()).map((row) => ({ ...toUnit(row), names: row.names }));
    },

    async addUnit(written) {
      const { symbol, key } = unitOf(written);
      return toUnit(await lists.addUnit(symbol, key).catch(unitAlreadyListed(symbol)));
    },

    async renameUnit(unitId, written) {
      const { symbol, key } = unitOf(written);
      const row = await lists.renameUnit(unitId, symbol, key).catch(unitAlreadyListed(symbol));
      if (!row) {
        throw new NotFoundError('No such Unit.');
      }
      return toUnit(row);
    },

    async removeUnit(unitId) {
      try {
        if (!(await lists.removeUnit(unitId))) {
          throw new NotFoundError('No such Unit.');
        }
      } catch (error) {
        if (violates(error, 'specification_names_unit_id_units_id_fk')) {
          const names = await lists.namesCountedIn(unitId);
          throw new ConflictError(
            `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} counted in this Unit. Give ${names.length === 1 ? 'it' : 'them'} another Unit first.`,
          );
        }
        throw error;
      }
    },

    async listNames() {
      return (await lists.listNames()).map(toListing);
    },

    async addName(written, unitId) {
      const row = await lists
        .addName(written, slugOf(written), unitId)
        .catch(nameAlreadyListed(written));
      return readName(row.id);
    },

    async correctName(nameId, changes) {
      // The slug follows the name, as a Category's does: it is the key that decides sameness.
      const renaming =
        changes.name === undefined ? {} : { name: changes.name, slug: slugOf(changes.name) };
      const corrected = await lists
        .correctName(nameId, {
          ...renaming,
          ...(changes.unitId === undefined ? {} : { unitId: changes.unitId }),
        })
        .catch(nameAlreadyListed(changes.name ?? ''));

      if (corrected.outcome === 'missing') {
        throw new NotFoundError('No such Specification name.');
      }
      if (corrected.outcome === 'counted') {
        throw new ConflictError(
          'Parts already have values counted in this name’s Unit. Changing it would change what every one of those numbers means.',
        );
      }
      return readName(nameId);
    },

    async orderNames(nameIds) {
      if (!(await lists.reorderNames(nameIds))) {
        throw new ConflictError(
          'That order does not match the list. Read the list again and put it in order from what is there now.',
        );
      }
      return (await lists.listNames()).map(toListing);
    },

    async removeName(nameId) {
      try {
        if (!(await lists.removeName(nameId))) {
          throw new NotFoundError('No such Specification name.');
        }
      } catch (error) {
        if (violates(error, 'specifications_name_id_specification_names_id_fk')) {
          throw new ConflictError(
            'Parts have values recorded under this name. It can be renamed, but not removed.',
          );
        }
        throw error;
      }
    },
  };

  async function readName(nameId: string): Promise<SpecificationName> {
    const row = await lists.findName(nameId);
    if (!row) {
      throw new NotFoundError('No such Specification name.');
    }
    return toName(row);
  }
}

function toUnit(row: UnitRow): Unit {
  return { id: row.id, symbol: row.symbol };
}

function toName(row: SpecificationNameInFull): SpecificationName {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    unit: row.unit === null ? null : toUnit(row.unit),
  };
}

function toListing(row: SpecificationNameInFull): SpecificationNameListing {
  return { ...toName(row), parts: row.parts };
}
