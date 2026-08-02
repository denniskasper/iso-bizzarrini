import { sql } from 'drizzle-orm';
import { loadEnvFile } from '../../src/config/env-file.js';
import { createDatabase, type Database } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

// Each vitest worker is its own process, so each one reads the repository `.env` for itself.
loadEnvFile();

/**
 * A real Postgres, migrated, one schema per test worker.
 *
 * The primary seam drives the application over real HTTP with nothing of ours mocked, which
 * means the database has to be real too. Workers get a schema each so the suite can run in
 * parallel without tests seeing one another's rows.
 */
export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://ricambi:ricambi@localhost:5433/ricambi_test';
}

export function workerSchemaName(): string {
  const worker = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '1';
  return `test_w${worker}`;
}

export interface TestDatabase extends Database {
  readonly schemaName: string;
  /** Empties every table the migrations created, leaving the schema in place. */
  truncateAll(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const schemaName = workerSchemaName();

  const maintenance = createDatabase(testDatabaseUrl(), { maxConnections: 1 });
  try {
    await maintenance.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`));
    await maintenance.db.execute(sql.raw(`CREATE SCHEMA ${schemaName}`));
  } finally {
    await maintenance.close();
  }

  const database = createDatabase(testDatabaseUrl(), {
    searchPath: `${schemaName},public`,
    maxConnections: 5,
  });

  await runMigrations(database.db, { migrationsSchema: schemaName });

  return {
    ...database,
    schemaName,
    async truncateAll() {
      const tables = await database.db.execute<{ tablename: string }>(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schemaName}`,
      );
      const names = tables.rows
        .map((row) => row.tablename)
        .filter((name) => !name.startsWith('__drizzle'))
        .map((name) => `${schemaName}."${name}"`);

      if (names.length > 0) {
        await database.db.execute(sql.raw(`TRUNCATE ${names.join(', ')} RESTART IDENTITY CASCADE`));
      }
    },
  };
}
