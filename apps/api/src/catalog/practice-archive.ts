import { inArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../db/client.js';
import {
  categories,
  equivalents,
  fitments,
  listings,
  marks,
  models,
  parts,
  positions,
  readingDoubts,
  relatedPositions,
  sources,
  subAssemblies,
  tavole,
} from '../db/schema.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import { createCategoryRepository } from '../repositories/category-repository.js';
import { createModelRepository } from '../repositories/model-repository.js';
import { createPartRecordRepository } from '../repositories/part-record-repository.js';
import { createPartRepository } from '../repositories/part-repository.js';
import { createPhotographRepository } from '../repositories/photograph-repository.js';
import { createScanRepository } from '../repositories/scan-repository.js';
import { createSpecificationListRepository } from '../repositories/specification-list-repository.js';
import { createTavolaRepository } from '../repositories/tavola-repository.js';
import { createPartRecordService } from '../services/part-record-service.js';
import { createPhotographService } from '../services/photograph-service.js';
import { createScanService } from '../services/scan-service.js';
import type { FileStore } from '../storage/file-store.js';
import { categorySlug, numericPrefixOf } from './naming.js';
import { standingCategories } from './standing-categories.js';

/**
 * An invented catalog, for a system that is not the archive.
 *
 * **Everything here is written in this file.** Nothing is copied, exported or anonymised from
 * anywhere real — the most common way a club leaks its own material is a demo loaded from
 * production, and the only reliable defence is that the loading path does not exist. There is
 * no dump to import here because there is no importer. The drawings are drawn below, in a few
 * lines of SVG: there is no real scan in this repository and there should not be.
 *
 * **This lives in `src`, and therefore in the production image.** Ticket 02 kept the seeder
 * out of the image as defence in depth; a deployed practice system cannot seed itself under
 * that arrangement, and a preview an Editor is meant to fill in through the screens has to
 * start with something in it. What actually prevents this reaching the archive is
 * `assertSeedable` — which refuses production *and* refuses an environment that has not said
 * which it is — and that is a tested guard rather than an absence. Every entry point here goes
 * through it.
 */

/** Models the factory really made — their names are printed on the cover of every catalog. */
export const practiceModels = [
  { brand: 'Bizzarrini', name: '5300 GT Strada', series: null, modelYears: '1965–68' },
  { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
  { brand: 'Iso', name: 'Rivolta IR 300', series: null, modelYears: '1962–70' },
  // No Tavole of its own: the one a practice Catalog run reads into, so trying a run never
  // changes what the other cars show (the browser suite counts their sheets).
  { brand: 'Iso', name: 'Fidia', series: null, modelYears: '1967–74' },
];

/** Keyed by the Model above they belong to, since a Tavola belongs to exactly one (ADR 0002). */
export const practiceTavole = [
  {
    model: 'Grifo',
    number: '2',
    nameIt: 'Impianto frenante anteriore',
    nameEn: 'Front brake system',
    category: 'Brakes',
    catalogSection: '260',
    catalogGroup: '03',
    catalogSubgroup: '150',
    drawn: true,
  },
  {
    model: 'Grifo',
    number: '10',
    nameIt: 'Impianto elettrico',
    nameEn: 'Electrical system',
    category: 'Electrical',
    catalogSection: '410',
    catalogGroup: '01',
    catalogSubgroup: null,
    drawn: true,
  },
  {
    model: 'Grifo',
    number: '12 bis',
    nameIt: 'Alzacristallo porta',
    nameEn: 'Door window winder',
    category: 'Body/Exterior',
    catalogSection: '260',
    catalogGroup: '03',
    catalogSubgroup: '151',
    // A Tavola recorded from a paper catalog before anyone has scanned the sheet. It is a
    // legitimate state and a practice archive should show one.
    drawn: false,
  },
  {
    model: '5300 GT Strada',
    number: '1',
    nameIt: 'Alimentazione',
    nameEn: 'Fuel system',
    category: 'Fuel',
    catalogSection: '110',
    catalogGroup: '02',
    catalogSubgroup: null,
    drawn: true,
  },
  {
    // The second car with a drawing of its brakes. One system on one car is a filter; it takes
    // a second car before a Category is a way to compare, and a practice archive should show
    // the thing a Category is for.
    model: '5300 GT Strada',
    number: '7',
    nameIt: 'Impianto frenante',
    nameEn: 'Brake system',
    category: 'Brakes',
    catalogSection: '260',
    catalogGroup: '01',
    catalogSubgroup: null,
    drawn: false,
  },
];

/**
 * The numbers the invented drawing prints, where they sit, and **what each one points at** — all
 * as fractions of the sheet, which is also the unit a Mark is stored in (ADR 0013), so the
 * drawing below and the Marks seeded onto it are read off one list and cannot drift apart.
 *
 * **`2` is printed twice, and that is the practice archive doing its job.** The factory printed
 * one number wherever the part is used, so a Position carrying several Marks is the ordinary
 * case rather than the exotic one — and a screen that takes a member to each of them in turn
 * (story 48) has nothing to be built or judged against unless a seeded sheet has one. Both `2`s
 * point at the **same shape in two places**, because that is what the repetition means.
 *
 * `x`/`y` are the Mark and must not be moved without moving the seeded Marks with them; `points`
 * only changes the picture.
 */
const practiceNumbers = [
  { number: '1', x: 0.25, y: 0.3, points: { x: 0.34, y: 0.45, part: 'bracket' } },
  { number: '2', x: 0.5, y: 0.43, points: { x: 0.475, y: 0.53, part: 'pin' } },
  { number: '3', x: 0.75, y: 0.3, points: { x: 0.66, y: 0.45, part: 'disc' } },
  { number: '4', x: 0.5, y: 0.71, points: { x: 0.575, y: 0.6, part: 'washer' } },
  { number: '2', x: 0.32, y: 0.62, points: { x: 0.385, y: 0.575, part: 'pin' } },
] as const satisfies readonly { number: string; x: number; y: number; points: PracticePart }[];

/** The invented components the drawing shows, and how big each is as a fraction of the width. */
type PracticePart = { x: number; y: number; part: 'bracket' | 'pin' | 'disc' | 'washer' };

const PART_SIZES: Record<PracticePart['part'], number> = {
  bracket: 0.05,
  pin: 0.035,
  disc: 0.04,
  washer: 0.022,
};

/**
 * A number the catalog lists that the drawing does not show — the washer behind a bracket. Zero
 * Marks is an ordinary state for a Position and a practice archive should have one, so that a
 * screen showing "listed but not drawn" has something to show it with.
 */
const undrawnPracticePosition = '5';

/**
 * Invented components, keyed so a Listing below can name one twice.
 *
 * **Chosen to be every state a member's screen has to handle**, because a practice archive whose
 * Parts are all complete is a practice archive that proves nothing: there is one with no Catalog
 * Number at all, one carrying the factory's words *and* the club's, a pair that are alternatives
 * to one another, and fixings that no drawing shows. Nothing here is copied from anywhere real —
 * the names are made up for a system that is not the archive (`AGENTS.md`).
 */
const practiceParts = {
  'caliper-early': {
    nameEn: 'Front brake caliper, early',
    nameIt: 'PINZA FRENO ANTERIORE',
    catalogNumber: '260 03 150',
    disegnoOrigine: '208503',
    description: 'Two-piston caliper, cast in one piece.',
    dimensions: null,
    materialFinish: 'Cast iron, phosphated',
    catalogNote: 'FINO AL TELAIO N. 310',
    note: 'Fitted to the first cars. It takes the narrow pad, which is no longer made.',
  },
  'caliper-late': {
    nameEn: 'Front brake caliper, late',
    nameIt: 'PINZA FRENO ANTERIORE',
    catalogNumber: '260 03 151',
    disegnoOrigine: '208503',
    description: 'Two-piston caliper, split housing.',
    dimensions: null,
    materialFinish: 'Cast iron, phosphated',
    catalogNote: 'DAL TELAIO N. 311',
    note: 'The later caliper takes a pad still in production, so most cars have been converted.',
  },
  bolt: {
    nameEn: 'Caliper mounting bolt',
    nameIt: 'VITE FISSAGGIO PINZA',
    catalogNumber: '999 01 004',
    disegnoOrigine: null,
    description: null,
    dimensions: 'M10 × 45',
    materialFinish: 'Steel, cadmium plated',
    catalogNote: null,
    note: 'An ordinary fastener; a modern equivalent is fine.',
  },
  'lock-washer': {
    nameEn: 'Lock washer',
    nameIt: 'ROSETTA ELASTICA',
    catalogNumber: '999 01 090',
    disegnoOrigine: null,
    description: null,
    dimensions: '10 mm',
    materialFinish: 'Spring steel',
    catalogNote: null,
    note: null,
  },
  hose: {
    nameEn: 'Flexible brake hose, front',
    nameIt: 'TUBO FLESSIBILE FRENO',
    catalogNumber: '260 03 210',
    disegnoOrigine: '208711',
    description: 'Runs from the body bracket to the caliper.',
    dimensions: '340 mm',
    materialFinish: null,
    catalogNote: 'V. TAV. 3',
    note: 'Braided replacements are sold in this length and fit without modification.',
  },
  'bleed-screw': {
    // The state ADR 0001 exists for: a component the archive knows about and the factory never
    // gave a number to. The screen has to say so rather than print a placeholder.
    nameEn: 'Bleed screw',
    nameIt: 'VITE SPURGO',
    catalogNumber: null,
    disegnoOrigine: null,
    description: 'Found on both calipers.',
    dimensions: null,
    materialFinish: null,
    catalogNote: null,
    note: 'No catalog number was ever printed for this. Measure the thread before ordering.',
  },
} as const;

/**
 * Where those components are listed — **the point of the practice archive's Position 1**, which
 * carries two drawn alternatives and two undrawn fixings at once, so that the one distinction a
 * member cannot afford to misread has something to be read on.
 *
 * The bolt is deliberately listed on two Tavole with different counts, because that is the whole
 * reason a quantity belongs to a Listing and not to a Part.
 */
const practiceListings = [
  { model: 'Grifo', tavola: '2', position: '1', part: 'caliper-early', quantity: 2, drawn: true },
  { model: 'Grifo', tavola: '2', position: '1', part: 'caliper-late', quantity: 2, drawn: true },
  { model: 'Grifo', tavola: '2', position: '1', part: 'bolt', quantity: 4, drawn: false },
  { model: 'Grifo', tavola: '2', position: '1', part: 'lock-washer', quantity: 4, drawn: false },
  { model: 'Grifo', tavola: '2', position: '2', part: 'hose', quantity: 2, drawn: true },
  { model: 'Grifo', tavola: '2', position: '3', part: 'bleed-screw', quantity: 2, drawn: true },
  // A number the drawing does not print, carrying a Part all the same.
  { model: 'Grifo', tavola: '2', position: '5', part: 'lock-washer', quantity: 2, drawn: true },
  // The same fastener on another sheet, in another quantity.
  { model: 'Grifo', tavola: '10', position: '2', part: 'bolt', quantity: 6, drawn: true },
] as const;

/**
 * A named group of the invented sheet's numbers — **the broad question**, answered for a member
 * taking a corner apart: the caliper, the screw it is bled through and the washer behind it are
 * one job.
 *
 * The hose at `2` and the empty number at `4` are deliberately left out of it, because "a number
 * in no group shows nothing" is a claim a practice archive has to be able to demonstrate as well
 * as one that has a group in it.
 */
const practiceSubAssemblies = [
  {
    model: 'Grifo',
    tavola: '2',
    name: 'Front caliper assembly',
    positions: ['1', '3', '5'],
  },
] as const;

/**
 * And **the narrow one**: the flexible hose runs to the caliper, and that is a pointer at one
 * other number rather than at a group of eleven. It is recorded once here, as it is everywhere —
 * the sheet reports it on both `1` and `2` because there is one row.
 */
const practiceRelatedPositions = [{ model: 'Grifo', tavola: '2', positions: ['1', '2'] }] as const;

/**
 * Which cars the invented components fit, **with qualifications written the way somebody would
 * actually know them**. One is a half-known chassis break, one is a single word, and one Part
 * fits a car with no qualification at all — because a practice archive whose fitments are all
 * neat proves nothing about a field that exists precisely to hold what is not.
 */
const practiceFitments = [
  { part: 'caliper-early', model: 'Grifo', qualifier: 'fino al telaio 310' },
  { part: 'caliper-late', model: 'Grifo', qualifier: 'from chassis #311' },
  { part: 'hose', model: 'Grifo', qualifier: null },
  { part: 'hose', model: 'Rivolta IR 300', qualifier: 'late cars only' },
  { part: 'bolt', model: 'Grifo', qualifier: null },
] as const;

/**
 * What can be bought instead — **the state every screen showing an Equivalent has to handle.**
 * All four kinds appear; one carries a note and no reference at all, which is the Donor Vehicle
 * doing what it is for.
 */
const practiceEquivalents = [
  {
    part: 'hose',
    kind: 'oe-supplier',
    maker: 'Girling',
    reference: '64678231',
    note: 'The original supplier’s own number, from a parts book of the period.',
  },
  {
    part: 'hose',
    kind: 'donor-vehicle',
    maker: 'Fiat 124 Coupé',
    reference: null,
    // The whole argument for a nullable reference, written as data: nobody knows what Fiat
    // called it, and the car alone is what sends somebody to a scrapyard with something to find.
    note: 'The same hose, in the same length. Nobody has ever found the Fiat number for it.',
  },
  {
    part: 'bolt',
    kind: 'industry-standard',
    maker: 'DIN',
    reference: 'DIN 931 M10 × 45',
    note: 'An ordinary hex bolt. Any supplier’s will do.',
  },
  {
    part: 'lock-washer',
    kind: 'oem',
    maker: 'Schnorr',
    reference: 'S 10',
    note: null,
  },
] as const;

/**
 * Where the invented components have been for sale. **Every state a member's screen has to show
 * at once**: a price with the day it was seen, a source with no price at all, the same shop twice
 * at two prices so the reading is a price history, and one listing that never said what condition
 * it was in.
 *
 * The dates are fixed rather than relative to now, for the same reason every other fixture here
 * is: a practice archive that read the wall clock would look different on two afternoons.
 */
const practiceSources = [
  {
    part: 'hose',
    name: 'Ricambi Storici',
    url: 'https://example.invalid/ricambi-storici/tubo-flessibile',
    condition: 'new-old-stock',
    priceAmount: 24500,
    priceCurrency: 'EUR',
    observedOn: '2025-11-02',
    note: 'Two in stock when this was written.',
  },
  {
    part: 'hose',
    name: 'Ricambi Storici',
    url: 'https://example.invalid/ricambi-storici/tubo-flessibile',
    condition: 'new-old-stock',
    priceAmount: 19000,
    priceCurrency: 'EUR',
    observedOn: '2024-03-18',
    note: null,
  },
  {
    part: 'caliper-early',
    name: 'A club member’s garage sale',
    url: 'https://example.invalid/forum/thread/1142',
    // The listing did not say, and the archive says *that* rather than guessing (ADR 0001's
    // habit): a screen showing "condition not stated" is honest, one showing "used" is not.
    condition: null,
    priceAmount: null,
    priceCurrency: null,
    observedOn: null,
    note: 'Offered in a forum thread. No price was given.',
  },
  {
    part: 'bolt',
    name: 'Any fastener supplier',
    url: 'https://example.invalid/fasteners/din-931',
    condition: 'reproduction',
    priceAmount: 180,
    priceCurrency: 'GBP',
    observedOn: '2025-06-09',
    note: null,
  },
] as const;

/**
 * Invented photographs of the invented components — **the state a member's screen has to handle
 * three ways at once**: a Part with several, a Part with one, and Parts with none at all.
 *
 * Several matters most, because it is the only thing that can demonstrate an *order*: which
 * picture comes first is an Editor's judgement about which shows the part best, and a practice
 * archive where every Part had at most one would leave that claim untestable.
 *
 * The pictures are drawn below in a few lines of SVG and could not be mistaken for photographs.
 * Nothing here is copied from anywhere real (`AGENTS.md`).
 */
const practicePhotographs = [
  { part: 'caliper-early', of: 'Caliper, outboard face' },
  { part: 'caliper-early', of: 'Caliper, casting number' },
  { part: 'hose', of: 'Hose and its end fittings' },
] as const;

export interface SeedDependencies {
  db: Db;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
  config: AppConfig;
}

export interface SeedOutcome {
  models: number;
  tavole: number;
  drawings: number;
  positions: number;
  parts: number;
  listings: number;
  subAssemblies: number;
  relatedPositions: number;
  fitments: number;
  equivalents: number;
  sources: number;
  photographs: number;
  /** Tavole left Unchecked, as a Catalog run leaves them, for an Editor to check. */
  unchecked: number;
}

/**
 * Writes the invented catalog into a database that already has none.
 *
 * **It adds and never truncates, and it does nothing at all if there is anything there.** That
 * is what makes it safe to run on every boot of a preview system: whatever an Editor recorded
 * through the screens survives the next deployment. Emptying tables first is a thing a person
 * asks for explicitly, on a laptop — `pnpm db:seed` — and not something a container does to
 * itself while nobody is watching.
 */
export async function seedPracticeArchiveIfEmpty(
  dependencies: SeedDependencies,
): Promise<SeedOutcome | null> {
  const existing = await dependencies.db.select({ id: models.id }).from(models).limit(1);
  if (existing.length > 0) {
    return null;
  }

  return writePracticeArchive(dependencies);
}

/** The insert itself. Callers decide whether the database was theirs to write into. */
export async function writePracticeArchive(dependencies: SeedDependencies): Promise<SeedOutcome> {
  const { db, fileStore, clock, logger } = dependencies;

  const insertedModels = await db.insert(models).values(practiceModels).returning();
  const modelIdsByName = new Map(insertedModels.map((model) => [model.name, model.id]));

  const categoryRepository = createCategoryRepository(db);
  // The whole list, and not only the four entries the drawings below happen to use: emptying
  // the archive empties the list a migration put there, and a practice system an Administrator
  // is shown has to offer the same thirteen the real one will.
  for (const name of standingCategories) {
    await categoryRepository.findOrAdd(name, categorySlug(name));
  }

  const scanService = createScanService({
    tavolaRepository: createTavolaRepository(db),
    scanRepository: createScanRepository(db),
    fileStore,
    clock,
    logger,
  });

  let drawings = 0;
  let marked = 0;
  /** Every Position that was recorded, so the Listings below can find the one they name. */
  const sheetPositions = new Map<string, { tavolaId: string; positionId: string }>();
  const onSheet = (model: string, tavola: string, position: string) =>
    `${model} / ${tavola} / ${position}`;

  for (const seed of practiceTavole) {
    const modelId = modelIdsByName.get(seed.model);
    if (!modelId) {
      throw new Error(`The practice Tavola ${seed.number} names a Model that is not seeded.`);
    }

    const category = await categoryRepository.findOrAdd(seed.category, categorySlug(seed.category));

    const [tavola] = await db
      .insert(tavole)
      .values({
        modelId,
        number: seed.number,
        numberSort: numericPrefixOf(seed.number),
        nameIt: seed.nameIt,
        nameEn: seed.nameEn,
        categoryId: category.id,
        catalogSection: seed.catalogSection,
        catalogGroup: seed.catalogGroup,
        catalogSubgroup: seed.catalogSubgroup,
      })
      .returning();

    if (tavola && seed.drawn) {
      await scanService.ingest(tavola.id, await inventedDrawing(seed.number, seed.nameIt));
      drawings += 1;

      const recorded = await markPracticeTavola(db, tavola.id);
      marked += recorded.size;
      for (const [number, positionId] of recorded) {
        sheetPositions.set(onSheet(seed.model, seed.number, number), {
          tavolaId: tavola.id,
          positionId,
        });
      }
    }
  }

  const partIds = await writePracticeParts(db);
  const listed = await db
    .insert(listings)
    .values(
      practiceListings.map((seed) => {
        const partId = partIds.get(seed.part);
        const at = sheetPositions.get(onSheet(seed.model, seed.tavola, seed.position));
        if (!partId || !at) {
          throw new Error(`The practice Listing of ${seed.part} names something not seeded.`);
        }
        // A Listing is a Part's appearance on a *drawing*; the Position is where on it.
        return {
          partId,
          tavolaId: at.tavolaId,
          positionId: at.positionId,
          quantityPerCar: seed.quantity,
          drawn: seed.drawn,
        };
      }),
    )
    .returning();

  const belongsWith = await writePracticeGroupsAndLinks(db, (model, tavola, position) => {
    const at = sheetPositions.get(onSheet(model, tavola, position));
    if (!at) {
      throw new Error(`The practice archive groups a Position that is not seeded: ${position}.`);
    }
    return at;
  });

  const record = await writePracticeRecord(db, modelIdsByName, partIds);
  const photographed = await writePracticePhotographs(dependencies, partIds);
  const unchecked = await writePracticeUncheckedTavola(dependencies, scanService, modelIdsByName);

  return {
    models: practiceModels.length,
    tavole: practiceTavole.length,
    drawings,
    positions: marked,
    parts: partIds.size,
    listings: listed.length,
    ...belongsWith,
    ...record,
    photographs: photographed,
    unchecked,
  };
}

/**
 * **A drawing as a reading leaves it: Unchecked, with doubts** (issue #56), so the checking screen
 * has something to be practised and tested on. Only an Editor is shown it, as always.
 *
 * Its doubts are about numbers on the drawing and not about rows, so no Part gains a sheet here
 * and every count the rest of this archive is judged by stays as it was. There are several,
 * because the browser suite runs on two screens against one archive, and each clears its own.
 */
export const practiceUncheckedTavola = {
  model: '5300 GT Strada',
  number: '9',
  nameIt: 'Pompa benzina',
  nameEn: 'Fuel pump',
  category: 'Fuel',
  readingMethod: 'a practice Reading method',
  doubts: [
    { position: '1', reason: 'Only one of the two Readings has this row' },
    { position: '3', reason: 'The quantity: the other Reading has “4”' },
    { position: '4', reason: 'This number is drawn, and no row of the table lists it' },
  ],
} as const;

async function writePracticeUncheckedTavola(
  dependencies: SeedDependencies,
  scanService: ReturnType<typeof createScanService>,
  modelIdsByName: Map<string, string>,
): Promise<number> {
  const { db } = dependencies;
  const seed = practiceUncheckedTavola;
  const modelId = modelIdsByName.get(seed.model);
  if (!modelId) {
    throw new Error(`The practice Unchecked Tavola names a Model that is not seeded.`);
  }

  const category = await createCategoryRepository(db).findOrAdd(
    seed.category,
    categorySlug(seed.category),
  );
  const [tavola] = await db
    .insert(tavole)
    .values({
      modelId,
      number: seed.number,
      numberSort: numericPrefixOf(seed.number),
      nameIt: seed.nameIt,
      nameEn: seed.nameEn,
      categoryId: category.id,
      state: 'unchecked',
      readingMethod: seed.readingMethod,
    })
    .returning();
  if (!tavola) {
    throw new Error('The practice Unchecked Tavola was not inserted.');
  }

  await scanService.ingest(tavola.id, await inventedDrawing(seed.number, seed.nameIt));
  const positionIds = await markPracticeTavola(db, tavola.id);
  await db.insert(readingDoubts).values(
    seed.doubts.map((doubt) => {
      const positionId = positionIds.get(doubt.position);
      if (!positionId) {
        throw new Error(`The practice doubt names a Position not seeded: ${doubt.position}.`);
      }
      return { tavolaId: tavola.id, listingId: null, positionId, reason: doubt.reason };
    }),
  );

  return 1;
}

/**
 * The invented photographs, written through the same service an Editor's upload goes through.
 *
 * **Not straight to the table**, unlike every other fixture in this file, and for a reason that
 * is not consistency: a Photograph is a row *and* three files under a key, and a seeder that
 * wrote the row itself would be a second implementation of the one thing that has to stay in
 * step. The rest of the practice archive is rows and nothing else, so it has nothing to drift
 * from.
 */
async function writePracticePhotographs(
  dependencies: SeedDependencies,
  partIds: Map<string, string>,
): Promise<number> {
  const { db, fileStore, clock, logger } = dependencies;

  const partRepository = createPartRepository(db);
  const photographRepository = createPhotographRepository(db);
  const photographService = createPhotographService({
    partRepository,
    photographRepository,
    partRecordService: createPartRecordService({
      clock,
      modelRepository: createModelRepository(db),
      partRepository,
      partRecordRepository: createPartRecordRepository(db),
      photographRepository,
      specificationListRepository: createSpecificationListRepository(db),
    }),
    fileStore,
    clock,
    logger,
  });

  for (const seed of practicePhotographs) {
    const partId = partIds.get(seed.part);
    if (!partId) {
      throw new Error(`The practice photograph of ${seed.part} names a Part that is not seeded.`);
    }
    await photographService.add(partId, await inventedPhotograph(seed.of));
  }

  return practicePhotographs.length;
}

/**
 * What belongs *with* the invented sheet's numbers — the group they sit in, and the one link
 * between two of them.
 *
 * The link is written the way the archive insists on it everywhere else: **one row, in ascending
 * order**, so the seeded sheet reports it from both ends without either end having been recorded.
 */
async function writePracticeGroupsAndLinks(
  db: Db,
  at: (model: string, tavola: string, position: string) => { tavolaId: string; positionId: string },
): Promise<{ subAssemblies: number; relatedPositions: number }> {
  let grouped = 0;
  for (const seed of practiceSubAssemblies) {
    const [group] = await db
      .insert(subAssemblies)
      .values({
        tavolaId: at(seed.model, seed.tavola, seed.positions[0]).tavolaId,
        name: seed.name,
      })
      .returning();
    if (!group) {
      throw new Error(`The practice Sub-assembly ${seed.name} was not inserted.`);
    }
    grouped += 1;

    await db
      .update(positions)
      .set({ subAssemblyId: group.id })
      .where(
        inArray(
          positions.id,
          seed.positions.map((number) => at(seed.model, seed.tavola, number).positionId),
        ),
      );
  }

  const linked = await db
    .insert(relatedPositions)
    .values(
      practiceRelatedPositions.map((seed) => {
        const [first, second] = seed.positions.map(
          (number) => at(seed.model, seed.tavola, number).positionId,
        );
        if (first === undefined || second === undefined) {
          throw new Error('A practice Related Position names fewer than two numbers.');
        }
        // Ascending, which is what the check constraint refuses any other arrangement of.
        return first < second
          ? { positionId: first, relatedPositionId: second }
          : { positionId: second, relatedPositionId: first };
      }),
    )
    .returning();

  return { subAssemblies: grouped, relatedPositions: linked.length };
}

/**
 * What fits the invented components, what replaces them and where they have been for sale.
 *
 * **Hung off the Parts and not off any drawing**, which is the whole of ADR 0001 written as a
 * fixture: the brake hose fits two cars and is listed on one sheet, and neither fact is derivable
 * from the other.
 */
async function writePracticeRecord(
  db: Db,
  modelIdsByName: Map<string, string>,
  partIds: Map<string, string>,
): Promise<{ fitments: number; equivalents: number; sources: number }> {
  const partId = (key: string) => {
    const found = partIds.get(key);
    if (!found) {
      throw new Error(`The practice record names a Part that is not seeded: ${key}.`);
    }
    return found;
  };

  const recordedFitments = await db
    .insert(fitments)
    .values(
      practiceFitments.map((seed) => {
        const modelId = modelIdsByName.get(seed.model);
        if (!modelId) {
          throw new Error(`The practice Fitment names a Model that is not seeded: ${seed.model}.`);
        }
        return { partId: partId(seed.part), modelId, qualifier: seed.qualifier };
      }),
    )
    .returning();

  const recordedEquivalents = await db
    .insert(equivalents)
    .values(
      practiceEquivalents.map((seed) => ({
        partId: partId(seed.part),
        kind: seed.kind,
        maker: seed.maker,
        reference: seed.reference,
        note: seed.note,
      })),
    )
    .returning();

  const recordedSources = await db
    .insert(sources)
    .values(
      practiceSources.map((seed) => ({
        partId: partId(seed.part),
        name: seed.name,
        url: seed.url,
        condition: seed.condition,
        priceAmount: seed.priceAmount,
        priceCurrency: seed.priceCurrency,
        observedOn: seed.observedOn,
        note: seed.note,
      })),
    )
    .returning();

  return {
    fitments: recordedFitments.length,
    equivalents: recordedEquivalents.length,
    sources: recordedSources.length,
  };
}

/**
 * The Positions a marked-up sheet carries: one on each number the drawing prints, and one the
 * drawing does not print at all.
 *
 * Written straight to the tables rather than through the marking tool, because this is a
 * fixture and not a demonstration of the tool — what the tool does is asserted at the API and
 * browser seams, where an Editor's click is what places the circle.
 */
async function markPracticeTavola(db: Db, tavolaId: string): Promise<Map<string, string>> {
  // One row per *number*, however many places the sheet prints it: a Position is the number, and
  // the places it is printed are its Marks.
  const numbers = new Set([
    ...practiceNumbers.map((printed) => printed.number),
    undrawnPracticePosition,
  ]);

  const rows = await db
    .insert(positions)
    .values(
      [...numbers].map((number) => ({ tavolaId, number, numberSort: numericPrefixOf(number) })),
    )
    .returning();

  const idsByNumber = new Map(rows.map((row) => [row.number, row.id]));
  await db.insert(marks).values(
    practiceNumbers.map((printed) => {
      const positionId = idsByNumber.get(printed.number);
      if (!positionId) {
        throw new Error(`The practice Position ${printed.number} was not inserted.`);
      }
      return { positionId, x: printed.x, y: printed.y };
    }),
  );

  return idsByNumber;
}

/**
 * The invented components, written once however many drawings list them.
 *
 * Once is the point rather than an economy: a Part is a thing in its own right (ADR 0001), and a
 * practice archive that wrote the same bolt twice would be demonstrating the duplication the
 * whole identity rule exists to prevent — and would have nothing to show under "also on".
 */
async function writePracticeParts(db: Db): Promise<Map<string, string>> {
  const keys = Object.keys(practiceParts);
  const rows = await db
    .insert(parts)
    .values(keys.map((key) => practiceParts[key as keyof typeof practiceParts]))
    .returning();

  return new Map(rows.map((row, index) => [keys[index] as string, row.id]));
}

/**
 * Empties the catalog. **Only the local seeding command asks for this** — a deployed system
 * never does it to itself.
 */
export async function emptyCatalog(db: Db, fileStore: FileStore): Promise<void> {
  // **Parts are named here explicitly, and that is not belt and braces.** A Part is a component
  // in its own right (ADR 0001), so no column of it points at a Model — which means emptying the
  // Models does not cascade to it however far the cascade runs. Left behind, the Catalog Numbers
  // of the last practice archive collide with the next one's and seeding refuses. The Listings
  // do cascade, from both ends.
  await db.execute(sql`TRUNCATE ${models}, ${categories}, ${parts} RESTART IDENTITY CASCADE`);
  // Truncating the tables without taking the files leaves a directory of images nothing points
  // at, growing every time the practice archive is rebuilt. Both kinds of image, because both
  // kinds have files: the Photographs cascade from the Parts named above. So do the catalogs
  // uploaded to be read, whose Catalog runs cascade from the Models.
  await fileStore.remove('scans');
  await fileStore.remove('photographs');
  await fileStore.remove('catalog-runs');
}

/**
 * A drawing that could not be mistaken for a factory one: a ruled sheet with a handful of invented
 * components on it, each with a number and a leader line running to it, at roughly the proportions
 * of an A3 page. It exists so a practice archive has something to open, and so the viewer has
 * something to be built against at ticket 04.
 *
 * Its numbers are printed from `practiceNumbers` — the same fractions the seeded Marks are placed
 * at — so the two cannot be edited apart and a seeded Mark always lands on a number.
 *
 * **It used to print each number inside a circle, and the factory does not.** The first real sheet
 * anyone has seen — Tavola 84 of the Rivolta — prints bare numerals with thin leader lines running
 * to the part, and nothing is drawn around them. That mattered more than it sounds: every screen
 * in this repository was being judged against a friendlier sheet than the archive has, and
 * `MARK_RING` had been fitted to the circles *this function invented* rather than to anything the
 * factory printed. The numerals below are set at the size they measure on that sheet —
 * **0.0124 of the shorter side**, which is a 22px digit here — so a Mark drawn over one lands the
 * way it will land on the real thing.
 *
 * **And every leader line used to end at the middle of the sheet**, which no exploded view does:
 * a number points at *a part*. Each now has one of its own, drawn in three passes — lines, then
 * components, then numerals — so a component hides the line that passes behind it, the way ink on
 * paper does. It is still unmistakably invented; it is simply no longer misleading about shape.
 */
function inventedDrawing(number: string, name: string): Promise<Buffer> {
  const width = 2480;
  const height = 1754;

  /** A digit is 0.0124 of the shorter side on a real sheet, and about 0.7 of its font size. */
  const numeralSize = Math.round(Math.min(width, height) * 0.0124 * 1.45);
  /** Where the leader line starts, so it runs to the part rather than through the numeral. */
  const clearOfTheNumeral = numeralSize;

  const placed = practiceNumbers.map((printed) => ({
    number: printed.number,
    at: { x: printed.x * width, y: printed.y * height },
    to: { x: printed.points.x * width, y: printed.points.y * height },
    part: printed.points.part,
  }));

  const leaders = placed
    .map(({ at, to }) => {
      const away = Math.hypot(to.x - at.x, to.y - at.y) || 1;
      const from = {
        x: at.x + ((to.x - at.x) / away) * clearOfTheNumeral,
        y: at.y + ((to.y - at.y) / away) * clearOfTheNumeral,
      };
      return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(1)}" y2="${to.y.toFixed(1)}" stroke="#111111" stroke-width="3"/>`;
    })
    .join('');

  const components = placed
    .map(({ to, part }) => inventedComponent(part, to.x, to.y, width * PART_SIZES[part]))
    .join('');

  const numerals = placed
    .map(
      ({ number: printed, at }) =>
        `<text x="${at.x}" y="${at.y + numeralSize * 0.35}" font-family="DejaVu Serif, Times New Roman, serif" font-size="${numeralSize}" text-anchor="middle" fill="#111111">${printed}</text>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="40" y="40" width="${width - 80}" height="${height - 80}"
      fill="none" stroke="#111111" stroke-width="4"/>
    <text x="90" y="150" font-family="DejaVu Serif, Times New Roman, serif" font-size="64" fill="#111111">TAVOLA ${number}</text>
    <text x="90" y="230" font-family="DejaVu Serif, Times New Roman, serif" font-size="44" fill="#444444">${name}</text>
    <text x="90" y="${height - 90}" font-family="DejaVu Serif, Times New Roman, serif" font-size="32" fill="#888888">
      Invented for the practice archive — not a factory drawing
    </text>
    ${leaders}
    ${components}
    ${numerals}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * One invented component, centred on the point its number points at.
 *
 * **Filled white and stroked**, which is doing real work rather than decoration: a filled shape
 * hides the leader lines that pass behind it, which is how a drawn part reads on paper and is the
 * only thing that stops five lines crossing the middle of the sheet in the open.
 *
 * Four shapes, because the sheet lists four kinds of thing and a member's screen distinguishes
 * them — a bracket, the pin through it, a disc and the washer behind it. They are geometry and
 * nothing more; nothing here is traced from anything real (`AGENTS.md`).
 */
function inventedComponent(
  part: PracticePart['part'],
  cx: number,
  cy: number,
  size: number,
): string {
  const ink = 'fill="#ffffff" stroke="#111111" stroke-width="5"';
  const r = size / 2;

  switch (part) {
    case 'bracket':
      return `
      <rect x="${cx - r}" y="${cy - r * 0.62}" width="${size}" height="${size * 0.62}" rx="${r * 0.22}" ${ink}/>
      <circle cx="${cx - r * 0.55}" cy="${cy - r * 0.3}" r="${r * 0.16}" ${ink}/>
      <circle cx="${cx + r * 0.55}" cy="${cy - r * 0.3}" r="${r * 0.16}" ${ink}/>`;
    case 'pin':
      return `
      <rect x="${cx - r}" y="${cy - r * 0.34}" width="${size * 0.28}" height="${size * 0.34}" ${ink}/>
      <rect x="${cx - r + size * 0.28}" y="${cy - r * 0.17}" width="${size * 0.72}" height="${size * 0.17}" ${ink}/>`;
    case 'disc':
      return `
      <circle cx="${cx}" cy="${cy}" r="${r}" ${ink}/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.42}" ${ink}/>`;
    case 'washer':
      return `
      <circle cx="${cx}" cy="${cy}" r="${r}" ${ink}/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" ${ink}/>`;
  }
}

/**
 * A photograph that could not be mistaken for one: a flat grey field with a drawn shape on it and
 * the caption saying what it is. It exists so a practice archive has something for the panel
 * beside the drawing to show, and so "view it larger" has something to open.
 *
 * Landscape and portrait alternate by the length of the caption, which is arbitrary and is the
 * point: a strip of thumbnails has to hold its shape when the pictures do not agree about theirs.
 */
function inventedPhotograph(of: string): Promise<Buffer> {
  const portrait = of.length % 2 === 1;
  const width = portrait ? 1200 : 1600;
  const height = portrait ? 1600 : 1200;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#6f6d68"/>
    <rect x="${width * 0.16}" y="${height * 0.24}" width="${width * 0.68}" height="${height * 0.4}"
      rx="${width * 0.04}" fill="#b9b5ad" stroke="#3d3b37" stroke-width="10"/>
    <circle cx="${width * 0.32}" cy="${height * 0.44}" r="${width * 0.07}"
      fill="#6f6d68" stroke="#3d3b37" stroke-width="10"/>
    <circle cx="${width * 0.68}" cy="${height * 0.44}" r="${width * 0.07}"
      fill="#6f6d68" stroke="#3d3b37" stroke-width="10"/>
    <text x="${width / 2}" y="${height * 0.78}" font-family="DejaVu Sans, Helvetica, sans-serif"
      font-size="52" text-anchor="middle" fill="#f2f0ec">${of}</text>
    <text x="${width / 2}" y="${height * 0.86}" font-family="DejaVu Sans, Helvetica, sans-serif"
      font-size="34" text-anchor="middle" fill="#cfcbc4">
      Invented for the practice archive — not a photograph of a real part
    </text>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}
