import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

/**
 * A Part is a component identified **in its own right** rather than by where it appears, which
 * is ADR 0001 written as a table: no column here names a Tavola or a Position, because the same
 * Part is listed on many drawings and fits many cars. Where it appears is a Listing, below.
 *
 * **Almost everything is nullable, and that is the archive being honest rather than lax.** Much
 * of what arrives is a description and nothing else; a Part with no Catalog Number is finished,
 * not half-recorded, and the interface says so instead of inventing one. The one thing a Part
 * cannot be is nameless, which the check constraint is here to guarantee — a row that could be
 * shown to a member as a blank line is not a Part.
 *
 * `catalogNumber` is unique **when present**, which is exactly what a Postgres unique constraint
 * over a nullable column means: any number of Parts may have none, and no two may claim the same
 * one. That collision is the deduplication mechanism the whole "where else does this Part
 * appear" question rests on. `disegnoOrigine` is deliberately *not* unique: it is authoritative
 * when known and is still not what tells two Parts apart.
 */
export const parts = pgTable(
  'parts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameEn: text('name_en'),
    /** The factory's own words, as the catalog prints them. */
    nameIt: text('name_it'),
    /** The catalog's first column. An opaque string, printed spacing and all. */
    catalogNumber: text('catalog_number'),
    /** The original factory drawing number. Prominent, and not an identity. */
    disegnoOrigine: text('disegno_origine'),
    description: text('description'),
    dimensions: text('dimensions'),
    materialFinish: text('material_finish'),
    /**
     * Transcribed from the factory catalog, in the factory's words.
     *
     * **A column of its own, and it stays one.** Evidence and interpretation are two different
     * things to a member deciding what to buy (story 62), and a schema that let them share a
     * field would make the distinction unrecoverable no matter what the screens did.
     */
    catalogNote: text('catalog_note'),
    /** What the club has established. Distinct from the above, which nobody may improve. */
    note: text('note'),
  },
  (table) => [
    unique('parts_catalog_number_unique').on(table.catalogNumber),
    check('parts_have_a_name', sql`${table.nameEn} is not null or ${table.nameIt} is not null`),
  ],
);

/**
 * A Listing is one Part's appearance on one Tavola: where it sits, how many are fitted per car
 * *there*, and whether the drawing shows it.
 *
 * **The quantity is here and not on the Part**, because one Part legitimately takes four on one
 * drawing and two on another — the same washer, counted where it is used. A Part carrying a
 * single quantity would have to be split into two Parts to say that, which is the duplication
 * ADR 0001 exists to prevent.
 *
 * `positionId` is **optional**: a Part may be listed on a sheet the catalog names it on without
 * anybody having decided which number it sits at. It becomes null rather than taking the Listing
 * with it when a Position is removed — a mistyped number is cheap to undo, and the Part data
 * hanging off it is not.
 *
 * `drawn` is the load-bearing flag. Several **drawn** Listings at one Position are alternatives,
 * fitted instead of one another; **undrawn** ones are the fasteners that share the Position and
 * are needed as well. Getting that backwards is the wrong parts arriving in the post.
 */
export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    tavolaId: uuid('tavola_id')
      .notNull()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'set null' }),
    /** How many are fitted per car here. Null where the catalog prints no count. */
    quantityPerCar: integer('quantity_per_car'),
    drawn: boolean('drawn').notNull().default(true),
  },
  (table) => [
    // One Part is listed once **at one Position**. Listing it twice there is a slip rather than
    // a statement, and it would be read on the screen as an alternative to itself.
    unique('listings_part_id_tavola_id_position_id_unique').on(
      table.partId,
      table.tavolaId,
      table.positionId,
    ),
    // And once on a sheet where it sits at **no** number, which the constraint above cannot say:
    // Postgres counts two NULLs as different, so without this the same Part could be listed twice
    // on one Tavola at no Position at all. It became reachable the moment a Tavola's Listings had
    // somewhere to be read (ticket 07), and it would print there as the same Part twice.
    uniqueIndex('listings_unplaced_part_unique')
      .on(table.partId, table.tavolaId)
      .where(sql`${table.positionId} is null`),
    index('listings_tavola_id_index').on(table.tavolaId),
    index('listings_position_id_index').on(table.positionId),
    // What answers "which other Tavole does this Part appear on".
    index('listings_part_id_index').on(table.partId),
    check(
      'listings_quantity_is_a_count',
      sql`${table.quantityPerCar} is null or ${table.quantityPerCar} > 0`,
    ),
  ],
);

export const modelsRelations = relations(models, ({ many }) => ({
  tavole: many(tavole),
}));

export const tavoleRelations = relations(tavole, ({ one, many }) => ({
  model: one(models, { fields: [tavole.modelId], references: [models.id] }),
  category: one(categories, { fields: [tavole.categoryId], references: [categories.id] }),
  scan: one(scans, { fields: [tavole.id], references: [scans.tavolaId] }),
  positions: many(positions),
  listings: many(listings),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  tavola: one(tavole, { fields: [positions.tavolaId], references: [tavole.id] }),
  marks: many(marks),
  listings: many(listings),
}));

export const partsRelations = relations(parts, ({ many }) => ({
  listings: many(listings),
}));

export const listingsRelations = relations(listings, ({ one }) => ({
  part: one(parts, { fields: [listings.partId], references: [parts.id] }),
  tavola: one(tavole, { fields: [listings.tavolaId], references: [tavole.id] }),
  position: one(positions, { fields: [listings.positionId], references: [positions.id] }),
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
export type PartRow = typeof parts.$inferSelect;
export type NewPartRow = typeof parts.$inferInsert;
export type ListingRow = typeof listings.$inferSelect;
export type NewListingRow = typeof listings.$inferInsert;
