import type {
  CatalogRunResponse,
  CatalogRunsResponse,
  ContinueCatalogRunRequest,
  StartCatalogRunRequest,
  ReadAgainFromResponse,
  ReadAgainRequest,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
import { sendImage } from '../http/served-image.js';
import type { CatalogRunService } from '../services/catalog-run-service.js';

const page = (which: string) =>
  z.coerce
    .number(`Say the ${which} page to read.`)
    .int(`The ${which} page is a whole number.`)
    .min(1, 'Pages are counted from 1.');

const estimateQuery = z
  .object({
    modelId: z.uuid('Choose the Model the catalog is for.'),
    firstPage: page('first'),
    lastPage: page('last'),
  })
  .refine((query) => query.firstPage <= query.lastPage, {
    message: 'The first page to read comes before the last.',
  });

const runParams = z.object({ runId: z.uuid('That is not a Catalog run id.') });

const aTavola = z.object({ tavolaId: z.uuid('Say which Tavola to read again.') });
const readAgainBody: z.ZodType<ReadAgainRequest> = aTavola;

const setAsideParams = runParams.extend({
  page: z.coerce
    .number('That is not a page.')
    .int('That is not a page.')
    .min(1, 'That is not a page.'),
});

const LIMIT_NEEDED =
  'Give a spending limit in dollars. There is no default, so that nobody spends by accident; ' +
  'the run never passes the limit it is given.';

const limit = z
  .number(LIMIT_NEEDED)
  .positive(LIMIT_NEEDED)
  .max(1_000_000, 'That limit is more than a catalog could cost.');

const startBody: z.ZodType<StartCatalogRunRequest> = z.object({ limit }, LIMIT_NEEDED);

const RAISE_NEEDED = 'A raised limit is a number of dollars.';
const continueBody: z.ZodType<ContinueCatalogRunRequest> = z
  .object({ limit: limit.optional() }, RAISE_NEEDED)
  .optional()
  .transform((body) => body ?? {});

export interface CatalogRunController {
  estimate: RequestHandler;
  start: RequestHandler;
  carryOn: RequestHandler;
  stop: RequestHandler;
  read: RequestHandler;
  list: RequestHandler;
  readCatalog: RequestHandler;
  readSetAsidePage: RequestHandler;
  readAgain: RequestHandler;
  readAgainFrom: RequestHandler;
}

/**
 * **Catalog runs** (ADR 0018, issue #57). The catalog is the request body, as a Scan is, and
 * what it is for travels in the address: there is nothing else on the request to name. Unlike a
 * Scan's, the body is not read into memory first: it is handed on as it arrives (issue #65).
 */
export function createCatalogRunController(dependencies: {
  gate: Gate;
  catalogRunService: CatalogRunService;
}): CatalogRunController {
  const { gate, catalogRunService } = dependencies;

  return {
    estimate: async (request, response) => {
      const query = estimateQuery.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError(query.error.issues[0]?.message ?? 'The request was not valid.');
      }
      // Read here as a stream, never parsed: one parsed already was sent as something else.
      if (request.body !== undefined) {
        throw new UnsupportedMediaTypeError('Send the catalog itself as the request body.');
      }
      const declared = request.headers['content-length'];

      const run = await catalogRunService.estimate({
        ...query.data,
        catalog: request,
        declaredBytes: declared === undefined ? null : Number(declared),
        by: gate.whoIsSignedIn(response).account.id,
      });
      response.status(201).json({ run } satisfies CatalogRunResponse);
    },

    start: async (request, response) => {
      const { runId } = runParams.parse(request.params);
      const body = startBody.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError(body.error.issues[0]?.message ?? LIMIT_NEEDED);
      }
      const run = await catalogRunService.start(runId, {
        limit: body.data.limit,
        by: gate.whoIsSignedIn(response).account.id,
      });
      response.status(202).json({ run } satisfies CatalogRunResponse);
    },

    carryOn: async (request, response) => {
      const { runId } = runParams.parse(request.params);
      const body = continueBody.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError(body.error.issues[0]?.message ?? RAISE_NEEDED);
      }
      const run = await catalogRunService.carryOn(runId, {
        ...body.data,
        by: gate.whoIsSignedIn(response).account.id,
      });
      response.status(202).json({ run } satisfies CatalogRunResponse);
    },

    stop: async (request, response) => {
      const { runId } = runParams.parse(request.params);
      const run = await catalogRunService.stop(runId, {
        by: gate.whoIsSignedIn(response).account.id,
      });
      response.status(202).json({ run } satisfies CatalogRunResponse);
    },

    readAgain: async (request, response) => {
      const body = readAgainBody.safeParse(request.body);
      if (!body.success) {
        throw new ValidationError(
          body.error.issues[0]?.message ?? 'Say which Tavola to read again.',
        );
      }
      const run = await catalogRunService.readAgain(body.data.tavolaId, {
        by: gate.whoIsSignedIn(response).account.id,
      });
      response.status(201).json({ run } satisfies CatalogRunResponse);
    },

    readAgainFrom: async (request, response) => {
      const query = aTavola.safeParse(request.query);
      if (!query.success) {
        throw new ValidationError(query.error.issues[0]?.message ?? 'Say which Tavola.');
      }
      response.json({
        runId: await catalogRunService.readBy(query.data.tavolaId),
      } satisfies ReadAgainFromResponse);
    },

    read: async (request, response) => {
      const { runId } = runParams.parse(request.params);
      response.json({ run: await catalogRunService.find(runId) } satisfies CatalogRunResponse);
    },

    list: async (_request, response) => {
      response.json({ runs: await catalogRunService.list() } satisfies CatalogRunsResponse);
    },

    readCatalog: async (request, response, next) => {
      const { runId } = runParams.parse(request.params);
      const catalog = await catalogRunService.openCatalog(runId);
      if (!catalog) {
        throw new NotFoundError('No such Catalog run.');
      }

      // The Club's members-only material, so it is kept in no cache but the one browser's.
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Content-Type', 'application/pdf');
      response.setHeader('Content-Disposition', 'inline; filename="catalog.pdf"');
      response.setHeader('Content-Length', catalog.byteSize);
      const file = catalog.stream();
      file.on('error', next);
      file.pipe(response);
    },

    readSetAsidePage: async (request, response, next) => {
      const { runId, page } = setAsideParams.parse(request.params);
      const image = await catalogRunService.openSetAsidePage(runId, page);
      if (!image) {
        throw new NotFoundError('That Catalog run set no such page aside.');
      }
      // A page of an uploaded catalog, rendered once: what is at this address never changes.
      sendImage(request, response, next, {
        ...image,
        contentType: 'image/png',
        etag: `"catalog-run-${runId}-set-aside-${page}"`,
      });
    },
  };
}
