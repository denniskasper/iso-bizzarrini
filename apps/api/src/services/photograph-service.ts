import { randomUUID } from 'node:crypto';
import type { PartInFull } from '@ricambi/contracts';
import { NotFoundError, ValidationError } from '../http/errors.js';
import type { StoredImage } from '../http/served-image.js';
import type { ImageVariant } from '../images/image-addresses.js';
import { preparePhotograph } from '../images/photograph-ingest.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { PartRepository } from '../repositories/part-repository.js';
import type {
  PhotographOwner,
  PhotographRepository,
} from '../repositories/photograph-repository.js';
import { photographKeyPrefix, type FileStore } from '../storage/file-store.js';
import { discardImageFiles, openStoredImage, storeImageFiles } from '../storage/stored-images.js';
import type { PartRecordService } from './part-record-service.js';

/**
 * Photographs of a Part — **the check no part number can give anybody** (story 77).
 *
 * A member holding a bracket is not comparing a description, and two calipers that differ only in
 * where a boss sits have the same words written about them. The picture is what settles it, and
 * this is the only thing in the archive that answers without being read.
 *
 * **It is also the file-upload machinery that member Contributions reuse (issue #5)**, and that
 * is why nothing here is specific to an Editor: what it knows about is a picture belonging to a
 * Part, prepared at ingest, stored privately, and answerable for its own removal. Who was allowed
 * to send it is the gate's business, one layer up.
 *
 * Every write answers with **the whole Part, re-read**, for the reason `PartRecordResponse` sets
 * out: the order of these is the archive's rule, and a browser handed the one row that changed
 * would have to work out where it belongs in a second place free to disagree.
 */
export interface PhotographService {
  add(partId: string, upload: Buffer): Promise<PartInFull>;
  reorder(partId: string, photographIds: string[]): Promise<PartInFull>;
  remove(photographId: string): Promise<PartInFull>;
  /** `null` when there is no such photograph, so the route can answer 404 rather than crash. */
  openImage(photographId: string, variant: ImageVariant): Promise<StoredImage | null>;
}

/**
 * **One photograph in, for whichever owner it is** — a Part's or a Sub-assembly's (issue #114),
 * which are stored, prepared and served alike. Prepared, its files written, then its row; files a
 * refused row would leave behind are taken back.
 */
export async function ingestPhotograph(
  dependencies: { photographRepository: PhotographRepository; fileStore: FileStore; clock: Clock },
  owner: PhotographOwner,
  upload: Buffer,
): Promise<void> {
  const { photographRepository, fileStore, clock } = dependencies;
  const prepared = await preparePhotograph(upload);

  // The id is minted here rather than by the database, because the files are written before
  // the row is, and they are written under it.
  const id = randomUUID();
  const prefix = photographKeyPrefix(id);
  const stored = await storeImageFiles(fileStore, prefix, upload, prepared);

  try {
    await photographRepository.add({ id, ...owner, ...stored, uploadedAt: clock.now() });
  } catch (error) {
    // Files with no row are litter nothing will ever look at again. Take them back.
    await discardImageFiles(fileStore, prefix);
    throw error;
  }
}

/**
 * A removed photograph's files, dropped after the commit and never before: its owner is already
 * answering without it, and losing the files is a tidiness problem rather than a correctness one.
 */
export async function dropPhotographFiles(
  dependencies: { fileStore: FileStore; logger: Logger },
  photographId: string,
): Promise<void> {
  const { fileStore, logger } = dependencies;
  await fileStore.remove(photographKeyPrefix(photographId)).catch((error: unknown) => {
    logger.warn({ err: error, photographId }, 'Could not remove a photograph’s files');
  });
}

export function createPhotographService(dependencies: {
  partRepository: PartRepository;
  photographRepository: PhotographRepository;
  partRecordService: PartRecordService;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
}): PhotographService {
  const { partRepository, photographRepository, partRecordService, fileStore, clock, logger } =
    dependencies;

  async function partThatExists(partId: string): Promise<void> {
    if (!(await partRepository.findPart(partId))) {
      throw new NotFoundError('No such Part.');
    }
  }

  return {
    async add(partId, upload) {
      await partThatExists(partId);
      await ingestPhotograph({ photographRepository, fileStore, clock }, { partId }, upload);
      return partRecordService.readWhole(partId);
    },

    async reorder(partId, photographIds) {
      await partThatExists(partId);

      const reordered = await photographRepository.reorder({ partId }, photographIds);
      if (!reordered) {
        // Not a 404: the Part is there and so are its photographs. What arrived was an order
        // drawn from a list that has since moved on — another Editor added one, or removed one —
        // and the browser has to read the Part again before it can say anything about the order.
        throw new ValidationError(
          'That order does not match this part’s photographs. Read the part again and reorder from what is there now.',
        );
      }

      return partRecordService.readWhole(partId);
    },

    async remove(photographId) {
      const removed = await photographRepository.remove(photographId);
      if (!removed) {
        throw new NotFoundError('No such Photograph.');
      }

      await dropPhotographFiles({ fileStore, logger }, removed.id);

      return partRecordService.readWhole(removed.partId);
    },

    async openImage(photographId, variant) {
      const photograph = await photographRepository.findById(photographId);
      return photograph ? openStoredImage({ fileStore, logger }, photograph, variant) : null;
    },
  };
}
