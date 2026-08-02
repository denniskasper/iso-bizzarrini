import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../db/client.js';
import { categories, models, tavole } from '../db/schema.js';
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
    }
  }

  return { models: practiceModels.length, tavole: practiceTavole.length, drawings };
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
 */
function inventedDrawing(number: string, name: string): Promise<Buffer> {
  const width = 2480;
  const height = 1754;
  const positions = [
    { x: 620, y: 520, label: '1' },
    { x: 1240, y: 760, label: '2' },
    { x: 1860, y: 520, label: '3' },
    { x: 1240, y: 1240, label: '4' },
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="40" y="40" width="${width - 80}" height="${height - 80}"
      fill="none" stroke="#111111" stroke-width="4"/>
    <text x="90" y="150" font-family="DejaVu Serif, Times New Roman, serif" font-size="64" fill="#111111">TAVOLA ${number}</text>
    <text x="90" y="230" font-family="DejaVu Serif, Times New Roman, serif" font-size="44" fill="#444444">${name}</text>
    <text x="90" y="${height - 90}" font-family="DejaVu Serif, Times New Roman, serif" font-size="32" fill="#888888">
      Invented for the practice archive — not a factory drawing
    </text>
    ${positions
      .map(
        (position) => `
      <line x1="${position.x}" y1="${position.y}" x2="1240" y2="880"
        stroke="#111111" stroke-width="3"/>
      <circle cx="${position.x}" cy="${position.y}" r="52"
        fill="#ffffff" stroke="#111111" stroke-width="5"/>
      <text x="${position.x}" y="${position.y + 20}" font-family="DejaVu Serif, Times New Roman, serif" font-size="56"
        text-anchor="middle" fill="#111111">${position.label}</text>`,
      )
      .join('')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
