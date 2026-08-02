import { Client } from 'pg';
import { loadEnvFile } from '../../src/config/env-file.js';
import { testDatabaseUrl } from './test-database.js';

export async function setup(): Promise<void> {
  loadEnvFile();

  const client = new Client({ connectionString: testDatabaseUrl() });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `The API test seam needs a real Postgres at ${redact(testDatabaseUrl())}.\n` +
        'Start it with `pnpm db:up`, or point TEST_DATABASE_URL somewhere else.',
      { cause },
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '';
    parsed.username = '';
    return parsed.toString();
  } catch {
    return '(unparseable TEST_DATABASE_URL)';
  }
}
