import type {
  CategoriesResponse,
  Category,
  CategoryOnModel,
  CategoryResponse,
} from '@ricambi/contracts';
import { categorySlug, UNCATEGORISED } from '../catalog/naming.js';
import { violates } from '../db/constraints.js';
import { ConflictError, NotFoundError, ValidationError } from '../http/errors.js';
import type { CategoryRepository } from '../repositories/category-repository.js';
import type { TavolaRepository } from '../repositories/tavola-repository.js';
import { toCatalogModel, toCategory, toTavolaSummary } from './catalog-view.js';

/**
 * The systems of a car: the list an Administrator keeps, and what is filed under each entry
 * across every Model.
 *
 * **A Category is a name and nothing else.** There is no code and no number, on purpose — the
 * original prototype numbered its categories and the numbers turned out to encode which car a
 * drawing belonged to, which is the Model's job now.
 */
export interface CategoryService {
  list(seesUnchecked: boolean): Promise<CategoriesResponse>;
  /** One system across every car, grouped by Model. */
  read(slug: string, seesUnchecked: boolean): Promise<CategoryResponse>;
  add(name: string): Promise<Category>;
  rename(categoryId: string, name: string): Promise<Category>;
}

export function createCategoryService(dependencies: {
  categoryRepository: CategoryRepository;
  tavolaRepository: TavolaRepository;
}): CategoryService {
  const { categoryRepository, tavolaRepository } = dependencies;

  /** The slug a name reduces to, or a refusal if it reduces to nothing usable. */
  function slugOf(name: string): string {
    const slug = categorySlug(name);
    if (slug === '') {
      throw new ValidationError('A Category needs at least one letter or digit in its name.');
    }
    // "Uncategorised" is what the archive calls a drawing filed nowhere. A Category by that
    // name would make "filed under it" and "not filed" the same address.
    if (slug === UNCATEGORISED) {
      throw new ValidationError(
        '“Uncategorised” is what the archive calls a drawing with no Category. Choose another name.',
      );
    }
    return slug;
  }

  /**
   * The list's one rule, enforced by the database rather than by looking first: two
   * Administrators adding "Fuel" at the same moment would both pass a check and both write.
   */
  const alreadyListed = (name: string) => (error: unknown) => {
    if (violates(error, 'categories_slug_unique')) {
      throw new ConflictError(
        `There is already a Category called “${name}”, or one spelt like it.`,
      );
    }
    throw error;
  };

  return {
    async list(seesUnchecked) {
      const [listed, uncategorised] = await Promise.all([
        categoryRepository.listWithCounts(seesUnchecked),
        categoryRepository.countUncategorised(seesUnchecked),
      ]);

      return {
        categories: listed.map((row) => ({ ...toCategory(row), tavole: row.tavole })),
        uncategorised,
      };
    },

    async read(slug, seesUnchecked) {
      const category = await categoryRepository.findBySlug(slug);
      if (!category) {
        throw new NotFoundError('No such Category.');
      }

      // Already in brand, Model and catalog order, so cutting it into cars is a single pass and
      // a car's drawings stay in the order its catalog prints them.
      const models: CategoryOnModel[] = [];
      for (const row of await tavolaRepository.listByCategory(category.id, seesUnchecked)) {
        const last = models.at(-1);
        if (last && last.model.id === row.model.id) {
          last.tavole.push(toTavolaSummary(row));
        } else {
          models.push({ model: toCatalogModel(row.model), tavole: [toTavolaSummary(row)] });
        }
      }

      return { category: toCategory(category), models };
    },

    async add(name) {
      const row = await categoryRepository.add(name, slugOf(name)).catch(alreadyListed(name));
      return toCategory(row);
    },

    async rename(categoryId, name) {
      // The slug follows the name. It is the key that decides sameness, so a Category renamed
      // from "Body" to "Body/Exterior" must stop answering to the old word — otherwise the list
      // could hold a second "Body" that the first one still claimed.
      const row = await categoryRepository
        .rename(categoryId, name, slugOf(name))
        .catch(alreadyListed(name));

      if (!row) {
        throw new NotFoundError('No such Category.');
      }
      return toCategory(row);
    },
  };
}
