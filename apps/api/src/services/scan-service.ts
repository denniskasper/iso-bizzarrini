import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import type { QuarterTurn, TavolaScan } from '@ricambi/contracts';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { StoredImage } from '../http/served-image.js';
import { scanKeyPrefix, type FileStore } from '../storage/file-store.js';
import { discardImageFiles, openStoredImage, storeImageFiles } from '../storage/stored-images.js';
import { prepareScan } from '../images/scan-ingest.js';
import type { ImageVariant } from '../images/image-addresses.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { ScanRepository } from '../repositories/scan-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import type { ScanRow } from '../db/schema.js';
import { toTavolaScan } from './catalog-view.js';

export interface ScanService {
  ingest(tavolaId: string, upload: Buffer): Promise<TavolaScan>;
  /**
   * The drawing turned a quarter, with its Marks (issue #34): `(x, y)` goes to `(1 − y, x)`
   * clockwise and to `(y, 1 − x)` anticlockwise, so nothing has to be marked again. The upload is
   * kept byte for byte, and the turned drawing has a new address, as a re-upload would.
   */
  turn(tavolaId: string, direction: QuarterTurn): Promise<TavolaScan>;
  /** `null` when there is no such scan, so the route can answer 404 rather than crash. */
  openImage(scanId: string, variant: ImageVariant): Promise<StoredImage | null>;
}

export function createScanService(dependencies: {
  tavolaRepository: TavolaRepository;
  scanRepository: ScanRepository;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
}): ScanService {
  const { tavolaRepository, scanRepository, fileStore, clock, logger } = dependencies;

  return {
    async ingest(tavolaId, upload) {
      const tavola = await tavolaRepository.findById(tavolaId);
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }

      const prepared = await prepareScan(upload);

      // The id is minted here rather than by the database, because the files are written
      // before the row is, and they are written under it.
      const id = randomUUID();
      const prefix = scanKeyPrefix(id);
      const stored = await storeImageFiles(fileStore, prefix, upload, prepared);

      let replaced: ScanRow | null;
      let current: ScanRow;
      try {
        ({ current, replaced } = await scanRepository.replaceForTavola({
          id,
          tavolaId,
          ...stored,
          ingestedAt: clock.now(),
        }));
      } catch (error) {
        // Files with no row are litter nothing will ever look at again. Take them back.
        await discardImageFiles(fileStore, prefix);
        throw error;
      }

      if (replaced) {
        // After the commit, never before: the Tavola is already answering with the new scan,
        // and losing the old files is a tidiness problem rather than a correctness one.
        await fileStore.remove(scanKeyPrefix(replaced.id)).catch((error: unknown) => {
          logger.warn({ err: error, scanId: replaced.id }, 'Could not remove a replaced scan');
        });
      }

      return toTavolaScan(current);
    },

    async turn(tavolaId, direction) {
      const scan = await scanRepository.findByTavola(tavolaId);
      if (!scan) {
        throw new NotFoundError(
          (await tavolaRepository.exists(tavolaId))
            ? 'This Tavola has no Scan to turn yet.'
            : 'No such Tavola.',
        );
      }

      const file = await fileStore.open(scan.originalKey);
      if (!file) {
        logger.error({ scanId: scan.id, key: scan.originalKey }, 'A Scan’s upload is missing');
        throw new NotFoundError('The upload behind this Scan is missing, so it cannot be turned.');
      }
      const upload = await buffer(file.stream());

      const quarterTurns = (scan.quarterTurns + (direction === 'clockwise' ? 1 : 3)) % 4;
      const prepared = await prepareScan(upload, quarterTurns);

      const id = randomUUID();
      const prefix = scanKeyPrefix(id);
      const stored = await storeImageFiles(fileStore, prefix, upload, prepared);

      let current: ScanRow | null;
      try {
        current = await scanRepository.turn(scan, direction, {
          id,
          tavolaId,
          ...stored,
          quarterTurns,
          // The upload is the one that arrived then; turning it is not a new arrival.
          ingestedAt: scan.ingestedAt,
        });
      } catch (error) {
        await discardImageFiles(fileStore, prefix);
        throw error;
      }
      if (!current) {
        await discardImageFiles(fileStore, prefix);
        throw new ConflictError('The Scan changed while it was being turned. Look again.');
      }

      await fileStore.remove(scanKeyPrefix(scan.id)).catch((error: unknown) => {
        logger.warn({ err: error, scanId: scan.id }, 'Could not remove a turned scan’s files');
      });

      return toTavolaScan(current);
    },

    async openImage(scanId, variant) {
      const scan = await scanRepository.findById(scanId);
      return scan ? openStoredImage({ fileStore, logger }, scan, variant) : null;
    },
  };
}
