import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

/** The generated SQL, under version control. Resolved from this module so it works from `dist` too. */
export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface MigrateOptions {
  /** Where the migration bookkeeping table lives. Tests point it at their own schema. */
  migrationsSchema?: string;
}

export async function runMigrations(db: Db, options: MigrateOptions = {}): Promise<void> {
  await migrate(db, {
    migrationsFolder,
    migrationsSchema: options.migrationsSchema ?? 'drizzle',
  });
}
