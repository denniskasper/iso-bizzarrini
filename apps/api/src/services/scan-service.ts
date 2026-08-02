import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import type { TavolaScan } from '@ricambi/contracts';
import { NotFoundError } from '../http/errors.js';
import { scanKeyPrefix, type FileStore } from '../storage/file-store.js';
import { prepareScan } from '../images/scan-ingest.js';
import type { ScanVariant } from '../images/scan-addresses.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { ScanRepository } from '../repositories/scan-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import type { ScanRow } from '../db/schema.js';
import { toTavolaScan } from './catalog-view.js';

export interface ScanImage {
  contentType: string;
  byteSize: number;
  /** The content at this address never changes, so the tag is the address. */
  etag: string;
  stream(): ReadStream;
}

export interface ScanService {
  ingest(tavolaId: string, upload: Buffer): Promise<TavolaScan>;
  /** `null` when there is no such scan, so the route can answer 404 rather than crash. */
  openImage(scanId: string, variant: ScanVariant): Promise<ScanImage | null>;
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
      const originalKey = `${prefix}/original.${prepared.source.format}`;
      const displayKey = `${prefix}/display.webp`;
      const previewKey = `${prefix}/preview.webp`;

      await Promise.all([
        fileStore.write(originalKey, upload),
        fileStore.write(displayKey, prepared.display.contents),
        fileStore.write(previewKey, prepared.preview.contents),
      ]);

      let replaced: ScanRow | null;
      let current: ScanRow;
      try {
        ({ current, replaced } = await scanRepository.replaceForTavola({
          id,
          tavolaId,
          sourceFormat: prepared.source.format,
          sourceByteSize: prepared.source.byteSize,
          sourceWidth: prepared.source.width,
          sourceHeight: prepared.source.height,
          displayFormat: prepared.display.format,
          displayByteSize: prepared.display.byteSize,
          displayWidth: prepared.display.width,
          displayHeight: prepared.display.height,
          previewByteSize: prepared.preview.byteSize,
          originalKey,
          displayKey,
          previewKey,
          ingestedAt: clock.now(),
        }));
      } catch (error) {
        // Files with no row are litter nothing will ever look at again. Take them back.
        await fileStore.remove(prefix).catch(() => undefined);
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

    async openImage(scanId, variant) {
      const scan = await scanRepository.findById(scanId);
      if (!scan) {
        return null;
      }

      const key = variant === 'display' ? scan.displayKey : scan.previewKey;
      const file = await fileStore.open(key);
      if (!file) {
        // The row says there is a file and there is not. Worth saying out loud: it means a
        // backup was restored without its images, or someone tidied the storage directory.
        logger.error({ scanId, variant, key }, 'A recorded scan file is missing from the store');
        return null;
      }

      return {
        // Both derivatives are WebP. The upload itself is kept, and is not served: ADR 0006
        // asks that originals be stored privately, and nothing a member does needs one.
        contentType: 'image/webp',
        byteSize: file.byteSize,
        etag: `"${scanId}-${variant}"`,
        stream: file.stream,
      };
    },
  };
}
