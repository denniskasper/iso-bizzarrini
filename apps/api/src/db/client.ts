import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/**
 * A handle that runs queries: the pool above, or a transaction opened on it.
 *
 * **Repositories take this rather than `Db`**, so the same repository runs inside a request and
 * inside the single transaction the archive migration wraps a whole spreadsheet in. That is
 * what lets a migration's dry run *be* the load, rolled back, rather than a second
 * implementation of it that is free to disagree with the first.
 *
 * The only thing it lacks is the connection pool, which nothing below the composition root has
 * any business reaching for anyway.
 */
export type DbSession = Omit<Db, '$client'>;

export interface Database {
  readonly db: Db;
  readonly pool: Pool;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  /**
   * Postgres schema to work in. Tests give each worker its own so they can run concurrently
   * against one real database without seeing each other's rows.
   */
  searchPath?: string;
  maxConnections?: number;
}

export function createDatabase(connectionString: string, options: DatabaseOptions = {}): Database {
  const pool = new Pool({
    connectionString,
    max: options.maxConnections ?? 10,
    ...(options.searchPath ? { options: `-c search_path=${options.searchPath}` } : {}),
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: () => pool.end(),
  };
}
