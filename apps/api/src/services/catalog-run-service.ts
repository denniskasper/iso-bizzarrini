import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type {
  CatalogRun,
  CatalogRunCostRecord,
  CatalogRunListed,
  CatalogRunSpent,
  CatalogRunTavola,
} from '@ricambi/contracts';
import { discardTavola, removeDiscardedFiles } from '../catalog/discard-tavola.js';
import type { ConfiguredReading } from '../composition/reading.js';
import type { Db } from '../db/client.js';
import {
  ConflictError,
  HttpError,
  NotFoundError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../http/errors.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import {
  EstimateAboveLimit,
  ReadCatalogError,
  readCatalogInto,
} from '../reading/catalog-reading.js';
import { Spending, dollars, rounded, type CostRecord, type Spent } from '../reading/cost.js';
import { estimatePage } from '../reading/estimate.js';
import { PdfNotReadable, pdfPageCount, pdfPages, pdfPagesNamed } from '../reading/pdf-pages.js';
import { PRICE_LIST, priceOf } from '../reading/price-list.js';
import type { SheetIdentity } from '../reading/reading-method.js';
import {
  STOPPED_STATES,
  type CatalogRunRepository,
  type CatalogRunWithModel,
  type TavolaToReadAgain,
} from '../repositories/catalog-run-repository.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import {
  catalogRunKeyPrefix,
  setAsidePageKey,
  type FileStore,
  type StoredFile,
} from '../storage/file-store.js';
import { catalogRunStore } from './catalog-run-store.js';

export interface NewCatalogRun {
  modelId: string;
  firstPage: number;
  lastPage: number;
  /** The PDF as it arrives, written to the file store a chunk at a time and never held whole. */
  catalog: Readable;
  /** How large the request said it was, where it said: one too large is refused unread. */
  declaredBytes: number | null;
  /** The Administrator uploading it. */
  by: string;
}

/**
 * **Catalog runs** (ADR 0018). An Administrator uploads the catalog PDF, says which Model it is
 * for and which pages to read, and is told what reading them would cost (issue #57). Nothing is
 * sent to be read until they start it with a spending limit (issue #58).
 *
 * A scanned catalog runs to hundreds of megabytes and pages (issue #65). The upload goes to the
 * file store as it arrives, and is answered once it is stored; its pages are priced after that,
 * in the background, as a run is read. An estimate is the one thing being read, as a run is, and
 * one a restart cuts off is priced on by the next server from the page it had reached.
 *
 * A started run reads **in the background, in this process**, one at a time, so the Administrator
 * can close the page and come back. Its progress is kept in the database as it goes, and each
 * Tavola it finishes is in the archive as Unchecked straight away (`catalog-run-store.ts`).
 *
 * A run that stops part-way loses nothing and never pays twice (issue #59). It stops at its limit,
 * at the plan's usage limit, when the model fails or declines, or when an Administrator presses
 * Stop, and an Administrator continues it, raising its limit first where that is what stopped it.
 * Every merge redeploys the preview, so a server going away mid-run is the normal case: the run
 * is left running, and the next server to start carries it on from its last finished step.
 *
 * One Unchecked Tavola read badly can be read again on its own (issue #61): a run of its own,
 * reading only the pages the run that read it found it on, from that run's catalog, with what
 * those pages were found to be carried over. The loader replaces the Tavola whole when it finishes.
 *
 * Every run is kept, with the record of what it cost (issue #62), and listed the latest first.
 */
export interface CatalogRunService {
  /**
   * A catalog stored and its run `estimating`. Answers once it is stored; its pages are priced
   * after the request has been answered. What is refused is refused before anything is stored.
   */
  estimate(request: NewCatalogRun): Promise<CatalogRun>;
  /**
   * An estimated run started, held to `limit` dollars. Answers as soon as it is running; the
   * reading goes on after the request has been answered.
   */
  start(runId: string, start: { limit: number; by: string }): Promise<CatalogRun>;
  find(runId: string): Promise<CatalogRun>;
  /** Every run, the latest first. */
  list(): Promise<CatalogRunListed[]>;
  /** The uploaded PDF, or `null` when there is no such run. */
  openCatalog(runId: string): Promise<StoredFile | null>;
  /** The image of a page the run set aside, or `null` when it set no such page aside. */
  openSetAsidePage(runId: string, page: number): Promise<StoredFile | null>;
  /**
   * A stopped run read on from where it stopped, its limit raised to `limit` first where one is
   * given. Answers as soon as it is running again.
   */
  carryOn(runId: string, carryOn: { limit?: number; by: string }): Promise<CatalogRun>;
  /** A running run asked to stop before its next request. Answers before it has stopped. */
  stop(runId: string, stop: { by: string }): Promise<CatalogRun>;
  /**
   * An estimated run that reads one Unchecked Tavola again from the catalog it was read from, and
   * nothing else (issue #61). Started, stopped and continued as any other run. Refused for a
   * Published Tavola, for one with Contributions on its Positions, and for one no run read.
   */
  readAgain(tavolaId: string, readAgain: { by: string }): Promise<CatalogRun>;
  /**
   * An Unchecked Tavola removed whole (issue #83), by the rule reading it again replaces it by
   * (`discardTavola`), answering with the Model it belonged to. Refused for a Published Tavola,
   * for one with Contributions on its Positions, and while any run is read or estimated.
   */
  removeTavola(tavolaId: string): Promise<{ modelId: string }>;
  /** The run that read a Tavola, or `null` where none did. */
  readBy(tavolaId: string): Promise<string | null>;
  /**
   * Every run left running or being estimated when the server last went away, carried on. Once,
   * on starting.
   */
  pickUp(): Promise<void>;
  /**
   * The process is going away. Every run reading here stops before its next request and records
   * nothing more, so it is still running for the next server to pick up.
   */
  interrupt(): void;
}

const PDF_SIGNATURE = '%PDF-';

const ANOTHER_IS_READING =
  'Another Catalog run is being estimated or is reading. Runs go one at a time: try again once ' +
  'it has finished.';

export function createCatalogRunService(dependencies: {
  reading: ConfiguredReading;
  catalogRunRepository: CatalogRunRepository;
  modelRepository: ModelRepository;
  fileStore: FileStore;
  clock: Clock;
  db: Db;
  logger: Logger;
  /** The largest catalog PDF that may be uploaded, in bytes. */
  maxCatalogBytes: number;
}): CatalogRunService {
  const { reading, catalogRunRepository, modelRepository, fileStore, clock, logger } = dependencies;
  const { maxCatalogBytes } = dependencies;

  const catalogKey = (runId: string) => join(catalogRunKeyPrefix(runId), 'catalog.pdf');

  async function find(runId: string): Promise<CatalogRun> {
    const found = await catalogRunRepository.findById(runId);
    if (!found) {
      throw new NotFoundError('No such Catalog run.');
    }
    return toCatalogRun(found);
  }

  const interrupted = new AbortController();
  /** The runs reading in this process, and whether an Administrator has asked each to stop. */
  const readers = new Map<string, { stopAsked: boolean }>();

  /**
   * The run itself, from where it is to its end, while nobody waits for it. Held to what is left
   * of its limit: what it spent before a stop or a restart counts against it.
   */
  async function read(
    runId: string,
    method: NonNullable<ConfiguredReading['method']>,
  ): Promise<void> {
    const reader = { stopAsked: false };
    readers.set(runId, reader);
    // Nothing here may escape: nobody awaits a run, and a rejection nobody handles stops the
    // whole server. Whatever goes wrong, even making the scratch directory, ends the run instead.
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), 'ricambi-catalog-run-'));
      // A request a server before this one sent and never heard back from was paid for all the
      // same, and counts against what is left of the limit.
      await catalogRunRepository.cutOff(runId);
      const found = await catalogRunRepository.findById(runId);
      const catalog = found && (await fileStore.open(found.run.catalogKey));
      if (!found || !catalog) {
        throw new Error(`Catalog run ${runId} has no catalog to read.`);
      }
      const limit = rounded((found.run.spendingLimit ?? 0) - found.run.spent);
      if (limit <= 0) {
        await catalogRunRepository.ended(
          runId,
          {
            state: 'stopped-at-limit',
            failure: 'Nothing is left of its limit. Raise the limit to continue.',
          },
          clock.now(),
        );
        return;
      }
      const pdf = join(directory, 'catalog.pdf');
      await pipeline(catalog.stream(), createWriteStream(pdf));

      await readCatalogInto({
        method,
        pages: (found.run.readsAgain
          ? pdfPagesNamed(found.run.readsAgain.pages)
          : pdfPages({ first: found.run.firstPage, last: found.run.lastPage }))(pdf),
        limit,
        stopAsked: () => reader.stopAsked,
        interrupted: interrupted.signal,
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
      if (interrupted.signal.aborted) {
        logger.info({ runId }, 'A Catalog run was left running, for the next start to carry on');
        return;
      }
      const end =
        error instanceof EstimateAboveLimit
          ? ({
              state: 'stopped-at-limit',
              failure:
                `What is left to read is estimated at ${dollars(error.estimate)}, and ` +
                `${dollars(error.limit)} is left of the limit. Nothing more was read. Raise the ` +
                'limit to continue.',
            } as const)
          : ({ state: 'failed', failure: failureOf(error) } as const);
      if (end.state === 'failed') {
        logger.error({ err: error, runId }, 'A Catalog run failed');
      }
      await catalogRunRepository.ended(runId, end, clock.now()).catch((failed: unknown) => {
        logger.error({ err: failed, runId }, 'Could not record how a Catalog run ended');
      });
    } finally {
      readers.delete(runId);
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch((failed: unknown) => {
          logger.warn({ err: failed, runId }, 'Could not remove a Catalog run’s scratch directory');
        });
      }
    }
  }

  /** The runs being estimated in this process. */
  const estimators = new Set<string>();

  /**
   * A stored catalog's pages priced, from the first not yet priced to the last, while nobody waits
   * for it (issue #65). Each page is kept as it is priced, so a server that goes away loses at
   * most the page in hand, and the next one prices on from there. As for a run, nothing escapes.
   */
  async function estimateRest(runId: string): Promise<void> {
    estimators.add(runId);
    let directory: string | undefined;
    try {
      const { method, price } = pricedMethod();
      directory = await mkdtemp(join(tmpdir(), 'ricambi-catalog-estimate-'));
      const found = await catalogRunRepository.findById(runId);
      const catalog = found && (await fileStore.open(found.run.catalogKey));
      if (!found || !catalog) {
        throw new Error(`Catalog run ${runId} has no catalog to estimate.`);
      }
      const pdf = join(directory, 'catalog.pdf');
      await pipeline(catalog.stream(), createWriteStream(pdf));

      const { firstPage, lastPage } = found.run;
      let after = found.run.pagesEstimated;
      let estimate = found.run.estimate;
      // A page at a time, rather than every page rendered before the first is priced, so that the
      // estimate moves while an Administrator watches it.
      const pages = Array.from(
        { length: lastPage - firstPage + 1 - after },
        (_, index) => firstPage + after + index,
      );
      const spending = new Spending(Number.POSITIVE_INFINITY, price);
      for await (const page of pdfPagesNamed(pages)(pdf)) {
        const { cost } = await estimatePage(method, spending, page);
        if (interrupted.signal.aborted) {
          return;
        }
        estimate += cost;
        if (!(await catalogRunRepository.pageEstimated(runId, { after, estimate }))) {
          // Priced by another server, or no longer being estimated: it is not this one's to do.
          return;
        }
        after += 1;
      }
      await catalogRunRepository.estimated(runId, rounded(estimate));
    } catch (error) {
      if (interrupted.signal.aborted) {
        logger.info(
          { runId },
          'A catalog was left being estimated, for the next start to carry on',
        );
        return;
      }
      logger.error({ err: error, runId }, 'Estimating a catalog failed');
      await catalogRunRepository
        .ended(runId, { state: 'failed', failure: estimateFailureOf(error) }, clock.now())
        .catch((failed: unknown) => {
          logger.error({ err: failed, runId }, 'Could not record how estimating a catalog ended');
        });
    } finally {
      estimators.delete(runId);
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch((failed: unknown) => {
          logger.warn({ err: failed, runId }, 'Could not remove an estimate’s scratch directory');
        });
      }
    }
  }

  /**
   * The upload written to `pdf` as it arrives, refused as soon as it is too large or is not a PDF,
   * and its size in bytes. The request is only stopped, never destroyed, so it can still be told.
   */
  async function received(catalog: Readable, pdf: string): Promise<number> {
    let bytes = 0;
    let head = Buffer.alloc(0);
    await pipeline(async function* () {
      for await (const chunk of catalog.iterator({
        destroyOnReturn: false,
      }) as AsyncIterable<Buffer>) {
        bytes += chunk.byteLength;
        if (bytes > maxCatalogBytes) {
          throw tooLarge();
        }
        // What the file is is decided by reading it, never by what the request said it was.
        if (head.byteLength < PDF_SIGNATURE.length) {
          head = Buffer.concat([head, chunk]).subarray(0, PDF_SIGNATURE.length);
          if (!PDF_SIGNATURE.startsWith(head.toString('latin1'))) {
            throw notAPdf();
          }
        }
        yield chunk;
      }
    }, createWriteStream(pdf));
    if (bytes === 0) {
      throw new ValidationError('That upload was empty.');
    }
    if (head.toString('latin1') !== PDF_SIGNATURE) {
      throw notAPdf();
    }
    return bytes;
  }

  function tooLarge(): HttpError {
    return new HttpError(
      413,
      'payload_too_large',
      `A catalog may be up to ${megabytes(maxCatalogBytes)}, and that one was larger than this ` +
        'archive accepts.',
    );
  }

  function methodOrRefuse(): NonNullable<ConfiguredReading['method']> {
    if (!reading.method) {
      throw new ConflictError(`Nothing can be read. ${reading.unavailable ?? ''}`.trim());
    }
    return reading.method;
  }

  /** The method, and its price, without which nothing is estimated. */
  function pricedMethod() {
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
    return { method, kind, price };
  }

  /**
   * Why a Tavola may not be read again, if it may not: the loader would refuse to replace it, so
   * nothing is paid for that it would throw away.
   */
  function refuseToReadAgain(tavola: TavolaToReadAgain | null): void {
    if (tavola?.state === 'published') {
      throw new ConflictError(
        'This Tavola is Published: an Editor has checked it, and it is corrected in Ricambi ' +
          'rather than read again.',
      );
    }
    if (tavola?.hasContributions) {
      throw new ConflictError(
        'Its Positions have Contributions, which reading it again would lose. Review them first.',
      );
    }
  }

  async function found(runId: string): Promise<CatalogRunWithModel> {
    const run = await catalogRunRepository.findById(runId);
    if (!run) {
      throw new NotFoundError('No such Catalog run.');
    }
    return run;
  }

  return {
    find,

    async list() {
      return (await catalogRunRepository.list()).map(({ run, model }) => ({
        id: run.id,
        model: modelOf(model),
        state: run.state,
        createdAt: run.createdAt.toISOString(),
        startedAt: run.startedAt?.toISOString() ?? null,
        spent: run.spent,
        estimate: run.estimate,
        readingMethod: run.readingMethod,
        charged: run.charged,
        readsAgain: run.readsAgain,
      }));
    },

    async estimate({ modelId, firstPage, lastPage, catalog, declaredBytes, by }) {
      const { method, kind } = pricedMethod();

      const model = await modelRepository.findById(modelId);
      if (!model) {
        throw new NotFoundError('No such Model.');
      }
      if (await catalogRunRepository.busy()) {
        throw new ConflictError(ANOTHER_IS_READING);
      }
      if (declaredBytes !== null && declaredBytes > maxCatalogBytes) {
        throw tooLarge();
      }

      // Poppler reads from a file. The copy is the request's own and goes with it; the catalog
      // is only kept once it is known to be one, with the pages asked for.
      const directory = await mkdtemp(join(tmpdir(), 'ricambi-catalog-'));
      // The id is minted here, because the catalog is written before the row is, under it.
      const id = randomUUID();
      try {
        const pdf = join(directory, 'catalog.pdf');
        const byteSize = await received(catalog, pdf);

        const catalogPages = await notReadableAsUnsupported(() => pdfPageCount(pdf));
        if (lastPage > catalogPages) {
          throw new ValidationError(
            `The catalog has ${catalogPages} ${catalogPages === 1 ? 'page' : 'pages'}, so there ` +
              `is no page ${lastPage} to read.`,
          );
        }

        const key = catalogKey(id);
        await fileStore.writeFrom(key, createReadStream(pdf));
        const added = await catalogRunRepository
          .add({
            id,
            modelId,
            state: 'estimating',
            catalogKey: key,
            catalogByteSize: byteSize,
            catalogPages,
            firstPage,
            lastPage,
            readingMethod: kind,
            charged: method.charged,
            pricedModel: method.model,
            pricesCheckedOn: PRICE_LIST.checkedOn,
            estimate: 0,
            createdAt: clock.now(),
            createdBy: by,
          })
          .catch(async (error: unknown) => {
            await fileStore.remove(catalogRunKeyPrefix(id));
            throw error;
          });
        if (added === 'another is reading') {
          await fileStore.remove(catalogRunKeyPrefix(id));
          throw new ConflictError(ANOTHER_IS_READING);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }

      // As it was stored, before a page of it is priced; the run page follows the rest.
      const run = await find(id);
      void estimateRest(id);
      return run;
    },

    async start(runId, { limit, by }) {
      const method = methodOrRefuse();
      const { run } = await found(runId);
      if (run.state === 'estimating') {
        throw new ConflictError(
          'This catalog is still being estimated. Start it once its estimate is there.',
        );
      }
      if (run.state !== 'estimated') {
        throw new ConflictError('This Catalog run has been started already.');
      }
      if (run.readsAgain) {
        refuseToReadAgain(
          await catalogRunRepository.tavolaToReadAgain({
            modelId: run.modelId,
            number: run.readsAgain.tavola,
          }),
        );
      }
      if (run.estimate > limit) {
        throw new ValidationError(
          `The estimate, ${dollars(run.estimate)}, is above the limit of ${dollars(limit)}. ` +
            'Nothing was read. Give a higher limit, or read fewer pages.',
        );
      }

      const at = clock.now();
      const started = await catalogRunRepository.start(runId, { limit, at, by });
      if (started === 'another is running') {
        throw new ConflictError(ANOTHER_IS_READING);
      }
      if (started === 'not estimated') {
        throw new ConflictError('This Catalog run has been started already.');
      }
      await catalogRunRepository.recordAction(runId, { action: 'started', by, at, limit });

      void read(runId, method);
      return find(runId);
    },

    async carryOn(runId, { limit, by }) {
      const method = methodOrRefuse();
      const { run } = await found(runId);
      if (!STOPPED_STATES.some((state) => state === run.state)) {
        throw new ConflictError(
          run.state === 'running'
            ? 'This Catalog run is reading already.'
            : 'Only a stopped Catalog run can be continued.',
        );
      }
      const current = run.spendingLimit ?? 0;
      if (limit !== undefined && limit <= current) {
        throw new ValidationError(
          `A raised limit is above the present one, ${dollars(current)}. Give a higher limit, ` +
            'or continue without one.',
        );
      }
      if (limit === undefined && run.state === 'stopped-at-limit') {
        throw new ValidationError(
          `It stopped at its limit of ${dollars(current)}, with ${dollars(run.spent)} spent. ` +
            'Raise the limit to continue.',
        );
      }

      const carried = await catalogRunRepository.carryOn(runId, { limit: limit ?? current });
      if (carried === 'another is running') {
        throw new ConflictError(ANOTHER_IS_READING);
      }
      if (carried === 'not stopped') {
        throw new ConflictError('Only a stopped Catalog run can be continued.');
      }
      const at = clock.now();
      if (limit !== undefined) {
        await catalogRunRepository.recordAction(runId, { action: 'raised', by, at, limit });
      }
      await catalogRunRepository.recordAction(runId, { action: 'continued', by, at });

      void read(runId, method);
      return find(runId);
    },

    async stop(runId, { by }) {
      const { run } = await found(runId);
      if (run.state !== 'running') {
        throw new ConflictError('This Catalog run is not reading, so there is nothing to stop.');
      }
      await catalogRunRepository.recordAction(runId, { action: 'stopped', by, at: clock.now() });
      const reader = readers.get(runId);
      if (reader) {
        reader.stopAsked = true;
      } else {
        // Running in the database and reading nowhere: there is no request to stop before.
        await catalogRunRepository.ended(
          runId,
          { state: 'stopped-by-administrator', failure: null },
          clock.now(),
        );
      }
      return find(runId);
    },

    async readAgain(tavolaId, { by }) {
      const { method, kind, price } = pricedMethod();
      const tavola = await catalogRunRepository.tavolaToReadAgain({ tavolaId });
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }
      refuseToReadAgain(tavola);
      if (!tavola.runId) {
        throw new ConflictError(
          'No Catalog run read this Tavola, so there is no catalog to read it again from.',
        );
      }
      const source = await found(tavola.runId);
      // Its pages are what the run that read it found them to be, and are not asked about again.
      const known = (await catalogRunRepository.done(source.run.id)).pages.filter(
        ({ identity }) => identity.kind !== 'other' && identity.tavola?.trim() === tavola.number,
      );
      if (known.length === 0) {
        throw new ConflictError(
          `The run that read it kept no page of Tavola ${tavola.number}, so there is nothing to ` +
            'read again.',
        );
      }
      if (await catalogRunRepository.busy()) {
        throw new ConflictError(ANOTHER_IS_READING);
      }
      const catalog = await fileStore.open(source.run.catalogKey);
      if (!catalog) {
        throw new ConflictError('The catalog it was read from is no longer kept.');
      }

      const identities = new Map<number, SheetIdentity>(
        known.map(({ page, identity }) => [page, identity]),
      );
      const pages = [...identities.keys()].sort((a, b) => a - b);
      const directory = await mkdtemp(join(tmpdir(), 'ricambi-catalog-'));
      let estimate = 0;
      try {
        const pdf = join(directory, 'catalog.pdf');
        await pipeline(catalog.stream(), createWriteStream(pdf));
        const spending = new Spending(Number.POSITIVE_INFINITY, price);
        for await (const page of pdfPagesNamed(pages)(pdf)) {
          estimate += (await estimatePage(method, spending, page, identities.get(page.page))).cost;
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }

      const id = randomUUID();
      const added = await catalogRunRepository.add({
        id,
        modelId: source.run.modelId,
        state: 'estimated',
        catalogKey: source.run.catalogKey,
        catalogByteSize: source.run.catalogByteSize,
        catalogPages: source.run.catalogPages,
        firstPage: pages[0] as number,
        lastPage: pages.at(-1) as number,
        readsAgain: { tavola: tavola.number, pages },
        readingMethod: kind,
        charged: method.charged,
        pricedModel: method.model,
        pricesCheckedOn: PRICE_LIST.checkedOn,
        estimate: rounded(estimate),
        createdAt: clock.now(),
        createdBy: by,
      });
      if (added === 'another is reading') {
        throw new ConflictError(ANOTHER_IS_READING);
      }
      for (const { page, identity } of known) {
        await catalogRunRepository.pageFound(id, page, identity);
      }
      return find(id);
    },

    async removeTavola(tavolaId) {
      const tavola = await catalogRunRepository.tavolaToReadAgain({ tavolaId });
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }
      if (tavola.state === 'published') {
        throw new ConflictError(
          'This Tavola is Published: an Editor has checked it, and it is corrected in Ricambi ' +
            'rather than removed.',
        );
      }
      const HAS_CONTRIBUTIONS =
        'Its Positions have Contributions, which removing it would lose. Review them first.';
      if (tavola.hasContributions) {
        throw new ConflictError(HAS_CONTRIBUTIONS);
      }
      // A run reading now could load or replace the Tavola just removed.
      if (await catalogRunRepository.busy()) {
        throw new ConflictError(ANOTHER_IS_READING);
      }
      const discarded = await dependencies.db.transaction((session) =>
        discardTavola(session, tavola.id),
      );
      if (discarded === 'has contributions') {
        throw new ConflictError(HAS_CONTRIBUTIONS);
      }
      await removeDiscardedFiles(fileStore, logger, discarded.fileKeys);
      return { modelId: discarded.modelId };
    },

    async readBy(tavolaId) {
      const tavola = await catalogRunRepository.tavolaToReadAgain({ tavolaId });
      if (!tavola) {
        throw new NotFoundError('No such Tavola.');
      }
      return tavola.runId;
    },

    async pickUp() {
      for (const runId of await catalogRunRepository.estimating()) {
        if (!estimators.has(runId)) {
          logger.info({ runId }, 'Carrying on estimating a catalog');
          void estimateRest(runId);
        }
      }
      for (const runId of await catalogRunRepository.running()) {
        if (readers.has(runId)) {
          continue;
        }
        if (!reading.method) {
          await catalogRunRepository.ended(
            runId,
            {
              state: 'failed',
              failure:
                'The server started again with nothing to read with, so the run could not ' +
                'carry on. Every Tavola finished before it is in the archive, Unchecked.',
            },
            clock.now(),
          );
          continue;
        }
        await catalogRunRepository.recordAction(runId, {
          action: 'continued',
          by: null,
          at: clock.now(),
        });
        logger.info({ runId }, 'Carrying on a Catalog run left running');
        void read(runId, reading.method);
      }
    },

    interrupt() {
      interrupted.abort(new Error('The server is going away.'));
    },

    async openCatalog(runId) {
      const found = await catalogRunRepository.findById(runId);
      return found ? fileStore.open(found.run.catalogKey) : null;
    },

    async openSetAsidePage(runId, page) {
      const found = await catalogRunRepository.findById(runId);
      const setAside = found?.run.setAside.some((sheet) => sheet.page === page);
      return setAside ? fileStore.open(setAsidePageKey(runId, page)) : null;
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

/**
 * Why estimating a catalog failed, as the run page says it. As for a run, what the server refused
 * on its own is said; anything else is only named.
 */
function estimateFailureOf(error: unknown): string {
  if (error instanceof HttpError) {
    return error.message;
  }
  if (error instanceof PdfNotReadable) {
    return 'The catalog could not be read as a PDF.';
  }
  return 'Estimating stopped on an error, which the server has logged. Upload the catalog again.';
}

function notAPdf(): UnsupportedMediaTypeError {
  return new UnsupportedMediaTypeError('That is not a PDF. Upload the catalog as a PDF.');
}

function megabytes(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
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

function toCatalogRun({ run, model, tavole, pages, actions }: CatalogRunWithModel): CatalogRun {
  return {
    id: run.id,
    state: run.state,
    model: modelOf(model),
    pages: { first: run.firstPage, last: run.lastPage },
    catalogPages: run.catalogPages,
    estimate: run.estimate,
    estimating:
      run.state === 'estimating'
        ? { pages: run.pagesEstimated, of: run.lastPage - run.firstPage + 1 }
        : null,
    readingMethod: run.readingMethod,
    charged: run.charged,
    priceList: { model: run.pricedModel, checkedOn: run.pricesCheckedOn },
    createdAt: run.createdAt.toISOString(),
    limit: run.spendingLimit,
    spent: run.spent,
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    failure: run.failure,
    tavole: tavoleOf(run.costs, tavole),
    left: leftOf(run, tavole, pages),
    actions: actions.map((action) => ({
      action: action.action,
      by: action.by && action.byName ? { id: action.by, name: action.byName } : null,
      at: action.at.toISOString(),
      limit: action.spendingLimit,
    })),
    setAside: run.setAside.map(({ page, reason }) => ({
      page,
      reason,
      image: `/api/catalog-runs/${run.id}/set-aside/${page}`,
    })),
    readsAgain: run.readsAgain,
    // A run's records are kept by the time they were read; one never recorded is a gap.
    costs: run.costs.filter(Boolean).map(costRecordOf),
  };
}

/**
 * What a run has not yet read (issue #64), from what it found each page to be, the Tavole it
 * finished, and the requests its records show it sent. A run asks about every page before it reads
 * a Tavola, so a page of a Tavola it has not begun is as far from read as one it never asked about,
 * and is left with those. A page that goes into no Tavola is set aside, and so has been reached.
 */
function leftOf(
  run: CatalogRunWithModel['run'],
  finished: CatalogRunWithModel['tavole'],
  pages: CatalogRunWithModel['pages'],
): CatalogRun['left'] {
  const done = new Set(finished.map((tavola) => tavola.number));
  const begun = new Set<string>(done);
  // A run's records are kept by the time they were read; one never recorded is a gap.
  for (const record of run.costs.filter(Boolean)) {
    for (const tavola of record.tavole) {
      const sent = tavola.sheets.some(
        (sheet) => sheet.readings.length > 0 || sheet.numbers.length > 0,
      );
      if (sent || tavola.translation) {
        begun.add(tavola.number);
      }
    }
    for (const request of [...(record.cutOff ?? []), record.awaiting]) {
      if (request?.tavola) {
        begun.add(request.tavola);
      }
    }
  }

  const tavolaOf = new Map(
    pages.map(({ page, identity }) => [
      page,
      identity.kind === 'other' ? null : identity.tavola?.trim() || null,
    ]),
  );
  const toRead =
    run.readsAgain?.pages ??
    Array.from({ length: run.lastPage - run.firstPage + 1 }, (_, index) => run.firstPage + index);
  const tavoleLeft = new Set<string>();
  const pagesLeft: number[] = [];
  for (const page of toRead) {
    if (!tavolaOf.has(page)) {
      pagesLeft.push(page);
      continue;
    }
    const number = tavolaOf.get(page);
    if (!number || done.has(number)) {
      continue;
    }
    if (begun.has(number)) {
      tavoleLeft.add(number);
    } else {
      pagesLeft.push(page);
    }
  }
  return { tavole: [...tavoleLeft], pages: pagesLeft };
}

function modelOf(model: CatalogRunWithModel['model']): CatalogRun['model'] {
  return { id: model.id, brand: model.brand, name: model.name, series: model.series };
}

/**
 * A cost record as the run page shows it. Its own Reading method's name is left out: the run says
 * which kind of method read it, and a name might say whose subscription it was.
 */
function costRecordOf(record: CostRecord): CatalogRunCostRecord {
  return {
    time: record.run,
    priceList: {
      model: record.model,
      inputPerMillion: record.priceList.inputPerMillion,
      outputPerMillion: record.priceList.outputPerMillion,
      currency: record.priceList.currency,
      checkedOn: record.priceList.checkedOn,
    },
    limit: record.limit,
    estimate: record.estimate,
    total: record.total,
    stopped: record.stopped,
    tavole: record.tavole.map((tavola) => ({
      number: tavola.number,
      finished: tavola.finished,
      cost: tavola.cost,
      sheets: tavola.sheets.map((sheet) => ({
        page: sheet.page,
        kind: sheet.kind,
        cost: sheet.cost,
        identification: spentOf(sheet.identification),
        readings: sheet.readings.map((reading) => ({
          reading: reading.reading,
          ...spentOf(reading),
        })),
        marks: sheet.numbers.map(spentOf),
      })),
      translation: tavola.translation && spentOf(tavola.translation),
    })),
    setAside: record.setAside.map((sheet) => ({
      page: sheet.page,
      identification: spentOf(sheet.identification),
    })),
    cutOff: (record.cutOff ?? []).map(({ request, page, tavola, reading, cost }) => ({
      request,
      page,
      tavola,
      reading,
      cost,
    })),
  };
}

function spentOf({ tokens, cost }: Spent): CatalogRunSpent {
  return { input: tokens.input, output: tokens.output, cost };
}

/**
 * Each Tavola as the cost records have it, in the order the run reads them, with what the loader
 * made of the finished ones. One stopped in the middle and read again whole has cost both times.
 */
function tavoleOf(
  costs: CatalogRunWithModel['run']['costs'],
  loaded: CatalogRunWithModel['tavole'],
): CatalogRunTavola[] {
  const byNumber = new Map(loaded.map((tavola) => [tavola.number, tavola]));
  const read = new Map<string, CatalogRunTavola>();
  for (const { number, finished, cost } of costs.flatMap((record) => record.tavole)) {
    const before = read.get(number);
    read.set(number, {
      number,
      finished: finished || (before?.finished ?? false),
      cost: rounded(cost + (before?.cost ?? 0)),
      tavolaId: byNumber.get(number)?.tavolaId ?? null,
      refused: byNumber.get(number)?.refused ?? null,
    });
  }
  return [...read.values()];
}
