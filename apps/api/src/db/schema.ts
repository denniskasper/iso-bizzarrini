import type {
  CatalogRunActionKind,
  CatalogRunState,
  Currency,
  EquivalentKind,
  MarkPoint,
  MembershipGrant,
  ProcessorRole,
  ProposalKind,
  ProposalSpeaker,
  ProposalStatus,
  ProposalSummary,
  ReadingMethodKind,
  Role,
  SampleEndReason,
  SourceCondition,
  SpendingPurpose,
  TavolaState,
  TokenPurpose,
} from '@ricambi/contracts';
import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import type { CostRecord } from '../reading/cost.js';
import type { SheetIdentity } from '../reading/reading-method.js';
import type { MachineTranslation } from '../reading/translation.js';

/**
 * A fixed set of values written into a check constraint, from the same list the application
 * validates against — so a fifth kind of Equivalent cannot be accepted by one and refused by the
 * other. The values are literals in this file and never anything a request carries.
 */
function oneOf(values: readonly string[]) {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

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
 * Models, which "Brakes", "brakes" and "Braking" cannot do. **The list is maintained**: an
 * Administrator adds to it and renames what is on it, and an Editor filing a Tavola chooses from
 * it. The slug decides whether two names are the same Category, so consistency comes from the
 * system rather than from discipline.
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
 * Whether an Editor has compared a Tavola with its sheets (ADR 0017). A machine-read Tavola
 * arrives `unchecked` and is shown to nobody but Editors; publishing it is an Editor's statement
 * that it says what the factory printed. A Tavola an Editor records by hand is theirs already,
 * so `published` is where one begins unless it was read by machine.
 */
export const TAVOLA_STATES = ['unchecked', 'published'] as const satisfies readonly TavolaState[];

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
    /**
     * `nameEn` is a Machine translation of `nameIt` that nobody has vouched for yet (ADR 0017).
     * Cleared when an Editor confirms or rewrites the name, and never by publishing the Tavola.
     */
    nameEnMachineTranslated: boolean('name_en_machine_translated').notNull().default(false),
    /**
     * `null` is a Tavola nobody has put under a system yet — a legitimate state, the same way a
     * Tavola with no scan is. It is still on its Model's sheet and is never hidden by a filter.
     */
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),

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

    state: text('state').notNull().$type<TavolaState>().default('published'),
    /**
     * Who vouched for it and when — set by the act of publishing, and so `null` on every Tavola
     * that was Published before there was such an act. Deleting the Account keeps the date and
     * drops the name (ADR 0007).
     */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references((): AnyPgColumn => accounts.id, {
      onDelete: 'set null',
    }),
    /**
     * What read it off the factory's sheets (ADR 0017) — `null` for a Tavola a person recorded.
     * An Editor may see it, to know which Tavole to read again if a method proves bad; a Member
     * never does.
     */
    readingMethod: text('reading_method'),
  },
  (table) => [
    check('tavole_state_is_one_of_two', sql`${table.state} in (${oneOf(TAVOLA_STATES)})`),
    check(
      'tavole_an_unchecked_tavola_was_never_published',
      sql`${table.state} = 'published' or ${table.publishedAt} is null`,
    ),
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
export const scans = pgTable(
  'scans',
  {
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

    /**
     * How many quarter turns clockwise the display and preview are from the upload (issue #34):
     * an Editor turns a sheet that was scanned on its side, and the original stays as it arrived.
     */
    quarterTurns: integer('quarter_turns').notNull().default(0),

    /** From the injected clock, never the system's idea of now. */
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('scans_quarter_turns_within_a_turn', sql`${table.quarterTurns} between 0 and 3`),
  ],
);

/**
 * A Table sheet is the picture of one of a Tavola's table fogli, kept as the evidence its
 * Listings were read from (ADR 0017). As private as the Scan, and stored the same way: the file
 * is in the private store under a key, never at a path anything serves.
 *
 * `sheet` is its place among the Tavola's Table sheets, counting from 1, in the order the
 * factory printed them.
 */
export const tableSheets = pgTable(
  'table_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tavolaId: uuid('tavola_id')
      .notNull()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    sheet: integer('sheet').notNull(),
    format: text('format').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** A key in the private file store. */
    originalKey: text('original_key').notNull(),
    /** From the injected clock, never the system's idea of now. */
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('table_sheets_tavola_id_sheet_unique').on(table.tavolaId, table.sheet),
    check('table_sheets_count_from_one', sql`${table.sheet} > 0`),
  ],
);

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
    /**
     * The named group this number sits in, if any — **at most one, and that is the whole rule**
     * (spec, Implementation Decisions). A column here rather than a join table is what makes
     * "belongs to at most one" a thing the database enforces instead of a thing screens
     * remember, and it is why no nesting is reachable: a Sub-assembly holds Positions and a
     * Position holds nothing.
     *
     * Null on removal rather than cascading: dissolving a group is not deleting the numbers
     * that were in it.
     */
    subAssemblyId: uuid('sub_assembly_id').references((): AnyPgColumn => subAssemblies.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    // The factory printed one number once. Two Positions numbered 210 on one sheet would be
    // two answers to a member's only question, and the database is what makes that impossible
    // — including for two Editors marking the same drawing at the same moment.
    unique('positions_tavola_id_number_unique').on(table.tavolaId, table.number),
    index('positions_tavola_id_index').on(table.tavolaId),
    index('positions_sub_assembly_id_index').on(table.subAssemblyId),
  ],
);

/**
 * A named group of Positions within one Tavola — *Window Slider*, *Door Lock*.
 *
 * **A labelling device, and explicitly not a bill of materials** (spec, Out of Scope). It has no
 * number, nothing orders it, and it contains Positions rather than Parts: what a member gets
 * from it is "these eleven numbers go together", which is what somebody taking a door apart
 * actually wants and is a great deal less than a parts tree pretends to know.
 *
 * The name is unique within its Tavola. Two groups called *Door Lock* on one sheet would be one
 * group somebody recorded twice, and reading them as two would split the very numbers the group
 * exists to hold together.
 */
export const subAssemblies = pgTable(
  'sub_assemblies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tavolaId: uuid('tavola_id')
      .notNull()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    /** As whoever grouped them wrote it. This is what members read. */
    name: text('name').notNull(),
    /**
     * What the club has established about the assembly as a whole, written by an Editor — like a
     * Part's Note, and written once here rather than on each of its screws (issue #110).
     */
    note: text('note'),
    /**
     * Where it is on the Scan, drawn round by an Editor (issue #113): an ordered list of at least
     * three corners, in the same fractions of the drawing a Mark is placed in (ADR 0013), so it
     * survives a re-scan and turns with the sheet. `null` is a Sub-assembly nobody has outlined,
     * which is as valid as one somebody has.
     *
     * One column rather than a table of corners, because an outline is only ever read, written
     * and replaced whole: nothing asks for its third corner.
     */
    outline: jsonb('outline').$type<MarkPoint[]>(),
  },
  (table) => [
    unique('sub_assemblies_tavola_id_name_unique').on(table.tavolaId, table.name),
    index('sub_assemblies_tavola_id_index').on(table.tavolaId),
  ],
);

/**
 * Two Positions on one sheet an Editor has linked because the parts work together — the guide
 * rod and the one channel it runs in, rather than the eleven numbers of the window mechanism.
 *
 * **The link is symmetric, and it is one row** (spec, Implementation Decisions). Recording it
 * from either end has to make it visible from both, and the cheapest way to be sure of that is
 * to make the other arrangement unrepresentable: the check constraint refuses a row whose ends
 * are not in ascending order, so a pair has exactly one row whichever way round it was entered,
 * and there is no second row to forget to write or to let drift.
 *
 * That is why a reader looks for its own id on *either* end. Both ends are indexed for it.
 */
export const relatedPositions = pgTable(
  'related_positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'cascade' }),
    relatedPositionId: uuid('related_position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'cascade' }),
  },
  (table) => [
    unique('related_positions_pair_unique').on(table.positionId, table.relatedPositionId),
    index('related_positions_position_id_index').on(table.positionId),
    index('related_positions_related_position_id_index').on(table.relatedPositionId),
    // One link, one row, in one order — and never a number related to itself.
    check(
      'related_positions_are_one_ordered_pair',
      sql`${table.positionId} < ${table.relatedPositionId}`,
    ),
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
 * A Sample is a Published Tavola an Administrator shows to Visitors (ADR 0019), with **one** of
 * its Positions open. A row of its own keyed by the Tavola, so a Tavola is one at most and there is
 * no limit on how many are.
 *
 * Its drawing is a **smaller public copy** of the Scan, made when it is marked and stored under a
 * key of its own: never the Scan's files, which stay behind the authenticated route (ADR 0013).
 * `drawingId` is in the copy's public address, and a new copy is a new id, so that address never
 * changes what it points at.
 *
 * Removing the open Position ends it (issue #130): the row goes with the number, and an
 * `ended_samples` row says that it did.
 */
export const samples = pgTable(
  'samples',
  {
    tavolaId: uuid('tavola_id')
      .primaryKey()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    /** The one number a Visitor may read. Always on the same Tavola, which the service checks. */
    positionId: uuid('position_id')
      .notNull()
      .references(() => positions.id, { onDelete: 'cascade' }),
    /** When it was first shown. Opening another number does not move it. */
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull(),
    markedBy: uuid('marked_by').references((): AnyPgColumn => accounts.id, {
      onDelete: 'set null',
    }),
    drawingId: uuid('drawing_id').notNull().unique(),
    /** A key in the file store, under a prefix nothing but the public copies are kept in. */
    drawingKey: text('drawing_key').notNull(),
    drawingWidth: integer('drawing_width').notNull(),
    drawingHeight: integer('drawing_height').notNull(),
    drawingByteSize: integer('drawing_byte_size').notNull(),
  },
  (table) => [index('samples_position_id_index').on(table.positionId)],
);

/**
 * **A Sample that stopped being one by itself** (issue #130): its open Position was removed, so
 * there was nothing left for a Visitor to read. Kept so Administrators are told it ended and why,
 * and can show the Tavola again with another number open — which, like stopping it, clears this.
 *
 * Nothing of the Sample is kept beyond the number it had open: its public copy is deleted with it.
 */
export const SAMPLE_END_REASONS = ['removed'] as const satisfies readonly SampleEndReason[];

export const endedSamples = pgTable(
  'ended_samples',
  {
    tavolaId: uuid('tavola_id')
      .primaryKey()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    /** The number that was open, as it was printed: the Position itself is gone. */
    openNumber: text('open_number').notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull().$type<SampleEndReason>(),
  },
  (table) => [
    check('ended_samples_reason_is_known', sql`${table.reason} in (${oneOf(SAMPLE_END_REASONS)})`),
  ],
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
    /**
     * `nameEn` is a Machine translation of `nameIt` that nobody has vouched for yet (ADR 0017).
     * Cleared when an Editor confirms or rewrites the name.
     */
    nameEnMachineTranslated: boolean('name_en_machine_translated').notNull().default(false),
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
    /**
     * A Machine translation of `catalogNote`, always shown as one and beside the Italian. The
     * Italian stays the evidence; this goes when the note it translated is changed.
     */
    catalogNoteEn: text('catalog_note_en'),
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
    /**
     * Which of the Tavola's Table sheets the read command read this Listing from (ADR 0017), so
     * an Editor checking it sees the row beside the sheet it came from. `null` for a Listing a
     * person recorded.
     */
    tableSheet: integer('table_sheet'),
    /**
     * Where one Reading hesitated over this row and the other read the same (ADR 0017, #29 story
     * 16): worth a glance, never a doubt. `null` for a row neither hesitated over, and for a
     * Listing a person recorded.
     */
    readingNote: text('reading_note'),
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

/**
 * **What the read command was unsure of** on an Unchecked Tavola (ADR 0017): the two Readings
 * disagreed on a row, or a Catalog Number is not shaped like one. Each concerns a Listing or a
 * Position, which is where the Editor checking the Tavola is taken to look. The words are the
 * read command's, or the Editor's once they have rewritten them on the checking screen (#56).
 *
 * An Editor who has looked at one clears it, while the Tavola is Unchecked. Nothing else resolves
 * a doubt: publishing is allowed while doubts remain, and they go with the row or the number they
 * are about.
 */
export const readingDoubts = pgTable(
  'reading_doubts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tavolaId: uuid('tavola_id')
      .notNull()
      .references(() => tavole.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'cascade' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
  },
  (table) => [index('reading_doubts_tavola_id_index').on(table.tavolaId)],
);

/** Where a Catalog run stands (issues #57, #58, #65). */
export const CATALOG_RUN_STATES = [
  'estimating',
  'estimated',
  'running',
  'finished',
  'stopped-at-limit',
  'stopped-at-usage-limit',
  'stopped-at-monthly-limit',
  'stopped-after-failures',
  'stopped-by-administrator',
  'failed',
] as const satisfies readonly CatalogRunState[];

export const CATALOG_RUN_ACTIONS = [
  'started',
  'raised',
  'continued',
  'stopped',
  'removed',
] as const satisfies readonly CatalogRunActionKind[];

/**
 * A **Catalog run** (ADR 0018): one Administrator-started pass over one uploaded catalog PDF for
 * one Model. It begins `estimating`: the PDF is in the private file store, as a Scan is, and what
 * reading its pages would cost is being worked out on the server, page by page, as the read
 * command works it out (issue #65). Then it is `estimated`. Nothing has been sent to a model.
 *
 * The Reading method is recorded by its kind, which is all the Readings section ever says about
 * it. The price list is recorded by the model it priced and the date it was checked, because the
 * list in the repository moves on and the estimate must still say what it was made from.
 */
export const catalogRuns = pgTable(
  'catalog_runs',
  {
    id: uuid('id').primaryKey(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    state: text('state').notNull().$type<CatalogRunState>(),
    /** A key in the private file store. Never a path and never a URL. */
    catalogKey: text('catalog_key').notNull(),
    catalogByteSize: integer('catalog_byte_size').notNull(),
    /** How many pages the PDF has. */
    catalogPages: integer('catalog_pages').notNull(),
    /** The pages to read, counting from 1, both included. */
    firstPage: integer('first_page').notNull(),
    lastPage: integer('last_page').notNull(),
    readingMethod: text('reading_method').notNull().$type<ReadingMethodKind>(),
    charged: boolean('charged').notNull(),
    /** The model the price list was read for, and when its prices were checked. */
    pricedModel: text('priced_model').notNull(),
    pricesCheckedOn: text('prices_checked_on').notNull(),
    /** In dollars, to a ten-thousandth of a cent. While estimating, for the pages priced so far. */
    estimate: doublePrecision('estimate').notNull(),
    /**
     * While estimating, how many of its pages have been priced, from `firstPage` on. What a server
     * that went away had priced is kept, and the next one prices on from there.
     */
    pagesEstimated: integer('pages_estimated').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** Who uploaded it. Deleting the Account keeps the run and drops the name (ADR 0007). */
    createdBy: uuid('created_by').references((): AnyPgColumn => accounts.id, {
      onDelete: 'set null',
    }),
    /** The most it may cost, in dollars, given when it was started. There is no default. */
    spendingLimit: doublePrecision('spending_limit'),
    /** What it has cost so far, in dollars: the running total, kept after every request. */
    spent: doublePrecision('spent').notNull().default(0),
    /**
     * The read command's `cost.json`, kept here: what each Tavola, sheet and Reading cost. One
     * record for each time the run read, as `cost.json`, `cost-2.json` and on are: it is started,
     * then continued after a stop or a restart (issue #59).
     */
    costs: jsonb('costs').notNull().$type<CostRecord[]>().default([]),
    /**
     * The pages that went into no Tavola, and why: one whose Tavola number could not be read is
     * set aside for a person rather than guessed (issue #60). Each page's image is kept in the
     * file store under the run, at `set-aside/page-N.png`.
     */
    setAside: jsonb('set_aside').notNull().$type<{ page: number; reason: string }[]>().default([]),
    /**
     * Where the run reads one Unchecked Tavola again from an earlier run's catalog (issue #61):
     * its number, and the pages it was found on, which are the only pages read. The catalog is the
     * earlier run's, shared rather than copied, and what those pages were found to be is carried
     * over, so they are not asked about again.
     */
    readsAgain: jsonb('reads_again').$type<{ tavola: string; pages: number[] }>(),
    /**
     * Why a failed run failed, or why a stopped one stopped where its state does not say it all,
     * in words with no credential in them.
     */
    failure: text('failure'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    startedBy: uuid('started_by').references((): AnyPgColumn => accounts.id, {
      onDelete: 'set null',
    }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    check('catalog_runs_state_is_known', sql`${table.state} in (${oneOf(CATALOG_RUN_STATES)})`),
    check(
      'catalog_runs_pages_run_forwards',
      sql`1 <= ${table.firstPage} and ${table.firstPage} <= ${table.lastPage} and ${table.lastPage} <= ${table.catalogPages}`,
    ),
    check(
      'catalog_runs_started_with_a_limit',
      sql`${table.state} in ('estimating', 'estimated') or ${table.spendingLimit} > 0`,
    ),
    index('catalog_runs_model_id_index').on(table.modelId),
    // **One Catalog run at a time** (issue #58), so two never spend against each other or read the
    // same Tavole. Refused by the database, so two Administrators starting at once cannot both.
    // A catalog being estimated is the one thing being read as much as a run is (issue #65).
    uniqueIndex('catalog_runs_one_reading')
      .on(sql`(${table.state} in ('estimating', 'running'))`)
      .where(sql`${table.state} in ('estimating', 'running')`),
  ],
);

/** What each page of a Catalog run was found to be, so a page is never asked about twice. */
export const catalogRunPages = pgTable(
  'catalog_run_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => catalogRuns.id, { onDelete: 'cascade' }),
    page: integer('page').notNull(),
    identity: jsonb('identity').notNull().$type<SheetIdentity>(),
  },
  (table) => [uniqueIndex('catalog_run_pages_page_unique').on(table.runId, table.page)],
);

/**
 * Each Tavola a Catalog run finished and handed to the loader: the Unchecked Tavola it became,
 * or why the loader refused it. What it cost is in the run's cost record.
 */
export const catalogRunTavole = pgTable(
  'catalog_run_tavole',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => catalogRuns.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    /** `null` where it was refused, or where it has since been replaced or deleted. */
    tavolaId: uuid('tavola_id').references(() => tavole.id, { onDelete: 'set null' }),
    refused: text('refused'),
    /**
     * When an Administrator removed the Tavola it became (issue #85), and who. Kept on the line of
     * the latest run that produced it, so the run says why its Tavola is gone. Deleting the
     * Account keeps when and drops who (ADR 0007).
     */
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedBy: uuid('removed_by').references((): AnyPgColumn => accounts.id, {
      onDelete: 'set null',
    }),
    /** What its Italian was translated as, so the Tavole read after a stop read the same. */
    machineTranslations: jsonb('machine_translations')
      .notNull()
      .$type<MachineTranslation[]>()
      .default([]),
    finishedAt: timestamp('finished_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('catalog_run_tavole_number_unique').on(table.runId, table.number)],
);

/**
 * **Who started, raised, continued or stopped a Catalog run, or removed a Tavola it read, and
 * when** (issues #59, #85). `by` is the Administrator; it is empty where the server carried the
 * run on after a restart, and where the Account has since been deleted (ADR 0007).
 */
export const catalogRunActions = pgTable(
  'catalog_run_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => catalogRuns.id, { onDelete: 'cascade' }),
    action: text('action').notNull().$type<CatalogRunActionKind>(),
    by: uuid('by').references((): AnyPgColumn => accounts.id, { onDelete: 'set null' }),
    at: timestamp('at', { withTimezone: true }).notNull(),
    /** The limit started with or raised to, in dollars. */
    spendingLimit: doublePrecision('spending_limit'),
    /** The number of the Tavola removed, for a `removed` action. */
    tavola: text('tavola'),
    /** The order they were recorded in, which two in the same instant cannot take from `at`. */
    sequence: integer('sequence').generatedAlwaysAsIdentity(),
  },
  (table) => [
    check(
      'catalog_run_actions_action_is_known',
      sql`${table.action} in (${oneOf(CATALOG_RUN_ACTIONS)})`,
    ),
    index('catalog_run_actions_run_id_index').on(table.runId),
  ],
);

/**
 * A Fitment says a Part fits a Model, in the words of whoever knew it.
 *
 * **The qualifier is free text and nothing ever parses it** — *"1963–64"*, *"from chassis #310"*,
 * *"late"*. Structured date and chassis ranges were considered and deliberately rejected (spec,
 * Out of Scope): they demand a precision nobody has, and every half-known break that did not fit
 * the shape would be dropped on the way in. The member reads the qualification and judges
 * compatibility themselves.
 *
 * One row per pair. A Part fits a car or it does not, and the qualifier is *how* — two rows for
 * one car would be the archive answering "does this fit my Grifo" twice, differently.
 */
export const fitments = pgTable(
  'fitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    /** As it was written. Null where the Part fits the car without qualification. */
    qualifier: text('qualifier'),
  },
  (table) => [
    unique('fitments_part_id_model_id_unique').on(table.partId, table.modelId),
    index('fitments_part_id_index').on(table.partId),
  ],
);

/**
 * The four kinds of Equivalent, **in the order a restorer reads them**: the supplier who made the
 * original, then another manufacturer's number, then a standard anybody sells, then a car to go
 * and find one in. This list is the archive's single answer to what the four are — the check
 * constraint, the request validation and the reading order are all it.
 */
export const EQUIVALENT_KINDS = [
  'oe-supplier',
  'oem',
  'industry-standard',
  'donor-vehicle',
] as const satisfies readonly EquivalentKind[];

/**
 * Another way to obtain what a Part does — **the single most valuable content this archive will
 * hold**, since the original is usually unobtainable and the equivalent usually is not.
 *
 * **Rows, and therefore unbounded.** The previous implementation of this product had two columns
 * for cross-references, so a Part with six known ones kept two; nothing here can lose a fact for
 * want of a slot to put it in.
 *
 * `reference` is nullable **on purpose and not as laxity**: a Donor Vehicle usually has none,
 * because often nobody knows what the other manufacturer called the same component, and the car
 * alone is what sends somebody to a scrapyard with something to look for.
 */
export const equivalents = pgTable(
  'equivalents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<EquivalentKind>().notNull(),
    /** Who or what it is of — *Girling*, *SKF*, *DIN 934*, *Fiat 124 Coupé*. */
    maker: text('maker').notNull(),
    /** The number to quote, where anybody knows it. */
    reference: text('reference'),
    note: text('note'),
  },
  (table) => [
    unique('equivalents_reference_unique').on(
      table.partId,
      table.kind,
      table.maker,
      table.reference,
    ),
    // And the same rule where there is no reference, which the constraint above cannot reach:
    // Postgres counts two NULLs as different, so without this one donor vehicle recorded twice
    // would print twice with nothing whatever to tell the two apart.
    uniqueIndex('equivalents_unreferenced_unique')
      .on(table.partId, table.kind, table.maker)
      .where(sql`${table.reference} is null`),
    index('equivalents_part_id_index').on(table.partId),
    check('equivalents_kind_is_one_of_four', sql`${table.kind} in (${oneOf(EQUIVALENT_KINDS)})`),
  ],
);

/** What a Source is offering. A restorer's decision changes completely depending on which. */
export const SOURCE_CONDITIONS = [
  'new-old-stock',
  'used',
  'reproduction',
] as const satisfies readonly SourceCondition[];

/** Where these cars actually trade. Fixed, so nothing carries a currency nobody sells in. */
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'] as const satisfies readonly Currency[];

/**
 * Somewhere a Part has actually been available, and what it cost when anybody last looked.
 *
 * **The price and its observed date are one fact, and the check constraint is what makes that
 * true.** A price without the date it was seen is how an archive misleads somebody by accident:
 * a figure from 2011 printed today reads as this morning's. The rule is enforced here rather
 * than by whoever builds the page, because there will be more than one page.
 *
 * The amount is in the currency's **minor unit** — `25000` is €250.00 — so no price is ever a
 * float and no rounding happens anywhere between the Editor's keyboard and the screen.
 *
 * **Nothing here is unique, deliberately.** The same shop at two prices on two dates is a price
 * history, which is exactly what a member wants when they are trying to work out whether a
 * figure has moved.
 */
export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** Null where the offer did not say, which the screen prints rather than guessing at. */
    condition: text('condition').$type<SourceCondition>(),
    /** In the currency's minor unit. Never a fraction, never a float. */
    priceAmount: integer('price_amount'),
    priceCurrency: text('price_currency').$type<Currency>(),
    /** The date the price above was seen. There is no price without it. */
    observedOn: date('observed_on', { mode: 'string' }),
    note: text('note'),
  },
  (table) => [
    index('sources_part_id_index').on(table.partId),
    check(
      'sources_condition_is_one_of_three',
      sql`${table.condition} is null or ${table.condition} in (${oneOf(SOURCE_CONDITIONS)})`,
    ),
    check(
      'sources_currency_is_tradeable',
      sql`${table.priceCurrency} is null or ${table.priceCurrency} in (${oneOf(CURRENCIES)})`,
    ),
    check(
      'sources_price_is_an_amount',
      sql`${table.priceAmount} is null or ${table.priceAmount} > 0`,
    ),
    // **The rule the whole thing turns on.** All three together, or none of them: a price cannot
    // exist here without the date it was seen, so no screen can render one without it.
    check(
      'sources_price_carries_its_date',
      sql`(${table.priceAmount} is null and ${table.priceCurrency} is null and ${table.observedOn} is null)
       or (${table.priceAmount} is not null and ${table.priceCurrency} is not null and ${table.observedOn} is not null)`,
    ),
  ],
);

/**
 * A photograph of a Part — the thing a member holds a bracket up against (story 77) — or of a
 * Sub-assembly, the window slider as it looks put together (issue #111).
 *
 * **It hangs off the Part and off no Listing**, which is ADR 0001 again: the same washer
 * photographed once is the same washer on every sheet it is listed on, and a photograph attached
 * to a Listing would be the same picture uploaded six times and corrected in five of them. A
 * Sub-assembly is on one Tavola only, so its photographs go with that Tavola. **One owner, never
 * both and never neither**, which the check constraint holds; the order is each owner's own.
 *
 * `sequence` is what makes the list an *order* rather than an accident of insertion. The first
 * photograph is the one that identifies the Part — the one a grid shows first and a member sees
 * without scrolling — so which it is has to be an Editor's decision and not the database's.
 * There is deliberately **no** unique constraint over `(partId, sequence)`: reordering rewrites
 * every row of one Part in one statement, and a uniqueness rule enforced row by row would refuse
 * the intermediate states of an operation that is atomic anyway.
 *
 * The measurement columns are the ones a Scan carries and are here for the same reason: the
 * archive measures what it is actually given rather than what somebody assumed it would be.
 */
export const photographs = pgTable(
  'photographs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id').references(() => parts.id, { onDelete: 'cascade' }),
    subAssemblyId: uuid('sub_assembly_id').references(() => subAssemblies.id, {
      onDelete: 'cascade',
    }),

    /** Where it sits in its owner's order, from `0`. Ties break on `id`, so the list is total. */
    sequence: integer('sequence').notNull(),

    /** What the Editor uploaded, kept verbatim: nothing derived is ever the archive's copy. */
    sourceFormat: text('source_format').notNull(),
    sourceByteSize: integer('source_byte_size').notNull(),
    sourceWidth: integer('source_width').notNull(),
    sourceHeight: integer('source_height').notNull(),

    /** What a member's browser is sent when they open the photograph larger. */
    displayFormat: text('display_format').notNull(),
    displayByteSize: integer('display_byte_size').notNull(),
    displayWidth: integer('display_width').notNull(),
    displayHeight: integer('display_height').notNull(),

    /** The thumbnail the Part's own panel shows, so reading a Position downloads none of these. */
    previewByteSize: integer('preview_byte_size').notNull(),

    /** Keys in the private file store. Not paths, not URLs — nothing here is reachable. */
    originalKey: text('original_key').notNull(),
    displayKey: text('display_key').notNull(),
    previewKey: text('preview_key').notNull(),

    /** From the injected clock, never the system's idea of now. */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Named for both columns, because it is on both: the Part's photographs, already in order.
    index('photographs_part_id_sequence_index').on(table.partId, table.sequence),
    index('photographs_sub_assembly_id_sequence_index').on(table.subAssemblyId, table.sequence),
    check('photographs_sequence_is_a_place', sql`${table.sequence} >= 0`),
    check(
      'photographs_belong_to_one_owner',
      sql`num_nonnulls(${table.partId}, ${table.subAssemblyId}) = 1`,
    ),
  ],
);

/**
 * A Unit is what a Specification's quantity is counted in — *g*, *mm*, *Nm* — written one way
 * only. **The list is an Administrator's**, like the Categories, and a Specification name fixes
 * which Unit its values are counted in, so an Editor never types one.
 *
 * Case is the meaning (*mm* and *Mm* are different things), so the key that decides sameness
 * ignores only spacing.
 */
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** As it is printed beside a value. */
  symbol: text('symbol').notNull(),
  /** The symbol with every space taken out. What decides whether two Units are the same. */
  key: text('key').notNull().unique(),
});

/**
 * The names a Part's Specifications are recorded under — *Material*, *Length*, *Weight* — kept
 * by an Administrator in the order a Part's Specifications read in.
 *
 * The slug decides whether two names are the same, as a Category's does, so *Weight*, *weight*
 * and *weight.* are one name. The Unit is the name's and never the value's: a name without one
 * takes words.
 */
export const specificationNames = pgTable(
  'specification_names',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** As the Administrator wrote it — this is what members read. */
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    /** Refused removal while a name counts in it: no value is left counted in nothing. */
    unitId: uuid('unit_id').references(() => units.id, { onDelete: 'restrict' }),
    /** Where it sits in the list, from `0`. Ties break on `id`, so the order is total. */
    sequence: integer('sequence').notNull(),
  },
  (table) => [check('specification_names_sequence_is_a_place', sql`${table.sequence} >= 0`)],
);

/**
 * A Specification: one Part's value for one name, at most one per Part per name.
 *
 * A name with a Unit is a number and one without is words, so exactly one of the two values is
 * held. The Unit is not stored here; it is read from the name, which is what makes changing a
 * name's Unit refusable once anything is counted in it.
 */
export const specifications = pgTable(
  'specifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),
    /** Refused removal while a Part has a value for it. */
    nameId: uuid('name_id')
      .notNull()
      .references(() => specificationNames.id, { onDelete: 'restrict' }),
    valueNumber: numeric('value_number'),
    valueText: text('value_text'),
  },
  (table) => [
    unique('specifications_one_per_part_and_name').on(table.partId, table.nameId),
    index('specifications_name_id_index').on(table.nameId),
    check(
      'specifications_one_value',
      sql`(${table.valueNumber} is null) <> (${table.valueText} is null)`,
    ),
  ],
);

/**
 * The three roles, in the order of what they may do. Club Officer is deliberately folded into
 * Administrator while there is one Club.
 */
export const ROLES = ['member', 'editor', 'administrator'] as const satisfies readonly Role[];

/**
 * How the Club came to grant a term. `opening-entry` is an Administrator asserting one that was
 * paid for before this system existed; `bank-transfer` is money that arrived; `roster-import` is
 * a term the Club's own annual membership list asserted (ticket 16); `payment-provider` is money
 * the payment provider confirmed had arrived (issue #4).
 *
 * **Which of them granted a term is worth keeping** rather than folding the last into the first:
 * an opening entry is one Administrator's assertion about one person, and an imported one arrived
 * in a file of two hundred. When a member says the Club has their date wrong, that difference is
 * the first thing anybody looking into it wants to know.
 */
export const MEMBERSHIP_GRANTS = [
  'opening-entry',
  'bank-transfer',
  'roster-import',
  'payment-provider',
] as const satisfies readonly MembershipGrant[];

/** The two reasons to send somebody a link that sets a password. */
export const TOKEN_PURPOSES = [
  'invitation',
  'password-reset',
] as const satisfies readonly TokenPurpose[];

/** The Club is one row and this is its id. Written into the check constraint that says so. */
export const SOLE_CLUB_ROW = 1;

/**
 * An Account is one person, keyed by their e-mail address.
 *
 * **"On the roster" and "has an account" are distinct states**, and this one row carries both:
 * an Administrator adds a person, which is a row here with no password; the person redeems
 * their invitation and chooses one, which is `passwordSetAt`. The roster screen reads the
 * difference and answers "I paid, why can't I get in" without anyone guessing.
 *
 * `passwordHash` is the only thing here nobody may read back — not an Administrator, not an
 * Editor, not a screen. Nothing in the application selects it except the sign-in check.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Normalised to lower case before it is written, because `A@club.example` and
     * `a@club.example` are one person and a roster that thinks otherwise invites them twice.
     */
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: text('role').notNull().$type<Role>().default('member'),
    /**
     * Argon2 would be better; this is scrypt, whose parameters travel inside the string so a
     * cost raised years from now still verifies what was written under the old one. Null until
     * the member has redeemed their invitation — an Administrator never sets it (story 3).
     */
    passwordHash: text('password_hash'),
    /** When the member chose their password. What "activated" means on the roster screen. */
    passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
    /**
     * Which generation of sessions is still good. Every cookie carries the number it was issued
     * under, and a session whose number is not this one is dead however far off its own expiry is.
     *
     * This is what makes a password reset mean something: setting a password bumps it, so the
     * browser doing the resetting gets the new number and every other one stops working. A
     * counter rather than a timestamp, deliberately — the session being issued and the sessions
     * being killed happen in the same instant, and an instant cannot tell them apart.
     */
    sessionEpoch: integer('session_epoch').notNull().default(0),
    /** From the injected clock. When an Administrator put this person on the roster. */
    addedAt: timestamp('added_at', { withTimezone: true }).notNull(),
    /**
     * **Whether an Administrator has let them propose** (issue #152). A capability of its own
     * beside the role, so somebody can propose without being made an Editor. Never set in
     * Production, which refuses to grant it.
     */
    mayPropose: boolean('may_propose').notNull().default(false),
  },
  (table) => [check('accounts_role_is_one_of_three', sql`${table.role} in (${oneOf(ROLES)})`)],
);

/**
 * A Membership is **one term**, not a switch. Access requires at least one whose Paid-through
 * has not passed, so a member's history is the rows and their access is the latest date among
 * them.
 *
 * Recording a payment writes a new row rather than moving an old one, which is what makes the
 * money auditable: a term that was granted is never edited away, and the statutory retention
 * period (ADR 0007) has something to retain.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Whose term this is. **Null once the Account is gone and the row is a payment record** — the
     * money has to be accounted for longer than the person has to be remembered (ADR 0007), so
     * erasing somebody lets go of the reference and keeps the row. A term nobody paid for is not
     * a payment record, and is deleted with the Account instead.
     */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /**
     * Who paid, written **only at the moment their Account is erased**. Until then the name is
     * the Account's and is read from there; afterwards this is the one place it survives, because
     * a payment the Club cannot attribute is not a record an auditor can use.
     */
    payerName: text('payer_name'),
    /** The last day this term covers. A date, because membership runs in days and not instants. */
    paidThrough: date('paid_through', { mode: 'string' }).notNull(),
    /** How the Club came to grant this term — see `MEMBERSHIP_GRANTS`. */
    grantedBy: text('granted_by').notNull().$type<MembershipGrant>(),
    /** In the currency's minor unit, like every other amount here. Null for an opening entry. */
    amount: integer('amount'),
    currency: text('currency').$type<Currency>(),
    /** The day the money arrived, as the Administrator read it off the statement. */
    receivedOn: date('received_on', { mode: 'string' }),
    /** The reference the member actually used, which is how a transfer is matched to a person. */
    reference: text('reference'),
    /**
     * The Administrator who recorded it. Nullable because the Account may be erased under the
     * retention rule (ADR 0007) long before the payment record may — the money outlives the
     * person on it, so the reference goes to null rather than taking the row with it.
     */
    recordedBy: uuid('recorded_by').references((): AnyPgColumn => accounts.id, {
      onDelete: 'set null',
    }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    /**
     * The payment provider's id for the payment that bought this term. **Unique, and that is the
     * rule rather than an index**: one payment buys one term however many times the provider
     * tells us about it, and under whatever event id.
     */
    providerPaymentId: text('provider_payment_id').unique(),
    /**
     * When the renewal reminder for **this term** went out (issue #3). On the term and not on
     * the person, which is the whole of the once-only rule: a re-run, a retry or a restore finds
     * it set and sends nothing, and a renewal is a new row with nothing set on it yet.
     */
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
  },
  (table) => [
    index('memberships_account_id_paid_through_index').on(table.accountId, table.paidThrough),
    // A row is somebody's term or it is a payment record that says who paid. Never neither.
    check(
      'memberships_without_an_account_name_their_payer',
      sql`${table.accountId} is not null or ${table.payerName} is not null`,
    ),
    check(
      'memberships_granted_by_is_known',
      sql`${table.grantedBy} in (${oneOf(MEMBERSHIP_GRANTS)})`,
    ),
    check('memberships_amount_is_an_amount', sql`${table.amount} is null or ${table.amount} > 0`),
    check(
      'memberships_currency_is_tradeable',
      sql`${table.currency} is null or ${table.currency} in (${oneOf(CURRENCIES)})`,
    ),
    // An amount and its currency travel together, for the same reason a price and its date do.
    check(
      'memberships_amount_carries_its_currency',
      sql`(${table.amount} is null) = (${table.currency} is null)`,
    ),
  ],
);

/**
 * The Club. **One row, and the check constraint says so** — this is a single-club system with no
 * switcher and no per-club branding, and a second row here would be a quiet fork of the truth.
 *
 * What it holds is everything about the association that changes without a developer: what
 * membership costs, where the money goes, how a member should reference their transfer, and what
 * a renewal reminder says. A change of bank is an afternoon on this screen, not a deployment.
 */
export const club = pgTable(
  'club',
  {
    id: integer('id').primaryKey().default(SOLE_CLUB_ROW),
    /** In the currency's minor unit. Never a fraction, never a float. */
    fee: integer('fee').notNull(),
    currency: text('currency').notNull().$type<Currency>(),
    /** The four things a member needs to make a transfer, and nothing else. */
    bankAccountHolder: text('bank_account_holder'),
    bankName: text('bank_name'),
    iban: text('iban'),
    bic: text('bic'),
    /**
     * How a member should label their transfer, written the way the treasurer wants to read it
     * on a statement. Free text with `{name}` and `{year}` in it — the format is the Club's, and
     * nothing here parses what a member actually typed.
     */
    paymentReference: text('payment_reference').notNull(),
    /** The opening sentence of a renewal reminder (issue #3), in the Club's own words. */
    reminderText: text('reminder_text').notNull(),
    /**
     * Where a member writes when something is wrong that a transfer will not fix. The one field
     * on this row that anybody but an Administrator sees — it is on the renewal screen, because
     * "contact the Club office" is advice nobody can act on without an address.
     */
    officeEmail: text('office_email'),
    /**
     * Whether an Administrator has switched renewal reminders on (issue #3). **Off until
     * somebody decides otherwise**, because the first roster a Club loads carries dates nobody
     * has checked, and a reminder is a demand for money sent in the Club's interest. The
     * environment has to allow it as well — see `REMINDERS_ENABLED`.
     */
    remindersOn: boolean('reminders_on').notNull().default(false),
    /** Where the treasurer's digest of Memberships about to run out and just lapsed is sent. */
    treasurerEmail: text('treasurer_email'),
    /** When that digest last went out, so that "weekly" survives a restart. */
    treasurerDigestSentAt: timestamp('treasurer_digest_sent_at', { withTimezone: true }),
    /**
     * **Who the association is, for the legal notice** (issue #9): its registered name, where it
     * can be served, who may speak for it and where it is registered. Public once written, and
     * all of it nullable, because an association nobody has described yet has no legal notice —
     * and a placeholder on a legal page is worse than a gap, since it looks finished.
     *
     * Here and not in configuration for two reasons. The board changes at an annual meeting and
     * that must not be a deployment; and these are precisely the names this repository is never
     * to contain.
     */
    legalName: text('legal_name'),
    /** As many lines as an address has, kept as they were typed. */
    postalAddress: text('postal_address'),
    representedBy: text('represented_by'),
    registerCourt: text('register_court'),
    registerNumber: text('register_number'),
    vatId: text('vat_id'),
    phone: text('phone'),
    /** Anything else the association has to state on its legal notice, in its own words. */
    legalNoticeFurther: text('legal_notice_further'),
    /**
     * Who answers for data protection on the association's side, and the authority a member may
     * complain to — both named in the privacy statement.
     */
    dataProtectionContact: text('data_protection_contact'),
    dataProtectionEmail: text('data_protection_email'),
    supervisoryAuthority: text('supervisory_authority'),
    /** Anything else the association has to state in its privacy statement, in its own words. */
    privacyFurther: text('privacy_further'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check('club_is_one_row', sql`${table.id} = ${sql.raw(String(SOLE_CLUB_ROW))}`),
    check('club_fee_is_an_amount', sql`${table.fee} >= 0`),
    check('club_currency_is_tradeable', sql`${table.currency} in (${oneOf(CURRENCIES)})`),
  ],
);

/**
 * What somebody else does with members' data on the association's behalf. Five kinds, because
 * those are the five the privacy statement has to account for; `error-tracking` is among them so
 * that "nobody" is an answer the statement gives on purpose (ADR 0011) rather than by omission.
 */
export const PROCESSOR_ROLES = [
  'hosting',
  'storage',
  'email',
  'payment',
  'error-tracking',
] as const satisfies readonly ProcessorRole[];

/**
 * **A processor**: a company that handles members' personal data for the association (issue #9).
 *
 * One row per role, so naming the host twice is correcting it rather than adding a second. The
 * privacy statement names them from here, which is what lets the association change its e-mail
 * provider without a deployment — and keeps the providers' names out of this repository.
 *
 * `agreementSignedOn` is the association's own record and is never published: a processor with
 * none is one whose agreement is still outstanding, and none may be at go-live.
 */
export const processors = pgTable(
  'processors',
  {
    role: text('role').primaryKey().$type<ProcessorRole>(),
    name: text('name').notNull(),
    /** Where the data is handled — a country is enough. */
    location: text('location').notNull(),
    agreementSignedOn: date('agreement_signed_on', { mode: 'string' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [check('processor_role_is_known', sql`${table.role} in (${oneOf(PROCESSOR_ROLES)})`)],
);

/**
 * A link that lets somebody set a password: the invitation an Administrator sends, and the reset
 * a member asks for themselves. One table, because they are the same object — a single-use,
 * expiring secret naming one Account — and two would be the same rules written twice.
 *
 * **Only the hash is here.** The token itself exists in the e-mail and nowhere else, so a copy of
 * this table is not a way into anybody's account. It is 32 random bytes, so a plain SHA-256 is
 * the right hash for it: there is nothing to brute-force.
 */
export const accountTokens = pgTable(
  'account_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull().$type<TokenPurpose>(),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Single-use: set the moment it is redeemed, and never null again. */
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    index('account_tokens_account_id_purpose_index').on(table.accountId, table.purpose),
    check('account_tokens_purpose_is_known', sql`${table.purpose} in (${oneOf(TOKEN_PURPOSES)})`),
  ],
);

/**
 * A member's standing arrangement with the payment provider to pay the fee each year (ADR 0004).
 *
 * **Nothing here grants access.** The provider owns the mandate, the retries and the schedule;
 * this row is what the archive has been *told* about one of its subscriptions, kept so that a
 * member can see whether theirs will renew and stop it in one press. Whether they may read the
 * archive is still the Memberships table and nothing else.
 *
 * It goes when the Account does — after the subscription itself has been ended at the provider,
 * which is the erasure's job to do first.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** The provider's own id. Every event about the subscription names it. */
    providerSubscriptionId: text('provider_subscription_id').notNull().unique(),
    /** Whether it will collect again. False once the member has cancelled. */
    renews: boolean('renews').notNull().default(true),
    /** When the provider will next collect, where it has said. */
    renewsOn: date('renews_on', { mode: 'string' }),
    /** Over for good. Kept as a row, so a late event about it finds something to be about. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /**
     * How recent the three facts above are, **by the provider's clock and not by ours**. Its
     * deliveries arrive in no promised order, so one older than this is not news and is dropped.
     */
    stateAsOf: timestamp('state_as_of', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('subscriptions_account_id_index').on(table.accountId)],
);

/**
 * Every delivery from the payment provider that has been acted on, by the provider's own id.
 *
 * **This table is the idempotency.** A provider redelivers — on a timeout, on a retry, when
 * somebody presses "resend" in its dashboard — and the row is written in the same transaction as
 * whatever the event did, so a delivery seen twice changes something once.
 */
export const paymentEvents = pgTable('payment_events', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
});

/**
 * How sign-in has been going for one e-mail address. Only failure is recorded, and it is
 * recorded against **the address that was offered** rather than an Account — because an address
 * nobody has heard of has to be rate limited exactly like one on the roster, or the lockout
 * itself becomes the roster-membership oracle the sign-in form refuses to be.
 */
export const signInFailures = pgTable('sign_in_failures', {
  email: text('email').primaryKey(),
  failures: integer('failures').notNull(),
  firstFailureAt: timestamp('first_failure_at', { withTimezone: true }).notNull(),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }).notNull(),
  /** Set once the count crosses the threshold. Null means nothing is being refused. */
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

/**
 * Where a Contribution stands. `waiting` is how every one of them begins; the other two are an
 * Editor's decision about it, which is issue #6. A discarded one is kept as a row rather than
 * deleted, so that what was decided about a member's words is a fact rather than an absence.
 */
export const CONTRIBUTION_STATES = ['waiting', 'published', 'discarded'] as const;

export type StoredContributionState = (typeof CONTRIBUTION_STATES)[number];

/**
 * A Contribution — what a Member knows about a Part or a Position, in their words.
 *
 * **Two nullable targets and a check that exactly one is set**, rather than a `target_kind` and
 * an untyped id: each is a real foreign key, so a Contribution can never point at something the
 * archive does not hold.
 *
 * Both targets **restrict**. Everything else hung off a Part or a Position goes when it does,
 * because everything else is the archive's own record of it. This is a member's, written on the
 * understanding that it would be read by somebody — so a Part or a number cannot be removed out
 * from under what members have said about it, and the Editor who tries is told why.
 *
 * The author is the opposite, and it is ADR 0007 in one column: deleting an Account **sets it
 * null**. The knowledge stays; the identification does not.
 */
export const contributions = pgTable(
  'contributions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partId: uuid('part_id').references(() => parts.id, { onDelete: 'restrict' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** As the member wrote it. Never parsed, never tidied. */
    body: text('body').notNull(),
    /** Written because the Part's record is wrong (story 90). Only ever true of a Part. */
    correction: boolean('correction').notNull().default(false),
    state: text('state').notNull().$type<StoredContributionState>().default('waiting'),
    /** From the injected clock, never the system's idea of now. */
    writtenAt: timestamp('written_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'contributions_target_is_a_part_or_a_position',
      sql`num_nonnulls(${table.partId}, ${table.positionId}) = 1`,
    ),
    check(
      'contributions_correction_is_about_a_part',
      sql`not ${table.correction} or ${table.partId} is not null`,
    ),
    check(
      'contributions_state_is_one_of_three',
      sql`${table.state} in (${oneOf(CONTRIBUTION_STATES)})`,
    ),
    index('contributions_part_id_index').on(table.partId),
    index('contributions_position_id_index').on(table.positionId),
    index('contributions_author_id_index').on(table.authorId),
  ],
);

/**
 * A photograph a member attached to a Contribution.
 *
 * **A table of its own rather than rows in `photographs`**, because the two answer to different
 * rules: a Part's photographs are the record and every member may see them, and these are one
 * member's until an Editor has looked. The shape is the same one (`stored-images.ts`) and so is
 * where the files live — under the photograph's own id, so that the day an Editor moves one onto
 * the Part (story 119) nothing on disk has to be renamed.
 */
export const contributionPhotographs = pgTable(
  'contribution_photographs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contributionId: uuid('contribution_id')
      .notNull()
      .references(() => contributions.id, { onDelete: 'cascade' }),

    /** The order they were attached in, from `0`. Ties break on `id`, so the list is total. */
    sequence: integer('sequence').notNull(),

    sourceFormat: text('source_format').notNull(),
    sourceByteSize: integer('source_byte_size').notNull(),
    sourceWidth: integer('source_width').notNull(),
    sourceHeight: integer('source_height').notNull(),

    displayFormat: text('display_format').notNull(),
    displayByteSize: integer('display_byte_size').notNull(),
    displayWidth: integer('display_width').notNull(),
    displayHeight: integer('display_height').notNull(),

    previewByteSize: integer('preview_byte_size').notNull(),

    /** Keys in the private file store. Not paths, not URLs — nothing here is reachable. */
    originalKey: text('original_key').notNull(),
    displayKey: text('display_key').notNull(),
    previewKey: text('preview_key').notNull(),

    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('contribution_photographs_contribution_id_sequence_index').on(
      table.contributionId,
      table.sequence,
    ),
    check('contribution_photographs_sequence_is_a_place', sql`${table.sequence} >= 0`),
  ],
);

export const PROPOSAL_KINDS = ['fix', 'idea'] as const satisfies readonly ProposalKind[];
export const PROPOSAL_STATUSES = [
  'draft',
  'new',
  'taken-up',
  'done',
  'declined',
] as const satisfies readonly ProposalStatus[];
export const PROPOSAL_SPEAKERS = [
  'author',
  'conversation',
] as const satisfies readonly ProposalSpeaker[];

/**
 * **A Fix or an Idea, worked out in conversation** (issue #152), on a practice system.
 *
 * **Kept apart from the practice data**: nothing here refers to a Model or a Tavola, because a
 * practice archive is re-seeded and a Proposal outlives what it was about. What was on screen is
 * written down as it was, ids and names both.
 */
export const proposals = pgTable(
  'proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Whose it is, or null once their Account is gone. **A Proposal outlives its author's
     * Account** (issue #157): re-seeding a practice system empties the roster, and Proposals are
     * real where the roster is not. A person's Drafts are taken by their erasure rather than by
     * this key, which only lets go.
     */
    authorId: uuid('author_id').references(() => accounts.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().$type<ProposalKind>(),
    status: text('status').notNull().$type<ProposalStatus>().default('draft'),

    /** The page the author was on, path and query. */
    pageAddress: text('page_address').notNull(),
    /** The Version of Ricambi that was running. */
    version: text('version').notNull(),
    modelId: uuid('model_id'),
    modelName: text('model_name'),
    tavolaId: uuid('tavola_id'),
    tavolaNumber: text('tavola_number'),
    tavolaName: text('tavola_name'),

    /**
     * **The finished Proposal** (issue #153), as the conversation wrote it, with the author's
     * own words copied in. Null until asked for, and again once the conversation carries on past
     * it, so what is handed over is always what the author last read.
     */
    summary: jsonb('summary').$type<ProposalSummary>(),
    /** Why an Administrator Declined it, which its author is shown. Only ever on a Declined one. */
    declineReason: text('decline_reason'),
    /**
     * **What working it out cost**, estimated in millionths of a US dollar at list prices from
     * what each request used, added to as it is answered and finished. Null where the
     * conversation is not billed by the request, and on those from before costs were kept.
     */
    estimatedCostMicroUsd: integer('estimated_cost_micro_usd'),

    /** From the injected clock. */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** When the last turn was said, or when it was started. What the Drafts are listed by. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    /** When its author pressed Hand over. Null while it is a Draft, and set for good after. */
    handedOverAt: timestamp('handed_over_at', { withTimezone: true }),
  },
  (table) => [
    index('proposals_author_id_index').on(table.authorId),
    check(
      'proposals_handed_over_has_a_summary',
      sql`${table.status} = 'draft' or (${table.summary} is not null and ${table.handedOverAt} is not null)`,
    ),
    check(
      'proposals_declined_has_a_reason',
      sql`(${table.status} = 'declined') = (${table.declineReason} is not null)`,
    ),
    check('proposals_kind_is_fix_or_idea', sql`${table.kind} in (${oneOf(PROPOSAL_KINDS)})`),
    check('proposals_status_is_one_of_five', sql`${table.status} in (${oneOf(PROPOSAL_STATUSES)})`),
    check(
      'proposals_tavola_is_named_whole',
      sql`(${table.tavolaId} is null) = (${table.tavolaNumber} is null)`,
    ),
  ],
);

export const SPENDING_PURPOSES = [
  'proposal-conversations',
  'catalog-runs',
] as const satisfies readonly SpendingPurpose[];

/**
 * **The one record of spending by month** (issue #189): what Ricambi spent on Claude in each
 * calendar month, UTC, for each purpose, billed or only priced at list prices, estimated in
 * millionths of a US dollar and added to as it is spent. Kept apart from what it was spent on,
 * so that a month's figure is never reduced: a Draft discarded afterwards still counts in the
 * month its conversation was paid for. Only ever added to.
 */
export const monthlySpending = pgTable(
  'monthly_spending',
  {
    /** The calendar month, UTC, as `YYYY-MM`. */
    month: text('month').notNull(),
    purpose: text('purpose').notNull().$type<SpendingPurpose>(),
    /** False where it was only priced at list prices, as a subscription's is, and not billed. */
    billed: boolean('billed').notNull(),
    estimatedCostMicroUsd: bigint('estimated_cost_micro_usd', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.month, table.purpose, table.billed] }),
    check(
      'monthly_spending_purpose_is_known',
      sql`${table.purpose} in (${oneOf(SPENDING_PURPOSES)})`,
    ),
  ],
);

/** One turn of a Proposal's conversation. Never edited: what was said stays said. */
export const proposalTurns = pgTable(
  'proposal_turns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    /** From `0`, without gaps. Unique, so two turns written at once cannot take one place. */
    sequence: integer('sequence').notNull(),
    speaker: text('speaker').notNull().$type<ProposalSpeaker>(),
    text: text('text').notNull(),
    /** From the injected clock. */
    at: timestamp('at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('proposal_turns_one_turn_a_place').on(table.proposalId, table.sequence),
    check('proposal_turns_sequence_is_a_place', sql`${table.sequence} >= 0`),
    check(
      'proposal_turns_speaker_is_one_of_two',
      sql`${table.speaker} in (${oneOf(PROPOSAL_SPEAKERS)})`,
    ),
  ],
);

/**
 * **A screenshot the author showed** (issue #154), with what they said about it. Added to a
 * Draft as soon as it is pasted or picked, and carried by the author's turn it was sent with:
 * `turnId` is null until then. Its files are under its own id, as a Photograph's are, on the
 * system's own volume and served only through an authenticated route (ADR 0013).
 */
export const proposalScreenshots = pgTable(
  'proposal_screenshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    /** The author's turn it was sent with, or null while it waits to be sent. */
    turnId: uuid('turn_id').references(() => proposalTurns.id, { onDelete: 'cascade' }),
    /** The order they were added to the Draft in, from `0`, without gaps until one is removed. */
    sequence: integer('sequence').notNull(),
    /** What the author said about it, word for word, or null where they said nothing. */
    note: text('note'),

    sourceFormat: text('source_format').notNull(),
    sourceByteSize: integer('source_byte_size').notNull(),
    sourceWidth: integer('source_width').notNull(),
    sourceHeight: integer('source_height').notNull(),

    displayFormat: text('display_format').notNull(),
    displayByteSize: integer('display_byte_size').notNull(),
    displayWidth: integer('display_width').notNull(),
    displayHeight: integer('display_height').notNull(),

    previewByteSize: integer('preview_byte_size').notNull(),

    /** Keys in the private file store. Not paths, not URLs — nothing here is reachable. */
    originalKey: text('original_key').notNull(),
    displayKey: text('display_key').notNull(),
    previewKey: text('preview_key').notNull(),

    /** From the injected clock. */
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('proposal_screenshots_one_a_place').on(table.proposalId, table.sequence),
    index('proposal_screenshots_turn_id_index').on(table.turnId),
    check('proposal_screenshots_sequence_is_a_place', sql`${table.sequence} >= 0`),
  ],
);

export const accountsRelations = relations(accounts, ({ many }) => ({
  memberships: many(memberships),
  tokens: many(accountTokens),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  account: one(accounts, { fields: [memberships.accountId], references: [accounts.id] }),
}));

export const accountTokensRelations = relations(accountTokens, ({ one }) => ({
  account: one(accounts, { fields: [accountTokens.accountId], references: [accounts.id] }),
}));

export const modelsRelations = relations(models, ({ many }) => ({
  tavole: many(tavole),
  fitments: many(fitments),
}));

export const tavoleRelations = relations(tavole, ({ one, many }) => ({
  model: one(models, { fields: [tavole.modelId], references: [models.id] }),
  category: one(categories, { fields: [tavole.categoryId], references: [categories.id] }),
  scan: one(scans, { fields: [tavole.id], references: [scans.tavolaId] }),
  tableSheets: many(tableSheets),
  publisher: one(accounts, { fields: [tavole.publishedBy], references: [accounts.id] }),
  positions: many(positions),
  listings: many(listings),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  tavola: one(tavole, { fields: [positions.tavolaId], references: [tavole.id] }),
  subAssembly: one(subAssemblies, {
    fields: [positions.subAssemblyId],
    references: [subAssemblies.id],
  }),
  marks: many(marks),
  listings: many(listings),
}));

export const subAssembliesRelations = relations(subAssemblies, ({ one, many }) => ({
  tavola: one(tavole, { fields: [subAssemblies.tavolaId], references: [tavole.id] }),
  positions: many(positions),
  photographs: many(photographs),
}));

export const partsRelations = relations(parts, ({ many }) => ({
  listings: many(listings),
  fitments: many(fitments),
  equivalents: many(equivalents),
  sources: many(sources),
  photographs: many(photographs),
}));

export const photographsRelations = relations(photographs, ({ one }) => ({
  part: one(parts, { fields: [photographs.partId], references: [parts.id] }),
  subAssembly: one(subAssemblies, {
    fields: [photographs.subAssemblyId],
    references: [subAssemblies.id],
  }),
}));

export const fitmentsRelations = relations(fitments, ({ one }) => ({
  part: one(parts, { fields: [fitments.partId], references: [parts.id] }),
  model: one(models, { fields: [fitments.modelId], references: [models.id] }),
}));

export const equivalentsRelations = relations(equivalents, ({ one }) => ({
  part: one(parts, { fields: [equivalents.partId], references: [parts.id] }),
}));

export const sourcesRelations = relations(sources, ({ one }) => ({
  part: one(parts, { fields: [sources.partId], references: [parts.id] }),
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

export const tableSheetsRelations = relations(tableSheets, ({ one }) => ({
  tavola: one(tavole, { fields: [tableSheets.tavolaId], references: [tavole.id] }),
}));

export const scansRelations = relations(scans, ({ one }) => ({
  tavola: one(tavole, { fields: [scans.tavolaId], references: [tavole.id] }),
}));

export const endedSamplesRelations = relations(endedSamples, ({ one }) => ({
  tavola: one(tavole, { fields: [endedSamples.tavolaId], references: [tavole.id] }),
}));

export const samplesRelations = relations(samples, ({ one }) => ({
  tavola: one(tavole, { fields: [samples.tavolaId], references: [tavole.id] }),
  position: one(positions, { fields: [samples.positionId], references: [positions.id] }),
  marker: one(accounts, { fields: [samples.markedBy], references: [accounts.id] }),
}));

export type ModelRow = typeof models.$inferSelect;
export type NewModelRow = typeof models.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
export type TavolaRow = typeof tavole.$inferSelect;
export type NewTavolaRow = typeof tavole.$inferInsert;
export type ScanRow = typeof scans.$inferSelect;
export type SampleRow = typeof samples.$inferSelect;
export type NewSampleRow = typeof samples.$inferInsert;
export type EndedSampleRow = typeof endedSamples.$inferSelect;
export type TableSheetRow = typeof tableSheets.$inferSelect;
export type ReadingDoubtRow = typeof readingDoubts.$inferSelect;
export type CatalogRunRow = typeof catalogRuns.$inferSelect;
export type NewCatalogRunRow = typeof catalogRuns.$inferInsert;
export type CatalogRunTavolaRow = typeof catalogRunTavole.$inferSelect;
export type CatalogRunActionRow = typeof catalogRunActions.$inferSelect;
export type NewScanRow = typeof scans.$inferInsert;
export type PositionRow = typeof positions.$inferSelect;
export type NewPositionRow = typeof positions.$inferInsert;
export type MarkRow = typeof marks.$inferSelect;
export type NewMarkRow = typeof marks.$inferInsert;
export type SubAssemblyRow = typeof subAssemblies.$inferSelect;
export type NewSubAssemblyRow = typeof subAssemblies.$inferInsert;
export type RelatedPositionRow = typeof relatedPositions.$inferSelect;
export type NewRelatedPositionRow = typeof relatedPositions.$inferInsert;
export type PartRow = typeof parts.$inferSelect;
export type NewPartRow = typeof parts.$inferInsert;
export type ListingRow = typeof listings.$inferSelect;
export type NewListingRow = typeof listings.$inferInsert;
export type FitmentRow = typeof fitments.$inferSelect;
export type NewFitmentRow = typeof fitments.$inferInsert;
export type EquivalentRow = typeof equivalents.$inferSelect;
export type NewEquivalentRow = typeof equivalents.$inferInsert;
export type SourceRow = typeof sources.$inferSelect;
export type NewSourceRow = typeof sources.$inferInsert;
export type PhotographRow = typeof photographs.$inferSelect;
export type NewPhotographRow = typeof photographs.$inferInsert;
export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
export type MembershipRow = typeof memberships.$inferSelect;
export type NewMembershipRow = typeof memberships.$inferInsert;
export type ClubRow = typeof club.$inferSelect;
export type NewClubRow = typeof club.$inferInsert;
export type UnitRow = typeof units.$inferSelect;
export type SpecificationNameRow = typeof specificationNames.$inferSelect;
export type SpecificationRow = typeof specifications.$inferSelect;
export type NewSpecificationRow = typeof specifications.$inferInsert;
export type ProcessorRow = typeof processors.$inferSelect;
export type NewProcessorRow = typeof processors.$inferInsert;
export type AccountTokenRow = typeof accountTokens.$inferSelect;
export type NewAccountTokenRow = typeof accountTokens.$inferInsert;
export type SignInFailureRow = typeof signInFailures.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;
export type ContributionRow = typeof contributions.$inferSelect;
export type NewContributionRow = typeof contributions.$inferInsert;
export type ContributionPhotographRow = typeof contributionPhotographs.$inferSelect;
export type NewContributionPhotographRow = typeof contributionPhotographs.$inferInsert;
export type ProposalRow = typeof proposals.$inferSelect;
export type ProposalScreenshotRow = typeof proposalScreenshots.$inferSelect;
export type NewProposalScreenshotRow = typeof proposalScreenshots.$inferInsert;
export type NewProposalRow = typeof proposals.$inferInsert;
export type ProposalTurnRow = typeof proposalTurns.$inferSelect;
export type NewProposalTurnRow = typeof proposalTurns.$inferInsert;
