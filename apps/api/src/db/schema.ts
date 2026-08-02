import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

/**
 * A Model is a vehicle as the factory catalogs distinguish them — brand, model, series and
 * model years. It is the only vehicle-shaped thing in the language and the root the whole
 * catalog hangs from, so it is the table the skeleton's end-to-end route reads.
 *
 * Deliberately minimal: ticket 03 owns the rest of Model, Tavola, Position, Mark and Listing.
 */
export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  brand: text('brand').notNull(),
  name: text('name').notNull(),
  series: text('series'),
  /** As the catalog writes them — "1963–65", "from 1965". Free text, never parsed. */
  modelYears: text('model_years'),
});

export type ModelRow = typeof models.$inferSelect;
export type NewModelRow = typeof models.$inferInsert;
