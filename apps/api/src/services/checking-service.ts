import type { ReadingDoubt, TavolaCheckingResponse } from '@ricambi/contracts';
import type { ReadingDoubtRow } from '../db/schema.js';
import { ConflictError, NotFoundError } from '../http/errors.js';
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
 * own correction, a Part's — and publishing is the one act that ends it. What is written here is
 * only the doubts themselves (issue #56): one an Editor has looked at is cleared, or rewritten in
 * their words, so what is left is what still needs looking at.
 */
export interface CheckingService {
  read(tavolaId: string): Promise<TavolaCheckingResponse>;
  /** `null` when the Tavola has no such sheet, so the route can answer 404 rather than crash. */
  openTableSheet(tavolaId: string, sheet: number): Promise<StoredImage | null>;
  /** Only while its Tavola is Unchecked: checking a Published one is over. */
  rewriteDoubt(doubtId: string, reason: string): Promise<ReadingDoubt>;
  clearDoubt(doubtId: string): Promise<void>;
}

function toReadingDoubt(doubt: ReadingDoubtRow): ReadingDoubt {
  return {
    id: doubt.id,
    reason: doubt.reason,
    listingId: doubt.listingId,
    positionId: doubt.positionId,
  };
}

export function createCheckingService(dependencies: {
  tavolaRepository: TavolaRepository;
  partRepository: PartRepository;
  readingRepository: ReadingRepository;
  fileStore: FileStore;
  logger: Logger;
}): CheckingService {
  const { tavolaRepository, partRepository, readingRepository, fileStore, logger } = dependencies;

  /** The doubt, on a Tavola still being checked — or the reason it cannot be touched. */
  async function doubtBeingChecked(doubtId: string): Promise<ReadingDoubtRow> {
    const doubt = await readingRepository.findDoubt(doubtId);
    const tavola = doubt && (await tavolaRepository.findById(doubt.tavolaId));
    if (!doubt || !tavola) {
      throw new NotFoundError('No such doubt.');
    }
    if (tavola.state !== 'unchecked') {
      throw new ConflictError(
        'This Tavola is Published, so checking it is over and its doubts stay as they were.',
      );
    }
    return doubt;
  }

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
        listings: listings.map((row) => ({
          ...toTavolaListing(row),
          tableSheet: row.tableSheet,
          readingNote: row.readingNote,
        })),
        doubts: doubts
          .toSorted((a, b) => placeOf(a.listingId) - placeOf(b.listingId))
          .map(toReadingDoubt),
      };
    },

    async rewriteDoubt(doubtId, reason) {
      await doubtBeingChecked(doubtId);
      const rewritten = await readingRepository.rewriteDoubt(doubtId, reason);
      if (!rewritten) {
        throw new NotFoundError('No such doubt.');
      }
      return toReadingDoubt(rewritten);
    },

    async clearDoubt(doubtId) {
      await doubtBeingChecked(doubtId);
      if (!(await readingRepository.removeDoubt(doubtId))) {
        throw new NotFoundError('No such doubt.');
      }
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
