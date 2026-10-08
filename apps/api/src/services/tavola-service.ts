import type { TavolaResponse, TavolaSummary } from '@ricambi/contracts';
import { categorySlug, numericPrefixOf } from '../catalog/naming.js';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { CategoryRow } from '../db/schema.js';
import type { ModelRepository } from '../repositories/model-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toCatalogModel, toTavolaSummary } from './catalog-view.js';
import type { PositionService } from './position-service.js';

export interface NewTavola {
  number: string;
  nameIt: string;
  nameEn: string;
  /** A Category on the list, by name or by slug — or `null` for none yet. */
  category: string | null;
  /** The factory's own words, or nothing. Never tidied, never used to navigate. */
  catalogSection: string | null;
  catalogGroup: string | null;
  catalogSubgroup: string | null;
}

export interface TavolaService {
  readTavola(tavolaId: string): Promise<TavolaResponse>;
  createTavola(modelId: string, tavola: NewTavola): Promise<TavolaSummary>;
  /** Files a sheet under a Category on the list, moves it to another, or takes it out. */
  categorise(tavolaId: string, category: string | null): Promise<TavolaSummary>;
}

export function createTavolaService(dependencies: {
  modelRepository: ModelRepository;
  categoryRepository: CategoryRepository;
  tavolaRepository: TavolaRepository;
  positionService: PositionService;
}): TavolaService {
  const { modelRepository, categoryRepository, tavolaRepository, positionService } = dependencies;

  /**
   * **Chosen, never typed into existence.** The list is an Administrator's, so a name that is
   * not on it is refused here rather than quietly added — which is how "Brakes" and "Braking"
   * became two systems on every reference site this archive replaces. Found by slug, so the
   * spelling an Editor used does not matter and the spelling on the list is what is recorded.
   */
  async function onTheList(category: string | null): Promise<CategoryRow | null> {
    if (category === null) {
      return null;
    }

    const found = await categoryRepository.findBySlug(categorySlug(category));
    if (!found) {
      throw new ValidationError(
        `“${category}” is not on the list of Categories. An Administrator can add it.`,
      );
    }
    return found;
  }

  return {
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

      const category = await onTheList(tavola.category);

      const row = await tavolaRepository
        .add({
          modelId,
          number: tavola.number,
          numberSort: numericPrefixOf(tavola.number),
          nameIt: tavola.nameIt,
          nameEn: tavola.nameEn,
          categoryId: category?.id ?? null,
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

    async categorise(tavolaId, category) {
      const chosen = await onTheList(category);

      if (!(await tavolaRepository.setCategory(tavolaId, chosen?.id ?? null))) {
        throw new NotFoundError('No such Tavola.');
      }

      const row = await tavolaRepository.findById(tavolaId);
      if (!row) {
        throw new NotFoundError('No such Tavola.');
      }
      return toTavolaSummary(row);
    },
  };
}
