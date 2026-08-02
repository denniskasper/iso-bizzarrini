import type { ModelRow } from '../db/schema.js';
import type { ModelRepository } from '../repositories/model-repository.js';

/**
 * A Model as the rest of the application talks about it: brand, model, series and model years,
 * and nothing that only the database cares about.
 */
export interface CatalogModel {
  id: string;
  brand: string;
  name: string;
  series: string | null;
  modelYears: string | null;
}

export interface CatalogService {
  listModels(filter?: { brand?: string }): Promise<CatalogModel[]>;
}

export function createCatalogService(dependencies: {
  modelRepository: ModelRepository;
}): CatalogService {
  const { modelRepository } = dependencies;

  return {
    async listModels(filter = {}) {
      const rows = filter.brand
        ? await modelRepository.listByBrand(filter.brand)
        : await modelRepository.listAll();

      return rows.map(toCatalogModel);
    },
  };
}

function toCatalogModel(row: ModelRow): CatalogModel {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    series: row.series,
    modelYears: row.modelYears,
  };
}
