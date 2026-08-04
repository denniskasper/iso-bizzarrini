import { sql } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';

export interface SystemRepository {
  isDatabaseReachable(): Promise<boolean>;
}

export function createSystemRepository(db: DbSession): SystemRepository {
  return {
    async isDatabaseReachable() {
      try {
        await db.execute(sql`select 1`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
