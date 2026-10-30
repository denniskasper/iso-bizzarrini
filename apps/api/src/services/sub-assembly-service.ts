import type { SubAssemblyResponse } from '@ricambi/contracts';
import { NotFoundError } from '../http/errors.js';
import type { PartRepository } from '../repositories/part-repository.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import { toSubAssembly, toTavolaListing } from './catalog-view.js';

/**
 * **A Sub-assembly read as one thing** (issue #110): its name, the Note an Editor wrote about the
 * assembly as a whole, and its numbers with what sits at each.
 *
 * Putting numbers in and taking them out stays with the sheet's other markings, in the Position
 * service, because those answer with the sheet. This answers with the Sub-assembly.
 */
export interface SubAssemblyService {
  /** The page, read under the Tavola it is on. Any other Tavola has no such Sub-assembly. */
  read(tavolaId: string, subAssemblyId: string): Promise<SubAssemblyResponse>;
  /** The Note as an Editor wrote it, or `null` to clear it. */
  writeNote(subAssemblyId: string, note: string | null): Promise<SubAssemblyResponse>;
}

export function createSubAssemblyService(dependencies: {
  positionRepository: PositionRepository;
  partRepository: PartRepository;
}): SubAssemblyService {
  const { positionRepository, partRepository } = dependencies;

  async function page(tavolaId: string, subAssemblyId: string): Promise<SubAssemblyResponse> {
    const subAssembly = await positionRepository.findSubAssembly(subAssemblyId);
    if (!subAssembly || subAssembly.tavolaId !== tavolaId) {
      throw new NotFoundError('No such Sub-assembly.');
    }

    // The sheet's own reads, filtered: both are already in the catalog's order, drawn Parts
    // first at each number, so nothing here sorts a catalog.
    const [rows, listings] = await Promise.all([
      positionRepository.listByTavola(tavolaId),
      partRepository.listOnTavola(tavolaId),
    ]);

    return {
      subAssembly: { ...toSubAssembly(subAssembly), note: subAssembly.note },
      positions: rows
        .filter((row) => row.subAssemblyId === subAssembly.id)
        .map((row) => ({
          id: row.id,
          number: row.number,
          parts: listings
            .filter((listing) => listing.positionId === row.id)
            .map((listing) => toTavolaListing(listing).part),
        })),
    };
  }

  return {
    read: page,

    async writeNote(subAssemblyId, note) {
      const written = await positionRepository.writeSubAssemblyNote(subAssemblyId, note);
      if (!written) {
        throw new NotFoundError('No such Sub-assembly.');
      }
      return page(written.tavolaId, written.id);
    },
  };
}
