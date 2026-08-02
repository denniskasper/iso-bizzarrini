import { loadConfig } from '../config/config.js';
import { loadEnvFile } from '../config/env-file.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrate.js';

loadEnvFile();

const config = loadConfig();
const database = createDatabase(config.databaseUrl, { maxConnections: 1 });

try {
  await runMigrations(database.db);
  console.log(`Migrations applied to ${config.environmentName}.`);
} finally {
  await database.close();
}
