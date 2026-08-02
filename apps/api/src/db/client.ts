import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

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
