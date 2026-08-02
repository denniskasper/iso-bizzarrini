/**
 * Fills a database that is not the archive: the browser seam's, and the non-production system's.
 *
 * **The catalog below is invented and lives in this file.** Nothing is copied, exported or
 * anonymised from anywhere real — the most common way a club leaks its own roster is a demo
 * loaded from production, and the only reliable defence is that the loading path does not
 * exist. There is no dump to import here because there is no importer. The drawings are drawn
 * by this file too, in a few lines of SVG: there is no real scan in this repository, and there
 * should not be.
 *
 * It also lives outside `src`, so it is not in the production image at all (see the Dockerfile),
 * and it refuses to run against a production environment even if someone points it at one.
 */
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import sharp from 'sharp';
import { categorySlug, numericPrefixOf } from '../src/catalog/naming.js';
import { assertSeedable } from '../src/composition/environment-safety.js';
import { loadConfig } from '../src/config/config.js';
import { loadEnvFile } from '../src/config/env-file.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { categories, models, tavole } from '../src/db/schema.js';
import { createCategoryRepository } from '../src/repositories/category-repository.js';
import { systemClock } from '../src/platform/clock.js';
import { createLogger } from '../src/platform/logger.js';
import { createScanRepository } from '../src/repositories/scan-repository.js';
import { createTavolaRepository } from '../src/repositories/tavola-repository.js';
import { createScanService } from '../src/services/scan-service.js';
import { createFileStore } from '../src/storage/file-store.js';

/**
 * Models the factory really made — their names are public, printed on the cover of every
 * catalog — with nothing behind them but this file.
 */
export const seedModels = [
  { brand: 'Bizzarrini', name: '5300 GT Strada', series: null, modelYears: '1965–68' },
  { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
  { brand: 'Iso', name: 'Rivolta IR 300', series: null, modelYears: '1962–70' },
];

/** Keyed by the Model above they belong to, since a Tavola belongs to exactly one (ADR 0002). */
export const seedTavole = [
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
    // legitimate state and the practice archive should show one.
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

loadEnvFile();
const config = loadConfig();
assertSeedable(config);

await ensureDatabaseExists(config.databaseUrl);

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });
const fileStore = createFileStore(config.files.storagePath);

try {
  await runMigrations(database.db);

  // Truncating the tables without taking the files leaves a directory of images nothing points
  // at, growing every time the practice archive is rebuilt.
  await database.db.execute(sql`TRUNCATE ${models}, ${categories} RESTART IDENTITY CASCADE`);
  await fileStore.remove('scans');

  const insertedModels = await database.db.insert(models).values(seedModels).returning();
  const modelIdsByName = new Map(insertedModels.map((model) => [model.name, model.id]));

  // The archive's own rule for "is this Category one we already have", not a second copy of it.
  const categoryRepository = createCategoryRepository(database.db);

  const scanService = createScanService({
    tavolaRepository: createTavolaRepository(database.db),
    scanRepository: createScanRepository(database.db),
    fileStore,
    clock: systemClock,
    logger: createLogger({ ...config, logLevel: 'warn' }),
  });

  let drawings = 0;
  for (const seed of seedTavole) {
    const modelId = modelIdsByName.get(seed.model);
    if (!modelId) {
      throw new Error(`The seed Tavola ${seed.number} names a Model that is not seeded.`);
    }

    const [tavola] = await database.db
      .insert(tavole)
      .values({
        modelId,
        number: seed.number,
        numberSort: numericPrefixOf(seed.number),
        nameIt: seed.nameIt,
        nameEn: seed.nameEn,
        categoryId: (await categoryRepository.findOrAdd(seed.category, categorySlug(seed.category)))
          .id,
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

  console.log(
    `Seeded ${seedModels.length} generated Models, ${seedTavole.length} Tavole and ` +
      `${drawings} invented drawings into "${config.environmentName}".`,
  );
} finally {
  await database.close();
}

/**
 * A drawing that could not be mistaken for a factory one: a ruled sheet with a few numbered
 * circles on it, at roughly the proportions of an A3 page. It exists so the practice archive
 * has something to open, and so the viewer has something to be built against at ticket 04.
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
    <text x="90" y="150" font-family="serif" font-size="64" fill="#111111">TAVOLA ${number}</text>
    <text x="90" y="230" font-family="serif" font-size="44" fill="#444444">${name}</text>
    <text x="90" y="${height - 90}" font-family="serif" font-size="32" fill="#888888">
      Invented for the practice archive — not a factory drawing
    </text>
    ${positions
      .map(
        (position) => `
      <line x1="${position.x}" y1="${position.y}" x2="1240" y2="880"
        stroke="#111111" stroke-width="3"/>
      <circle cx="${position.x}" cy="${position.y}" r="52"
        fill="#ffffff" stroke="#111111" stroke-width="5"/>
      <text x="${position.x}" y="${position.y + 20}" font-family="serif" font-size="56"
        text-anchor="middle" fill="#111111">${position.label}</text>`,
      )
      .join('')}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function ensureDatabaseExists(url: string): Promise<void> {
  const target = new URL(url);
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new Error('DATABASE_URL has no database name.');
  }

  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';

  const client = new Client({ connectionString: maintenance.toString() });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      databaseName,
    ]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
    }
  } finally {
    await client.end();
  }
}
