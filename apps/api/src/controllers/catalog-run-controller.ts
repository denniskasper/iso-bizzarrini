import type { CatalogRunResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../http/errors.js';
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

export interface CatalogRunController {
  estimate: RequestHandler;
  read: RequestHandler;
  readCatalog: RequestHandler;
}

/**
 * **Catalog runs** (ADR 0018, issue #57). The catalog is the request body, as a Scan is, and
 * what it is for travels in the address: there is nothing else on the request to name.
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
      if (!Buffer.isBuffer(request.body)) {
        throw new UnsupportedMediaTypeError('Send the catalog itself as the request body.');
      }
      if (request.body.byteLength === 0) {
        throw new ValidationError('That upload was empty.');
      }

      const run = await catalogRunService.estimate({
        ...query.data,
        catalog: request.body,
        by: gate.whoIsSignedIn(response).account.id,
      });
      response.status(201).json({ run } satisfies CatalogRunResponse);
    },

    read: async (request, response) => {
      const { runId } = runParams.parse(request.params);
      response.json({ run: await catalogRunService.find(runId) } satisfies CatalogRunResponse);
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
  };
}
