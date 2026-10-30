import type { SubAssemblyResponse } from '@ricambi/contracts';
import { NotFoundError, ValidationError } from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { PartRepository } from '../repositories/part-repository.js';
import type { PhotographRepository } from '../repositories/photograph-repository.js';
import type { PositionRepository } from '../repositories/position-repository.js';
import type { FileStore } from '../storage/file-store.js';
import { toPhotograph, toSubAssembly, toTavolaListing } from './catalog-view.js';
import { dropPhotographFiles, ingestPhotograph } from './photograph-service.js';

/**
 * **A Sub-assembly read as one thing** (issue #110): its name, the Note an Editor wrote about the
 * assembly as a whole, its Photographs (issue #114), and its numbers with what sits at each.
 *
 * Putting numbers in and taking them out stays with the sheet's other markings, in the Position
 * service, because those answer with the sheet. This answers with the Sub-assembly.
 */
export interface SubAssemblyService {
  /** The page, read under the Tavola it is on. Any other Tavola has no such Sub-assembly. */
  read(tavolaId: string, subAssemblyId: string): Promise<SubAssemblyResponse>;
  /** The Note as an Editor wrote it, or `null` to clear it. */
  writeNote(subAssemblyId: string, note: string | null): Promise<SubAssemblyResponse>;
  /**
   * Its Photographs, stored, prepared and served as a Part's are. Each write answers with the
   * page re-read, for the reason a Part's do: the order is the archive's to report.
   */
  addPhotograph(subAssemblyId: string, upload: Buffer): Promise<SubAssemblyResponse>;
  reorderPhotographs(subAssemblyId: string, photographIds: string[]): Promise<SubAssemblyResponse>;
  removePhotograph(subAssemblyId: string, photographId: string): Promise<SubAssemblyResponse>;
}

export function createSubAssemblyService(dependencies: {
  positionRepository: PositionRepository;
  partRepository: PartRepository;
  photographRepository: PhotographRepository;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
}): SubAssemblyService {
  const { positionRepository, partRepository, photographRepository, fileStore, clock, logger } =
    dependencies;

  async function existing(subAssemblyId: string) {
    const subAssembly = await positionRepository.findSubAssembly(subAssemblyId);
    if (!subAssembly) {
      throw new NotFoundError('No such Sub-assembly.');
    }
    return subAssembly;
  }

  async function page(tavolaId: string, subAssemblyId: string): Promise<SubAssemblyResponse> {
    const subAssembly = await positionRepository.findSubAssembly(subAssemblyId);
    if (!subAssembly || subAssembly.tavolaId !== tavolaId) {
      throw new NotFoundError('No such Sub-assembly.');
    }

    // The sheet's own reads, filtered: both are already in the catalog's order, drawn Parts
    // first at each number, so nothing here sorts a catalog.
    const [rows, listings, photographs] = await Promise.all([
      positionRepository.listByTavola(tavolaId),
      partRepository.listOnTavola(tavolaId),
      photographRepository.listForSubAssembly(subAssembly.id),
    ]);

    return {
      subAssembly: {
        ...toSubAssembly(subAssembly),
        note: subAssembly.note,
        photographs: photographs.map(toPhotograph),
      },
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

    async addPhotograph(subAssemblyId, upload) {
      const subAssembly = await existing(subAssemblyId);
      await ingestPhotograph({ photographRepository, fileStore, clock }, { subAssemblyId }, upload);
      return page(subAssembly.tavolaId, subAssembly.id);
    },

    async reorderPhotographs(subAssemblyId, photographIds) {
      const subAssembly = await existing(subAssemblyId);
      if (!(await photographRepository.reorder({ subAssemblyId }, photographIds))) {
        // An order drawn from a list that has since moved on, refused whole as a Part's is.
        throw new ValidationError(
          'That order does not match this sub-assembly’s photographs. Read it again and reorder from what is there now.',
        );
      }
      return page(subAssembly.tavolaId, subAssembly.id);
    },

    async removePhotograph(subAssemblyId, photographId) {
      const removed = await photographRepository.removeFromSubAssembly(subAssemblyId, photographId);
      if (!removed) {
        throw new NotFoundError('No such Photograph.');
      }
      await dropPhotographFiles({ fileStore, logger }, removed.id);
      const subAssembly = await existing(subAssemblyId);
      return page(subAssembly.tavolaId, subAssembly.id);
    },
  };
}
