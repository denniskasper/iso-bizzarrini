import type { CategoriesResponse, TavolaResponse, TavolaSummary } from '@ricambi/contracts';
import { categorySlug, numericPrefixOf } from '../catalog/naming.js';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toCatalogModel, toCategory, toTavolaSummary } from './catalog-view.js';
import type { PositionService } from './position-service.js';

export interface NewTavola {
  number: string;
  nameIt: string;
  nameEn: string;
  /** As the Editor typed it. Its slug decides whether this is a new Category or an old one. */
  category: string;
  /** The factory's own words, or nothing. Never tidied, never used to navigate. */
  catalogSection: string | null;
  catalogGroup: string | null;
  catalogSubgroup: string | null;
}

export interface TavolaService {
  listCategories(): Promise<CategoriesResponse>;
  readTavola(tavolaId: string): Promise<TavolaResponse>;
  createTavola(modelId: string, tavola: NewTavola): Promise<TavolaSummary>;
}

export function createTavolaService(dependencies: {
  modelRepository: ModelRepository;
  categoryRepository: CategoryRepository;
  tavolaRepository: TavolaRepository;
  positionService: PositionService;
}): TavolaService {
  const { modelRepository, categoryRepository, tavolaRepository, positionService } = dependencies;

  return {
    async listCategories() {
      return { categories: (await categoryRepository.listAll()).map(toCategory) };
    },

    async readTavola(tavolaId) {
      const row = await tavolaRepository.findById(tavolaId);
      if (!row) {
        throw new NotFoundError('No such Tavola.');
      }

      // With the drawing and not after it. The circles are part of what a member opened the
      // Tavola to see, and a second request for them is a second chance to arrive late — and so
      // is what belongs with each of them, which arrives on the same sheet.
      const sheet = await positionService.listForTavola(tavolaId);

      return {
        ...sheet,
        tavola: {
          ...toTavolaSummary(row),
          model: toCatalogModel(row.model),
          // Reported whether or not it was recorded, because "the factory printed no Gruppo
          // here" and "nobody has typed it in yet" are the same thing to a member holding the
          // paper: the screen simply does not claim one.
          provenance: {
            section: row.catalogSection,
            group: row.catalogGroup,
            subgroup: row.catalogSubgroup,
          },
        },
      };
    },

    async createTavola(modelId, tavola) {
      const model = await modelRepository.findById(modelId);
      if (!model) {
        throw new NotFoundError('No such Model.');
      }

      const slug = categorySlug(tavola.category);
      if (slug === '') {
        throw new ValidationError('A Category needs at least one letter or digit in its name.');
      }
      const category = await categoryRepository.findOrAdd(tavola.category, slug);

      const row = await tavolaRepository
        .add({
          modelId,
          number: tavola.number,
          numberSort: numericPrefixOf(tavola.number),
          nameIt: tavola.nameIt,
          nameEn: tavola.nameEn,
          categoryId: category.id,
          catalogSection: tavola.catalogSection,
          catalogGroup: tavola.catalogGroup,
          catalogSubgroup: tavola.catalogSubgroup,
        })
        .catch((error: unknown) => {
          // A Tavola's number is meaningful only within its Model, and two sheets in one
          // catalog cannot both be number 12. The database is what enforces that, so that two
          // Editors filing at the same moment cannot both pass a check and both write.
          if (violates(error, 'tavole_model_id_number_unique')) {
            throw new ConflictError(
              `${model.brand} ${model.name} already has a Tavola numbered ${tavola.number}.`,
            );
          }
          throw error;
        });

      return toTavolaSummary({ ...row, category, scan: null });
    },
  };
}
