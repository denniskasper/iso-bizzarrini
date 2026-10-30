import { randomUUID } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import type { SamplesResponse, TavolaSample } from '@ricambi/contracts';
import { ConflictError, NotFoundError } from '../http/errors.js';
import type { StoredImage } from '../http/served-image.js';
import { sampleDrawingUrl } from '../images/image-addresses.js';
import { prepareSampleDrawing } from '../images/sample-drawing.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { DbSession } from '../db/client.js';
import type { ScanRow } from '../db/schema.js';
import {
  createPositionRepository,
  type PositionRepository,
} from '../repositories/position-repository.js';
import {
  createSampleRepository,
  type SampleDrawing,
  type SampleInContext,
  type SampleRepository,
} from '../repositories/sample-repository.js';
import {
  createTavolaRepository,
  type TavolaRepository,
} from '../repositories/tavola-repository.js';
import { sampleDrawingKeyPrefix, type FileStore } from '../storage/file-store.js';
import { discardImageFiles } from '../storage/stored-images.js';
import { toCatalogModel } from './catalog-view.js';

/**
 * **Showing a Published Tavola to Visitors** (ADR 0019, issue #129): an Administrator's decision,
 * made from the Tavola, with one of its numbers open.
 *
 * The one thing here that is more than a row is the drawing. A Sample is shown with a smaller
 * public copy of its Scan, made when it is marked, made again when the Scan under it changes, and
 * deleted when it stops being one — so the Scan itself never has to be reachable by anybody who
 * has not signed in.
 */
export interface SampleService {
  /**
   * Shows the Tavola with this number open, or opens this number on a Tavola already shown.
   * Refused for an Unchecked Tavola, a Tavola with no Scan to copy, and a number on another sheet.
   */
  show(tavolaId: string, positionId: string, accountId: string): Promise<TavolaSample>;
  /** Stops showing it, and deletes its public copy. */
  stop(tavolaId: string): Promise<void>;
  /** `null` when the Tavola is not shown. */
  ofTavola(tavolaId: string): Promise<TavolaSample | null>;
  list(): Promise<SamplesResponse['samples']>;
  /**
   * A new copy from the Tavola's current Scan, for a Sample whose Scan was replaced or turned:
   * the copy is of the drawing the Marks are on. Nothing happens for a Tavola that is not shown.
   */
  redraw(tavolaId: string): Promise<void>;
  /** `null` for an address that is not a Sample's drawing, or no longer is one. */
  openDrawing(drawingId: string): Promise<StoredImage | null>;
}

function toTavolaSample(row: SampleInContext): TavolaSample {
  return {
    open: { positionId: row.positionId, number: row.position.number },
    markedAt: row.markedAt.toISOString(),
    markedBy: row.marker?.name ?? null,
    drawing: {
      url: sampleDrawingUrl(row.drawingId),
      width: row.drawingWidth,
      height: row.drawingHeight,
    },
  };
}

export function createSampleService(dependencies: {
  tavolaRepository: TavolaRepository;
  positionRepository: PositionRepository;
  sampleRepository: SampleRepository;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
}): SampleService {
  const { tavolaRepository, positionRepository, sampleRepository, fileStore, clock, logger } =
    dependencies;

  /** The copy written to the store, and the columns that say where it is. */
  async function copyDrawing(scan: ScanRow): Promise<SampleDrawing> {
    const file = await fileStore.open(scan.displayKey);
    if (!file) {
      logger.error({ scanId: scan.id, key: scan.displayKey }, 'A Scan’s display image is missing');
      throw new ConflictError('The drawing behind this Scan is missing, so it cannot be shown.');
    }
    const copy = await prepareSampleDrawing(await buffer(file.stream()));

    const drawingId = randomUUID();
    const drawingKey = `${sampleDrawingKeyPrefix(drawingId)}/drawing.webp`;
    await fileStore.write(drawingKey, copy.contents);
    return {
      drawingId,
      drawingKey,
      drawingWidth: copy.width,
      drawingHeight: copy.height,
      drawingByteSize: copy.byteSize,
    };
  }

  /** After the row no longer names it, never before: a Sample must not point at nothing. */
  function discardDrawing(drawingId: string): Promise<void> {
    return discardImageFiles(fileStore, sampleDrawingKeyPrefix(drawingId));
  }

  async function shown(tavolaId: string): Promise<TavolaSample> {
    const row = await sampleRepository.findByTavola(tavolaId);
    if (!row) {
      throw new ConflictError('This Tavola stopped being shown while it was being changed.');
    }
    return toTavolaSample(row);
  }

  return {
    async show(tavolaId, positionId, accountId) {
      const tavola = await tavolaRepository.findById(tavolaId);
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }
      if (tavola.state !== 'published') {
        throw new ConflictError(
          'Only a Published Tavola can be shown to Visitors. Check it and publish it first.',
        );
      }
      const position = await positionRepository.findById(positionId);
      if (!position || position.tavolaId !== tavolaId) {
        throw new NotFoundError('No such Position on this Tavola.');
      }

      if (await sampleRepository.open(tavolaId, positionId)) {
        return shown(tavolaId);
      }

      if (!tavola.scan) {
        throw new ConflictError(
          'This Tavola has no Scan yet, so there is no drawing to show Visitors.',
        );
      }
      const drawing = await copyDrawing(tavola.scan);

      let added: boolean;
      try {
        added = await sampleRepository.add({
          tavolaId,
          positionId,
          markedAt: clock.now(),
          markedBy: accountId,
          ...drawing,
        });
      } catch (error) {
        await discardDrawing(drawing.drawingId);
        throw error;
      }
      if (!added) {
        // Somebody else showed it in the meantime, with a copy of their own. Theirs stays, and
        // the number asked for here is the one opened.
        await discardDrawing(drawing.drawingId);
        await sampleRepository.open(tavolaId, positionId);
      }
      return shown(tavolaId);
    },

    async stop(tavolaId) {
      const removed = await sampleRepository.remove(tavolaId);
      if (!removed) {
        throw new NotFoundError('This Tavola is not shown to Visitors.');
      }
      await discardDrawing(removed.drawingId);
    },

    async ofTavola(tavolaId) {
      const row = await sampleRepository.findByTavola(tavolaId);
      return row ? toTavolaSample(row) : null;
    },

    async list() {
      const rows = await sampleRepository.list();
      return rows.map((row) => ({
        ...toTavolaSample(row),
        tavola: {
          id: row.tavola.id,
          number: row.tavola.number,
          nameIt: row.tavola.nameIt,
          nameEn: row.tavola.nameEn,
          model: toCatalogModel(row.tavola.model),
        },
      }));
    },

    async redraw(tavolaId) {
      const tavola = await tavolaRepository.findById(tavolaId);
      if (!tavola?.scan || !(await sampleRepository.findByTavola(tavolaId))) {
        return;
      }

      const drawing = await copyDrawing(tavola.scan);
      let before;
      try {
        before = await sampleRepository.redraw(tavolaId, drawing);
      } catch (error) {
        await discardDrawing(drawing.drawingId);
        throw error;
      }
      // Stopped meanwhile: the new copy has nothing to belong to.
      await discardDrawing(before ? before.drawingId : drawing.drawingId);
    },

    async openDrawing(drawingId) {
      const row = await sampleRepository.findByDrawing(drawingId);
      if (!row) {
        return null;
      }
      const file = await fileStore.open(row.drawingKey);
      if (!file) {
        logger.error({ drawingId, key: row.drawingKey }, 'A Sample’s drawing is missing');
        return null;
      }
      return {
        contentType: 'image/webp',
        byteSize: file.byteSize,
        etag: `"${row.drawingId}"`,
        stream: file.stream,
      };
    },
  };
}

/**
 * The same, built on a database alone — for what ingests a Scan outside the application (the
 * archive loaders, the practice archive), so a Scan written there copies a Sample's drawing again
 * exactly as one uploaded by an Editor does.
 */
export function createSampleServiceOn(
  db: DbSession,
  edges: { fileStore: FileStore; clock: Clock; logger: Logger },
): SampleService {
  return createSampleService({
    tavolaRepository: createTavolaRepository(db),
    positionRepository: createPositionRepository(db),
    sampleRepository: createSampleRepository(db),
    ...edges,
  });
}
