/**
 * Fills a database that is not the archive: the browser seam's, and the non-production system's.
 *
 * **The catalog below is invented and lives in this file.** Nothing is copied, exported or
 * anonymised from anywhere real — the most common way a club leaks its own roster is a demo
 * loaded from production, and the only reliable defence is that the loading path does not
 * exist. There is no dump to import here because there is no importer.
 *
 * It also lives outside `src`, so it is not in the production image at all (see the Dockerfile),
 * and it refuses to run against a production environment even if someone points it at one.
 */
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { assertSeedable } from '../src/composition/environment-safety.js';
import { loadConfig } from '../src/config/config.js';
import { loadEnvFile } from '../src/config/env-file.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { models } from '../src/db/schema.js';

/**
 * Models the factory really made — their names are public, printed on the cover of every
 * catalog — with nothing behind them but this file. Ticket 03 brings the first real Tavola, and
 * this is the root it extends.
 */
export const seedModels = [
  { brand: 'Bizzarrini', name: '5300 GT Strada', series: null, modelYears: '1965–68' },
  { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
  { brand: 'Iso', name: 'Rivolta IR 300', series: null, modelYears: '1962–70' },
];

loadEnvFile();
const config = loadConfig();
assertSeedable(config);

await ensureDatabaseExists(config.databaseUrl);

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });
try {
  await runMigrations(database.db);
  await database.db.execute(sql`TRUNCATE ${models} RESTART IDENTITY CASCADE`);
  await database.db.insert(models).values(seedModels);
  console.log(`Seeded ${seedModels.length} generated Models into "${config.environmentName}".`);
} finally {
  await database.close();
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
