import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { CatalogRun, CatalogRunTavola } from '@ricambi/contracts';
import type { ConfiguredReading } from '../composition/reading.js';
import type { Db } from '../db/client.js';
import {
  ConflictError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import { ReadCatalogError, readCatalogInto } from '../reading/catalog-reading.js';
import { Spending, dollars, rounded } from '../reading/cost.js';
import { estimatePage } from '../reading/estimate.js';
import { PdfNotReadable, pdfPageCount, pdfPages } from '../reading/pdf-pages.js';
import { PRICE_LIST, priceOf } from '../reading/price-list.js';
import type {
  CatalogRunRepository,
  CatalogRunWithModel,
} from '../repositories/catalog-run-repository.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import { catalogRunKeyPrefix, type FileStore, type StoredFile } from '../storage/file-store.js';
import { catalogRunStore } from './catalog-run-store.js';

export interface NewCatalogRun {
  modelId: string;
  firstPage: number;
  lastPage: number;
  catalog: Buffer;
  /** The Administrator uploading it. */
  by: string;
}

/**
 * **Catalog runs** (ADR 0018). An Administrator uploads the catalog PDF, says which Model it is
 * for and which pages to read, and is told what reading them would cost (issue #57). Nothing is
 * sent to be read until they start it with a spending limit (issue #58).
 *
 * A started run reads **in the background, in this process**, one at a time, so the Administrator
 * can close the page and come back. Its progress is kept in the database as it goes, and each
 * Tavola it finishes is in the archive as Unchecked straight away (`catalog-run-store.ts`).
 */
export interface CatalogRunService {
  estimate(request: NewCatalogRun): Promise<CatalogRun>;
  /**
   * An estimated run started, held to `limit` dollars. Answers as soon as it is running; the
   * reading goes on after the request has been answered.
   */
  start(runId: string, start: { limit: number; by: string }): Promise<CatalogRun>;
  find(runId: string): Promise<CatalogRun>;
  /** The uploaded PDF, or `null` when there is no such run. */
  openCatalog(runId: string): Promise<StoredFile | null>;
}

const PDF_SIGNATURE = '%PDF-';

export function createCatalogRunService(dependencies: {
  reading: ConfiguredReading;
  catalogRunRepository: CatalogRunRepository;
  modelRepository: ModelRepository;
  fileStore: FileStore;
  clock: Clock;
  db: Db;
  logger: Logger;
}): CatalogRunService {
  const { reading, catalogRunRepository, modelRepository, fileStore, clock, logger } = dependencies;

  const catalogKey = (runId: string) => join(catalogRunKeyPrefix(runId), 'catalog.pdf');

  async function find(runId: string): Promise<CatalogRun> {
    const found = await catalogRunRepository.findById(runId);
    if (!found) {
      throw new NotFoundError('No such Catalog run.');
    }
    return toCatalogRun(found);
  }

  /** The run itself, from its catalog to its end, while nobody waits for it. */
  async function read(
    runId: string,
    method: NonNullable<ConfiguredReading['method']>,
    limit: number,
  ): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), 'ricambi-catalog-run-'));
    try {
      const found = await catalogRunRepository.findById(runId);
      const catalog = found && (await fileStore.open(found.run.catalogKey));
      if (!found || !catalog) {
        throw new Error(`Catalog run ${runId} has no catalog to read.`);
      }
      const pdf = join(directory, 'catalog.pdf');
      await pipeline(catalog.stream(), createWriteStream(pdf));

      await readCatalogInto({
        method,
        pages: pdfPages({ first: found.run.firstPage, last: found.run.lastPage })(pdf),
        limit,
        store: catalogRunStore({
          runId,
          model: found.model,
          db: dependencies.db,
          catalogRunRepository,
          fileStore,
          clock,
          logger,
        }),
        print: (line) => logger.info({ runId }, line),
      });
    } catch (error) {
      logger.error({ err: error, runId }, 'A Catalog run failed');
      await catalogRunRepository
        .ended(runId, { state: 'failed', failure: failureOf(error) }, clock.now())
        .catch((failed: unknown) => {
          logger.error({ err: failed, runId }, 'Could not record that a Catalog run failed');
        });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  return {
    find,

    async estimate({ modelId, firstPage, lastPage, catalog, by }) {
      const { method, kind } = reading;
      if (!method || !kind) {
        throw new ConflictError(`Nothing can be read. ${reading.unavailable ?? ''}`.trim());
      }
      const price = priceOf(method.model);
      if (!price) {
        throw new ConflictError(
          `The price list has no price for ${method.model}, so what reading costs cannot be known.`,
        );
      }

      const model = await modelRepository.findById(modelId);
      if (!model) {
        throw new NotFoundError('No such Model.');
      }

      // What the file is is decided by reading it, never by what the request said it was.
      if (catalog.subarray(0, PDF_SIGNATURE.length).toString('latin1') !== PDF_SIGNATURE) {
        throw new UnsupportedMediaTypeError('That is not a PDF. Upload the catalog as a PDF.');
      }

      // Poppler reads from a file. The copy is the request's own and goes with it; the catalog
      // is only kept once it has been read and priced.
      const directory = await mkdtemp(join(tmpdir(), 'ricambi-catalog-'));
      let catalogPages: number;
      let estimate = 0;
      try {
        const pdf = join(directory, 'catalog.pdf');
        await writeFile(pdf, catalog);

        catalogPages = await notReadableAsUnsupported(() => pdfPageCount(pdf));
        if (lastPage > catalogPages) {
          throw new ValidationError(
            `The catalog has ${catalogPages} ${catalogPages === 1 ? 'page' : 'pages'}, so there ` +
              `is no page ${lastPage} to read.`,
          );
        }

        // Priced as the read command prices a run. The limit comes when the run is started.
        const spending = new Spending(Number.POSITIVE_INFINITY, price);
        await notReadableAsUnsupported(async () => {
          for await (const page of pdfPages({ first: firstPage, last: lastPage })(pdf)) {
            estimate += (await estimatePage(method, spending, page)).cost;
          }
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }

      // The id is minted here, because the catalog is written before the row is, under it.
      const id = randomUUID();
      const key = catalogKey(id);
      await fileStore.write(key, catalog);
      try {
        await catalogRunRepository.add({
          id,
          modelId,
          state: 'estimated',
          catalogKey: key,
          catalogByteSize: catalog.byteLength,
          catalogPages,
          firstPage,
          lastPage,
          readingMethod: kind,
          charged: method.charged,
          pricedModel: method.model,
          pricesCheckedOn: PRICE_LIST.checkedOn,
          estimate: rounded(estimate),
          createdAt: clock.now(),
          createdBy: by,
        });
      } catch (error) {
        await fileStore.remove(catalogRunKeyPrefix(id));
        throw error;
      }

      return find(id);
    },

    async start(runId, { limit, by }) {
      const { method } = reading;
      if (!method) {
        throw new ConflictError(`Nothing can be read. ${reading.unavailable ?? ''}`.trim());
      }
      const found = await catalogRunRepository.findById(runId);
      if (!found) {
        throw new NotFoundError('No such Catalog run.');
      }
      if (found.run.state !== 'estimated') {
        throw new ConflictError('This Catalog run has been started already.');
      }
      if (found.run.estimate > limit) {
        throw new ValidationError(
          `The estimate, ${dollars(found.run.estimate)}, is above the limit of ${dollars(limit)}. ` +
            'Nothing was read. Give a higher limit, or read fewer pages.',
        );
      }

      const started = await catalogRunRepository.start(runId, { limit, at: clock.now(), by });
      if (started === 'another is running') {
        throw new ConflictError(
          'Another Catalog run is reading. Runs go one at a time: start this one when it has ' +
            'finished.',
        );
      }
      if (started === 'not estimated') {
        throw new ConflictError('This Catalog run has been started already.');
      }

      void read(runId, method, limit);
      return find(runId);
    },

    async openCatalog(runId) {
      const found = await catalogRunRepository.findById(runId);
      return found ? fileStore.open(found.run.catalogKey) : null;
    },
  };
}

/**
 * Why a run failed, as the run page says it. A refusal of the reading's own is said as it is; any
 * other error is only named, because what a model or its client says may carry a credential.
 */
function failureOf(error: unknown): string {
  if (error instanceof ReadCatalogError) {
    return error.message;
  }
  if (error instanceof PdfNotReadable) {
    return 'The catalog could not be read as a PDF.';
  }
  return (
    'Reading stopped on an error, which the server has logged. Every Tavola finished before it ' +
    'is in the archive, Unchecked.'
  );
}

async function notReadableAsUnsupported<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof PdfNotReadable) {
      throw new UnsupportedMediaTypeError(
        'That PDF could not be read. Upload the catalog as it was scanned, as one PDF.',
      );
    }
    throw error;
  }
}

function toCatalogRun({ run, model, tavole }: CatalogRunWithModel): CatalogRun {
  return {
    id: run.id,
    state: run.state,
    model: { id: model.id, brand: model.brand, name: model.name, series: model.series },
    pages: { first: run.firstPage, last: run.lastPage },
    catalogPages: run.catalogPages,
    estimate: run.estimate,
    readingMethod: run.readingMethod,
    charged: run.charged,
    priceList: { model: run.pricedModel, checkedOn: run.pricesCheckedOn },
    createdAt: run.createdAt.toISOString(),
    limit: run.spendingLimit,
    spent: run.spent,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    failure: run.failure,
    tavole: tavoleOf(run.cost?.tavole ?? [], tavole),
  };
}

/**
 * Each Tavola as the cost record has it, in the order the run reads them, with what the loader
 * made of the finished ones.
 */
function tavoleOf(
  costed: NonNullable<CatalogRunWithModel['run']['cost']>['tavole'],
  loaded: CatalogRunWithModel['tavole'],
): CatalogRunTavola[] {
  const byNumber = new Map(loaded.map((tavola) => [tavola.number, tavola]));
  return costed.map(({ number, finished, cost }) => ({
    number,
    finished,
    cost,
    tavolaId: byNumber.get(number)?.tavolaId ?? null,
    refused: byNumber.get(number)?.refused ?? null,
  }));
}
