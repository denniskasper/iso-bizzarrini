import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { categories, type CategoryRow } from '../db/schema.js';

/**
 * Categories — the system of the car a Tavola belongs to.
 *
 * There is no `add`: a Category comes into existence by an Editor naming one on a Tavola, and
 * `findOrAdd` is what makes that safe under two Editors filing at once. The slug is the key
 * the insert conflicts on, so "Fuel System" typed twice is one Category rather than two.
 */
export interface CategoryRepository {
  listAll(): Promise<CategoryRow[]>;
  findOrAdd(name: string, slug: string): Promise<CategoryRow>;
}

export function createCategoryRepository(db: Db): CategoryRepository {
  return {
    listAll() {
      return db.select().from(categories).orderBy(asc(categories.name));
    },

    async findOrAdd(name, slug) {
      const [inserted] = await db
        .insert(categories)
        .values({ name, slug })
        .onConflictDoNothing({ target: categories.slug })
        .returning();

      if (inserted) {
        return inserted;
      }

      // Someone got there first — this run, or years ago. Either way theirs is the Category,
      // and the spelling members read is the one that was recorded first.
      const [existing] = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, slug))
        .limit(1);

      if (!existing) {
        throw new Error(`The Category "${slug}" was neither inserted nor found.`);
      }
      return existing;
    },
  };
}
