import type { TavolaCheckingResponse } from '@ricambi/contracts';
import { NotFoundError } from '../http/errors.js';
import type { StoredImage } from '../http/served-image.js';
import type { Logger } from '../platform/logger.js';
import type { PartRepository } from '../repositories/part-repository.js';
import type { ReadingRepository } from '../repositories/reading-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import type { FileStore } from '../storage/file-store.js';
import { toTavolaListing } from './catalog-view.js';

/**
 * **What an Editor checks a machine-read Tavola against** (ADR 0017, issue #34): the rows as the
 * read command read them, each beside the Table sheet it came from, and what it was unsure of.
 *
 * Correcting what is wrong uses the tools the archive already has — the marking tool, a Listing's
 * own correction, a Part's — and publishing is the one act that ends it. Nothing here writes.
 */
export interface CheckingService {
  read(tavolaId: string): Promise<TavolaCheckingResponse>;
  /** `null` when the Tavola has no such sheet, so the route can answer 404 rather than crash. */
  openTableSheet(tavolaId: string, sheet: number): Promise<StoredImage | null>;
}

export function createCheckingService(dependencies: {
  tavolaRepository: TavolaRepository;
  partRepository: PartRepository;
  readingRepository: ReadingRepository;
  fileStore: FileStore;
  logger: Logger;
}): CheckingService {
  const { tavolaRepository, partRepository, readingRepository, fileStore, logger } = dependencies;

  return {
    async read(tavolaId) {
      const tavola = await tavolaRepository.findById(tavolaId);
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }

      const [listings, doubts] = await Promise.all([
        partRepository.listOnTavola(tavolaId),
        readingRepository.listDoubts(tavolaId),
      ]);

      // Down the sheet in the catalog's order, as its rows are; a doubt about a number alone last.
      const rowOrder = new Map(listings.map((row, index) => [row.id, index]));
      const placeOf = (listingId: string | null) =>
        (listingId === null ? undefined : rowOrder.get(listingId)) ?? listings.length;

      return {
        readingMethod: tavola.readingMethod,
        listings: listings.map((row) => ({ ...toTavolaListing(row), tableSheet: row.tableSheet })),
        doubts: doubts
          .toSorted((a, b) => placeOf(a.listingId) - placeOf(b.listingId))
          .map((doubt) => ({
            id: doubt.id,
            reason: doubt.reason,
            listingId: doubt.listingId,
            positionId: doubt.positionId,
          })),
      };
    },

    async openTableSheet(tavolaId, sheet) {
      const row = await readingRepository.findTableSheet(tavolaId, sheet);
      if (!row) {
        return null;
      }

      const file = await fileStore.open(row.originalKey);
      if (!file) {
        logger.error({ id: row.id, key: row.originalKey }, 'A Table sheet file is missing');
        return null;
      }

      return {
        // Served as it was read, which is a picture any browser opens: the read command writes PNG.
        contentType: `image/${row.format}`,
        byteSize: file.byteSize,
        etag: `"${row.id}"`,
        stream: file.stream,
      };
    },
  };
}
