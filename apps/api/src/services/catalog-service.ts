import type { CatalogModel, CatalogModelResponse } from '@ricambi/contracts';
import { NotFoundError } from '../http/errors.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toCatalogModel, toTavolaSummary } from './catalog-view.js';

export interface NewModel {
  brand: string;
  name: string;
  series: string | null;
  modelYears: string | null;
}

export interface CatalogService {
  listModels(filter?: { brand?: string }): Promise<CatalogModel[]>;
  readModel(modelId: string): Promise<CatalogModelResponse>;
  createModel(model: NewModel): Promise<CatalogModel>;
}

export function createCatalogService(dependencies: {
  modelRepository: ModelRepository;
  tavolaRepository: TavolaRepository;
}): CatalogService {
  const { modelRepository, tavolaRepository } = dependencies;

  return {
    async listModels(filter = {}) {
      const rows = filter.brand
        ? await modelRepository.listByBrand(filter.brand)
        : await modelRepository.listAll();

      return rows.map(toCatalogModel);
    },

    async readModel(modelId) {
      const model = await modelRepository.findById(modelId);
      if (!model) {
        throw new NotFoundError('No such Model.');
      }

      const tavole = await tavolaRepository.listByModel(modelId);
      return { model: toCatalogModel(model), tavole: tavole.map(toTavolaSummary) };
    },

    async createModel(model) {
      // Deliberately no uniqueness rule. The factory distinguished a Grifo GL 365 from a Grifo
      // GL 350, and it is not this system's business to decide that two rows an Editor can tell
      // apart are the same car.
      return toCatalogModel(await modelRepository.add(model));
    },
  };
}
