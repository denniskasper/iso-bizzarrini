import type { CatalogModel } from '@ricambi/contracts';
import type { ModelRow } from '../db/schema.js';
import type { ModelRepository } from '../repositories/model-repository.js';

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
