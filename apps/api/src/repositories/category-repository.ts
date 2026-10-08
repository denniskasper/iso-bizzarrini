import { asc, count, eq, isNull } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { categories, tavole, type CategoryRow } from '../db/schema.js';

/** A Category and how many Tavole are filed under it, counted rather than read. */
export interface CategoryWithCount extends CategoryRow {
  tavole: number;
}

/**
 * Categories — the system of the car a Tavola belongs to.
 *
 * **The list is maintained by an Administrator**, so `add` and `rename` are the two ways it
 * changes through the application, and the slug's uniqueness is what refuses a second "Fuel
 * System" under another spelling: the database, rather than a read followed by a write.
 *
 * `findOrAdd` is not for a request. It is for the two things that write a whole archive at once
 * — the migration of the Club's existing material and a practice system writing itself — where
 * the Categories are whatever the source names and there is nobody to ask.
 */
export interface CategoryRepository {
  /** The whole list in alphabetical order, each entry with its number of Tavole. */
  listWithCounts(): Promise<CategoryWithCount[]>;
  /** How many Tavole have no Category at all. */
  countUncategorised(): Promise<number>;
  findBySlug(slug: string): Promise<CategoryRow | null>;
  /** Refused by `categories_slug_unique` when the list already has that name. */
  add(name: string, slug: string): Promise<CategoryRow>;
  /** `null` when there is no such Category. Refused by the same constraint as `add`. */
  rename(id: string, name: string, slug: string): Promise<CategoryRow | null>;
  findOrAdd(name: string, slug: string): Promise<CategoryRow>;
}

export function createCategoryRepository(db: DbSession): CategoryRepository {
  return {
    listWithCounts() {
      // `left join`, so an entry nobody has filed anything under is on the list with a zero.
      // That is most of the list on the day an archive is new, and exactly the entries an
      // Editor must still be able to choose.
      return db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          tavole: count(tavole.id),
        })
        .from(categories)
        .leftJoin(tavole, eq(tavole.categoryId, categories.id))
        .groupBy(categories.id)
        .orderBy(asc(categories.name));
    },

    async countUncategorised() {
      const [row] = await db
        .select({ tavole: count(tavole.id) })
        .from(tavole)
        .where(isNull(tavole.categoryId));
      return row?.tavole ?? 0;
    },

    async findBySlug(slug) {
      const [row] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
      return row ?? null;
    },

    async add(name, slug) {
      const [row] = await db.insert(categories).values({ name, slug }).returning();
      if (!row) {
        throw new Error('Inserting a Category returned nothing.');
      }
      return row;
    },

    async rename(id, name, slug) {
      const [row] = await db
        .update(categories)
        .set({ name, slug })
        .where(eq(categories.id, id))
        .returning();
      return row ?? null;
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
