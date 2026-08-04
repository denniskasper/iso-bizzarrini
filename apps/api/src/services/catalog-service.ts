import type { CatalogModel, CatalogModelResponse, ModelProgressResponse } from '@ricambi/contracts';
import { NotFoundError } from '../http/errors.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toCatalogModel, toTavolaProgress, toTavolaSummary } from './catalog-view.js';

export interface NewModel {
  brand: string;
  name: string;
  series: string | null;
  modelYears: string | null;
}

export interface CatalogService {
  listModels(filter?: { brand?: string }): Promise<CatalogModel[]>;
  readModel(modelId: string): Promise<CatalogModelResponse>;
  /** Where the work stands across every drawing of one car. */
  readModelProgress(modelId: string): Promise<ModelProgressResponse>;
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

    /**
     * The Model is read first and not only to name it in a refusal: a car that is not in the
     * archive has no drawings, and counting them would answer "nothing left to do" — which is
     * the same sentence a car whose every sheet is finished gets, about a car that does not
     * exist.
     */
    async readModelProgress(modelId) {
      if (!(await modelRepository.findById(modelId))) {
        throw new NotFoundError('No such Model.');
      }

      const rows = await tavolaRepository.progressByModel(modelId);
      return { tavole: rows.map(toTavolaProgress) };
    },

    async createModel(model) {
      // Deliberately no uniqueness rule. The factory distinguished a Grifo GL 365 from a Grifo
      // GL 350, and it is not this system's business to decide that two rows an Editor can tell
      // apart are the same car.
      return toCatalogModel(await modelRepository.add(model));
    },
  };
}
