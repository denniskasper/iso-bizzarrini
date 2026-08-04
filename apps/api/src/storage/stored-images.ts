import type { StoredImage } from '../http/served-image.js';
import type { ImageVariant } from '../images/image-addresses.js';
import type { PreparedUpload } from '../images/image-ingest.js';
import type { Logger } from '../platform/logger.js';
import type { FileStore } from './file-store.js';

/**
 * **What every picture in this archive is, once ingest has finished with it**: three files under
 * one prefix, and the eleven measurements the row records about them.
 *
 * A Tavola's Scan and a Part's Photograph are two tables and one shape, and this is the shape.
 * Written out twice, the copies drift in the direction that costs most — one of them forgets to
 * take its files back when the row fails to write, or answers with a different `Content-Type`
 * than the other, or stops recording the measurement ADR 0013 waits on. `image-ingest.ts` is the
 * same argument about the encoder; this is the argument about the disk.
 *
 * It is also, with those two, the whole of what ticket 19 reuses: a Contribution's photographs
 * are a different owner and a different visibility rule, and none of that is here.
 */

/** The columns both image tables carry, which is every column but the owner and the timestamp. */
export interface StoredImageColumns {
  sourceFormat: string;
  sourceByteSize: number;
  sourceWidth: number;
  sourceHeight: number;
  displayFormat: string;
  displayByteSize: number;
  displayWidth: number;
  displayHeight: number;
  previewByteSize: number;
  originalKey: string;
  displayKey: string;
  previewKey: string;
}

/** A row far enough read to serve one of its images. Both tables satisfy it. */
export interface StoredImageRow {
  id: string;
  displayKey: string;
  previewKey: string;
}

/**
 * Writes the upload and both derivatives, and reports the columns the row is written from.
 *
 * **It takes its own files back if any of the three fails**, which is not the same guarantee the
 * caller's own compensation gives: a caller can only undo what it knows completed, and a
 * `Promise.all` that rejects has usually written something. Files with no row are litter nothing
 * will ever look at again.
 */
export async function storeImageFiles(
  fileStore: FileStore,
  prefix: string,
  upload: Buffer,
  prepared: PreparedUpload,
): Promise<StoredImageColumns> {
  const originalKey = `${prefix}/original.${prepared.source.format}`;
  const displayKey = `${prefix}/display.webp`;
  const previewKey = `${prefix}/preview.webp`;

  try {
    await Promise.all([
      fileStore.write(originalKey, upload),
      fileStore.write(displayKey, prepared.display.contents),
      fileStore.write(previewKey, prepared.preview.contents),
    ]);
  } catch (error) {
    await discardImageFiles(fileStore, prefix);
    throw error;
  }

  return {
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
  };
}

/** Everything under one prefix, and never a complaint: this only ever runs to tidy up. */
export function discardImageFiles(fileStore: FileStore, prefix: string): Promise<void> {
  return fileStore.remove(prefix).catch(() => undefined);
}

/**
 * One stored image, opened for serving — or `null`, so a route can answer 404 rather than crash.
 *
 * The **original is not reachable from here**, and that is ADR 0006 rather than an omission: the
 * upload is kept as the archival copy and nothing a member does needs it, so there is no variant
 * that names it and therefore no address that serves it.
 */
export async function openStoredImage(
  dependencies: { fileStore: FileStore; logger: Logger },
  row: StoredImageRow,
  variant: ImageVariant,
): Promise<StoredImage | null> {
  const { fileStore, logger } = dependencies;
  const key = variant === 'display' ? row.displayKey : row.previewKey;

  const file = await fileStore.open(key);
  if (!file) {
    // The row says there is a file and there is not. Worth saying out loud: it means a backup
    // was restored without its images, or somebody tidied the storage directory.
    logger.error({ id: row.id, variant, key }, 'A recorded image file is missing from the store');
    return null;
  }

  return {
    // Both derivatives are WebP, whatever arrived.
    contentType: 'image/webp',
    byteSize: file.byteSize,
    // The content at this address never changes — a re-upload is a new record and therefore a
    // new address — so the address is the tag.
    etag: `"${row.id}-${variant}"`,
    stream: file.stream,
  };
}
