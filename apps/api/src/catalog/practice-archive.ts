import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../db/client.js';
import { categories, listings, marks, models, parts, positions, tavole } from '../db/schema.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import { createCategoryRepository } from '../repositories/category-repository.js';
import { createScanRepository } from '../repositories/scan-repository.js';
import { createTavolaRepository } from '../repositories/tavola-repository.js';
import { createScanService } from '../services/scan-service.js';
import type { FileStore } from '../storage/file-store.js';
import { categorySlug, numericPrefixOf } from './naming.js';

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
    category: 'Body',
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
    category: 'Fuel System',
    catalogSection: '110',
    catalogGroup: '02',
    catalogSubgroup: null,
    drawn: true,
  },
];

/**
 * The numbered circles the invented drawing prints, **as fractions of the sheet** — which is
 * also the unit a Mark is stored in (ADR 0013), so the drawing below and the Marks seeded onto
 * it are read off one list and cannot drift apart.
 */
const practiceCircles = [
  { number: '1', x: 0.25, y: 0.3 },
  { number: '2', x: 0.5, y: 0.43 },
  { number: '3', x: 0.75, y: 0.3 },
  { number: '4', x: 0.5, y: 0.71 },
];

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

  return {
    models: practiceModels.length,
    tavole: practiceTavole.length,
    drawings,
    positions: marked,
    parts: partIds.size,
    listings: listed.length,
  };
}

/**
 * The Positions a marked-up sheet carries: one on each circle the drawing prints, and one the
 * drawing does not print at all.
 *
 * Written straight to the tables rather than through the marking tool, because this is a
 * fixture and not a demonstration of the tool — what the tool does is asserted at the API and
 * browser seams, where an Editor's click is what places the circle.
 */
async function markPracticeTavola(db: Db, tavolaId: string): Promise<Map<string, string>> {
  const rows = await db
    .insert(positions)
    .values(
      [...practiceCircles.map((circle) => circle.number), undrawnPracticePosition].map(
        (number) => ({ tavolaId, number, numberSort: numericPrefixOf(number) }),
      ),
    )
    .returning();

  const idsByNumber = new Map(rows.map((row) => [row.number, row.id]));
  await db.insert(marks).values(
    practiceCircles.map((circle) => {
      const positionId = idsByNumber.get(circle.number);
      if (!positionId) {
        throw new Error(`The practice Position ${circle.number} was not inserted.`);
      }
      return { positionId, x: circle.x, y: circle.y };
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
  // at, growing every time the practice archive is rebuilt.
  await fileStore.remove('scans');
}

/**
 * A drawing that could not be mistaken for a factory one: a ruled sheet with a few numbered
 * circles on it, at roughly the proportions of an A3 page. It exists so a practice archive has
 * something to open, and so the viewer has something to be built against at ticket 04.
 *
 * Its circles are printed from `practiceCircles` — the same fractions the seeded Marks are
 * placed at — so the two cannot be edited apart and a seeded Mark always lands on a number.
 */
function inventedDrawing(number: string, name: string): Promise<Buffer> {
  const width = 2480;
  const height = 1754;
  const middle = { x: width / 2, y: height / 2 };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="40" y="40" width="${width - 80}" height="${height - 80}"
      fill="none" stroke="#111111" stroke-width="4"/>
    <text x="90" y="150" font-family="DejaVu Serif, Times New Roman, serif" font-size="64" fill="#111111">TAVOLA ${number}</text>
    <text x="90" y="230" font-family="DejaVu Serif, Times New Roman, serif" font-size="44" fill="#444444">${name}</text>
    <text x="90" y="${height - 90}" font-family="DejaVu Serif, Times New Roman, serif" font-size="32" fill="#888888">
      Invented for the practice archive — not a factory drawing
    </text>
    ${practiceCircles
      .map((circle) => {
        const at = { x: circle.x * width, y: circle.y * height };
        return `
      <line x1="${at.x}" y1="${at.y}" x2="${middle.x}" y2="${middle.y}"
        stroke="#111111" stroke-width="3"/>
      <circle cx="${at.x}" cy="${at.y}" r="52"
        fill="#ffffff" stroke="#111111" stroke-width="5"/>
      <text x="${at.x}" y="${at.y + 20}" font-family="DejaVu Serif, Times New Roman, serif" font-size="56"
        text-anchor="middle" fill="#111111">${circle.number}</text>`;
      })
      .join('')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
