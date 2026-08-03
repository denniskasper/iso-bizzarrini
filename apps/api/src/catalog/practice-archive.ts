import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../db/client.js';
import { categories, marks, models, positions, tavole } from '../db/schema.js';
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
      marked += await markPracticeTavola(db, tavola.id);
    }
  }

  return {
    models: practiceModels.length,
    tavole: practiceTavole.length,
    drawings,
    positions: marked,
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
async function markPracticeTavola(db: Db, tavolaId: string): Promise<number> {
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

  return rows.length;
}

/**
 * Empties the catalog. **Only the local seeding command asks for this** — a deployed system
 * never does it to itself.
 */
export async function emptyCatalog(db: Db, fileStore: FileStore): Promise<void> {
  await db.execute(sql`TRUNCATE ${models}, ${categories} RESTART IDENTITY CASCADE`);
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
