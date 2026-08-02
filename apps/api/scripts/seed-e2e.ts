/**
 * Prepares the database the Playwright seam runs against: creates it if it is not there,
 * migrates it, and puts a known, generated catalog in it.
 *
 * Lives outside `src` so it never reaches the production image, and the data is invented —
 * seed data is generated, never copied from anywhere real.
 */
import { sql } from 'drizzle-orm';
import { Client } from 'pg';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { models } from '../src/db/schema.js';

export const e2eModels = [
  { brand: 'Bizzarrini', name: '5300 GT Strada', series: null, modelYears: '1965–68' },
  { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
  { brand: 'Iso', name: 'Rivolta IR 300', series: null, modelYears: '1962–70' },
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before seeding the end-to-end database.');
}

await ensureDatabaseExists(databaseUrl);

const database = createDatabase(databaseUrl, { maxConnections: 1 });
try {
  await runMigrations(database.db);
  await database.db.execute(sql`TRUNCATE ${models} RESTART IDENTITY CASCADE`);
  await database.db.insert(models).values(e2eModels);
  console.log(`Seeded ${e2eModels.length} Models for the end-to-end seam.`);
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
