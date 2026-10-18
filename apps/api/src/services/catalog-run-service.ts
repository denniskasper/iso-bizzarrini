import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CatalogRun } from '@ricambi/contracts';
import type { ConfiguredReading } from '../composition/reading.js';
import {
  ConflictError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import { Spending, rounded } from '../reading/cost.js';
import { estimatePage } from '../reading/estimate.js';
import { PdfNotReadable, pdfPageCount, pdfPages } from '../reading/pdf-pages.js';
import { PRICE_LIST, priceOf } from '../reading/price-list.js';
import type {
  CatalogRunRepository,
  CatalogRunWithModel,
} from '../repositories/catalog-run-repository.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import { catalogRunKeyPrefix, type FileStore, type StoredFile } from '../storage/file-store.js';

export interface NewCatalogRun {
  modelId: string;
  firstPage: number;
  lastPage: number;
  catalog: Buffer;
  /** The Administrator uploading it. */
  by: string;
}

/**
 * **Catalog runs** (ADR 0018). For now, the first step of one (issue #57): an Administrator
 * uploads the catalog PDF, says which Model it is for and which pages to read, and is told what
 * reading them would cost. Nothing is sent to be read.
 */
export interface CatalogRunService {
  estimate(request: NewCatalogRun): Promise<CatalogRun>;
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
}): CatalogRunService {
  const { reading, catalogRunRepository, modelRepository, fileStore, clock } = dependencies;

  const catalogKey = (runId: string) => join(catalogRunKeyPrefix(runId), 'catalog.pdf');

  async function find(runId: string): Promise<CatalogRun> {
    const found = await catalogRunRepository.findById(runId);
    if (!found) {
      throw new NotFoundError('No such Catalog run.');
    }
    return toCatalogRun(found);
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

    async openCatalog(runId) {
      const found = await catalogRunRepository.findById(runId);
      return found ? fileStore.open(found.run.catalogKey) : null;
    },
  };
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

function toCatalogRun({ run, model }: CatalogRunWithModel): CatalogRun {
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
  };
}
