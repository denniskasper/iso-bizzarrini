/**
 * Fills a database that is not the archive, **from empty**: the browser seam's, and a practice
 * system somebody wants back in a known state.
 *
 * This is the destructive one — it empties the catalog first, which is why it is a command a
 * person runs deliberately rather than something a container does to itself. A deployed
 * preview seeds itself only when there is nothing there (`SEED_PRACTICE_ARCHIVE`), so a
 * redeployment cannot take away what an Editor recorded through the screens.
 *
 * The invented catalog itself lives in `src/catalog/practice-archive.ts`, along with the
 * reasoning for why it is written in this repository rather than imported from anywhere.
 */
import { Client } from 'pg';
import { emptyCatalog, writePracticeArchive } from '../src/catalog/practice-archive.js';
import { assertSeedable } from '../src/composition/environment-safety.js';
import { loadConfig } from '../src/config/config.js';
import { loadEnvFile } from '../src/config/env-file.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { systemClock } from '../src/platform/clock.js';
import { createLogger } from '../src/platform/logger.js';
import { createFileStore } from '../src/storage/file-store.js';

loadEnvFile();
const config = loadConfig();
assertSeedable(config);

await ensureDatabaseExists(config.databaseUrl);

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });
const fileStore = createFileStore(config.files.storagePath);

try {
  await runMigrations(database.db);
  await emptyCatalog(database.db, fileStore);

  const written = await writePracticeArchive({
    db: database.db,
    fileStore,
    clock: systemClock,
    logger: createLogger({ ...config, logLevel: 'warn' }),
    config,
  });

  console.log(
    `Seeded ${written.models} generated Models, ${written.tavole} Tavole, ` +
      `${written.drawings} invented drawings, ${written.positions} Positions and ` +
      `${written.listings} Listings of ${written.parts} Parts, ` +
      `${written.subAssemblies} Sub-assemblies and ${written.relatedPositions} Related Positions, ` +
      `and ${written.fitments} Fitments, ${written.equivalents} Equivalents, ` +
      `${written.sources} Sources and ${written.photographs} Photographs ` +
      `into "${config.environmentName}".`,
  );
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
