import type {
  CatalogModelResponse,
  CatalogModelsResponse,
  ModelProgressResponse,
} from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { Gate } from '../access/gate.js';
import { z } from 'zod';
import type { CatalogService } from '../services/catalog-service.js';
import { blankToNull, required } from './fields.js';

/**
 * Controllers validate what arrives and shape what leaves. They hold no rules of their own —
 * those live in the services.
 */
const listModelsQuery = z.object({
  brand: z.string().trim().min(1, 'brand must not be blank').optional(),
});

const modelIdParams = z.object({
  modelId: z.uuid('That is not a Model id.'),
});

/**
 * Reads `NewModelRequest` from `@ricambi/contracts`, which is where the wire shape is declared
 * and the only place the browser learns it.
 *
 * `series` and `modelYears` are optional here, and blank means absent: the factory did not
 * distinguish every Model that far, and a Model carrying `""` would print an empty column
 * where it should print nothing at all.
 */
const createModelBody = z.object({
  brand: required('A brand is required'),
  name: required('A model name is required'),
  series: blankToNull(),
  modelYears: blankToNull(),
});

export interface CatalogController {
  listModels: RequestHandler;
  readModel: RequestHandler;
  readModelProgress: RequestHandler;
  createModel: RequestHandler;
}

export function createCatalogController(dependencies: {
  gate: Gate;
  catalogService: CatalogService;
}): CatalogController {
  const { gate, catalogService } = dependencies;

  return {
    listModels: async (request, response) => {
      const query = listModelsQuery.parse(request.query);
      const models = await catalogService.listModels(
        query.brand === undefined ? {} : { brand: query.brand },
      );

      const body: CatalogModelsResponse = { models };
      response.json(body);
    },

    readModel: async (request, response) => {
      const { modelId } = modelIdParams.parse(request.params);
      const body: CatalogModelResponse = await catalogService.readModel(
        modelId,
        gate.seesUnchecked(response),
      );
      response.json(body);
    },

    readModelProgress: async (request, response) => {
      const { modelId } = modelIdParams.parse(request.params);
      const body: ModelProgressResponse = await catalogService.readModelProgress(
        modelId,
        gate.seesUnchecked(response),
      );
      response.json(body);
    },

    createModel: async (request, response) => {
      const model = await catalogService.createModel(createModelBody.parse(request.body));
      response.status(201).json({ model });
    },
  };
}
