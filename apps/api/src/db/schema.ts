import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A Model is a vehicle as the factory catalogs distinguish them — brand, model, series and
 * model years. It is the only vehicle-shaped thing in the language and the root the whole
 * catalog hangs from.
 *
 * Chassis and date breaks are deliberately **not** structured here; they are a free-text
 * qualifier on a Fitment, which arrives with ticket 08.
 */
export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  brand: text('brand').notNull(),
  name: text('name').notNull(),
  series: text('series'),
  /** As the catalog writes them — "1963–65", "from 1965". Free text, never parsed. */
  modelYears: text('model_years'),
});

/**
 * A Category is the system of the car a Tavola belongs to — Brakes, Electrical, Fuel System.
 *
 * It is a table rather than a string on the Tavola because a Category groups tavole *across*
 * Models, which "Brakes", "brakes" and "Braking" cannot do. Editors type a name and the slug
 * decides whether that is a new Category or one that already exists, so consistency comes from
 * the system rather than from discipline.
 *
 * It is **not** the factory's Sezione: that is provenance recorded on the Tavola below.
 */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** As the Editor wrote it — this is what members read. */
  name: text('name').notNull(),
  /** Lower-case, punctuation-free. What decides whether two names are the same Category. */
  slug: text('slug').notNull().unique(),
});

/**
 * A Tavola is a factory exploded-view drawing belonging to exactly one Model (ADR 0002),
 * carrying an Italian and an English name. Its number is meaningful only within its Model,
 * which is why the uniqueness constraint is on the pair.
 *
 * A Tavola with no Scan is a legitimate state: a catalog page can be recorded from a
 * photocopy long before anyone has a scanner in front of the original.
 */
export const tavole = pgTable(
  'tavole',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    /** As printed on the sheet. An opaque string — "12", "12 bis" — never arithmetic. */
    number: text('number').notNull(),
    /**
     * The leading digits of `number`, so a Model's tavole list reads 2, 10, 12 rather than
     * 10, 12, 2. Derived at write time and never shown; `number` is what a member sees.
     */
    numberSort: integer('number_sort'),
    nameIt: text('name_it').notNull(),
    nameEn: text('name_en').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),

    /**
     * The factory's own classification, printed on the sheet as *Sezione*, *Gruppo* and
     * *Sottogruppo*, and recorded exactly as the factory wrote it.
     *
     * **Provenance, not navigation.** These exist so a member can match a screen against a
     * paper catalog (story 37); nothing filters, groups or sorts by them, and nothing may
     * tidy them up. The Category above is what navigation uses.
     */
    catalogSection: text('catalog_section'),
    catalogGroup: text('catalog_group'),
    catalogSubgroup: text('catalog_subgroup'),
  },
  (table) => [
    unique('tavole_model_id_number_unique').on(table.modelId, table.number),
    index('tavole_model_id_index').on(table.modelId),
    index('tavole_category_id_index').on(table.categoryId),
  ],
);

/**
 * A Scan is one uploaded photograph of a Tavola's sheet, together with what ingest made of it.
 *
 * **One row is the Tavola's current scan** — re-uploading writes a new row and drops the old
 * one, so a Tavola is never left pointing at files that are gone. The row id is in every image
 * URL, which is what lets those URLs be cached immutably: a new upload is a new id and
 * therefore a new address.
 *
 * The measurement columns — source dimensions and every byte size — are recorded on **every**
 * scan, deliberately. Whether these drawings need deep-zoom tiling was decided on an
 * assumption nobody had verified (ADR 0013); rather than ask a volunteer to measure a dozen
 * files by hand, the archive now measures itself as real scans arrive.
 */
export const scans = pgTable('scans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tavolaId: uuid('tavola_id')
    .notNull()
    .unique()
    .references(() => tavole.id, { onDelete: 'cascade' }),

  /** What the Editor uploaded, kept verbatim: nothing derived is ever the archive's copy. */
  sourceFormat: text('source_format').notNull(),
  sourceByteSize: integer('source_byte_size').notNull(),
  /** The measurement the tiling question turns on. */
  sourceWidth: integer('source_width').notNull(),
  sourceHeight: integer('source_height').notNull(),

  /** What a member's browser is actually sent when they open the drawing. */
  displayFormat: text('display_format').notNull(),
  displayByteSize: integer('display_byte_size').notNull(),
  displayWidth: integer('display_width').notNull(),
  displayHeight: integer('display_height').notNull(),

  /** The thumbnail a list of Tavole shows, so listing them never downloads a drawing. */
  previewByteSize: integer('preview_byte_size').notNull(),

  /** Keys in the private file store. Not paths, not URLs — nothing here is reachable. */
  originalKey: text('original_key').notNull(),
  displayKey: text('display_key').notNull(),
  previewKey: text('preview_key').notNull(),

  /** From the injected clock, never the system's idea of now. */
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull(),
});

/**
 * A Position is a number printed on a Tavola, and it **exists in its own right**: no column
 * here points at a Part, and none ever will. Marking a sheet up and finding out what sits at
 * each number are separate evenings' work, so a Tavola may carry two hundred Positions about
 * which nothing whatever is known, indefinitely, and that is a finished state rather than a
 * half-done one.
 *
 * The number is stored **as printed** — `207`, `210 S`, `211 D` — because it is an identifier a
 * member compares character by character against a stamped bracket, not a quantity. `numberSort`
 * is the same derived key the Tavola's own number carries, and exists for the same reason: a
 * list that reads 1, 2, 10 rather than 1, 10, 2.
 */
export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tavolaId: uuid('tavola_id')
      .notNull()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    /** As printed on the sheet, suffix and all. An opaque string, never arithmetic. */
    number: text('number').notNull(),
    /** The leading digits of `number`. Derived at write time, never shown. */
    numberSort: integer('number_sort'),
  },
  (table) => [
    // The factory printed one number once. Two Positions numbered 210 on one sheet would be
    // two answers to a member's only question, and the database is what makes that impossible
    // — including for two Editors marking the same drawing at the same moment.
    unique('positions_tavola_id_number_unique').on(table.tavolaId, table.number),
    index('positions_tavola_id_index').on(table.tavolaId),
  ],
);

/**
 * A Mark is a place on the scan where a Position's number appears.
 *
 * **Zero or more per Position, and both ends of that are ordinary.** The factory printed the
 * same number wherever the part is used, so a Position with four Marks is four circles a member
 * can click; a Position with none is one that is listed but not drawn.
 *
 * `x` and `y` are **fractions of the drawing**, not pixels of any particular file (ADR 0013).
 * That is what makes a Tavola re-scanned at a different resolution — or one day delivered as
 * tiles instead of a single image — keep every evening of marking that has been done on it.
 */
export const marks = pgTable(
  'marks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'cascade' }),
    /** Across the drawing, `0` at its left edge and `1` at its right. */
    x: doublePrecision('x').notNull(),
    /** Down the drawing, `0` at its top edge and `1` at its bottom. */
    y: doublePrecision('y').notNull(),
  },
  (table) => [index('marks_position_id_index').on(table.positionId)],
);

export const modelsRelations = relations(models, ({ many }) => ({
  tavole: many(tavole),
}));

export const tavoleRelations = relations(tavole, ({ one, many }) => ({
  model: one(models, { fields: [tavole.modelId], references: [models.id] }),
  category: one(categories, { fields: [tavole.categoryId], references: [categories.id] }),
  scan: one(scans, { fields: [tavole.id], references: [scans.tavolaId] }),
  positions: many(positions),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  tavola: one(tavole, { fields: [positions.tavolaId], references: [tavole.id] }),
  marks: many(marks),
}));

export const marksRelations = relations(marks, ({ one }) => ({
  position: one(positions, { fields: [marks.positionId], references: [positions.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  tavole: many(tavole),
}));

export const scansRelations = relations(scans, ({ one }) => ({
  tavola: one(tavole, { fields: [scans.tavolaId], references: [tavole.id] }),
}));

export type ModelRow = typeof models.$inferSelect;
export type NewModelRow = typeof models.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
export type TavolaRow = typeof tavole.$inferSelect;
export type NewTavolaRow = typeof tavole.$inferInsert;
export type ScanRow = typeof scans.$inferSelect;
export type NewScanRow = typeof scans.$inferInsert;
export type PositionRow = typeof positions.$inferSelect;
export type NewPositionRow = typeof positions.$inferInsert;
export type MarkRow = typeof marks.$inferSelect;
export type NewMarkRow = typeof marks.$inferInsert;
