import type { CatalogModelsResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { CatalogService } from '../services/catalog-service.js';

/**
 * Controllers validate what arrives and shape what leaves. They hold no rules of their own —
 * those live in the services.
 */
const listModelsQuery = z.object({
  brand: z.string().trim().min(1, 'brand must not be blank').optional(),
});

export interface CatalogController {
  listModels: RequestHandler;
}

export function createCatalogController(dependencies: {
  catalogService: CatalogService;
}): CatalogController {
  const { catalogService } = dependencies;

  return {
    listModels: async (request, response) => {
      const query = listModelsQuery.parse(request.query);
      const models = await catalogService.listModels(
        query.brand === undefined ? {} : { brand: query.brand },
      );

      const body: CatalogModelsResponse = { models };
      response.json(body);
    },
  };
}
