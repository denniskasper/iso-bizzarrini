/**
 * **What the commands that move and fetch Proposals share** (issue #157): the environment they
 * run in, checked, and a database to run against. Each of them is a separate entry point, so
 * each owes the environment guard a call of its own (ADR 0012) — and Proposals belong to
 * practice systems, so each refuses Production as well.
 */
import {
  assertProposalsBelongHere,
  assertSafeForEnvironment,
} from '../composition/environment-safety.js';
import { createEmailSender, createPaymentProvider } from '../composition/platform.js';
import type { AppConfig } from '../config/config.js';
import { loadConfig } from '../config/config.js';
import { loadEnvFile } from '../config/env-file.js';
import { createDatabase, type Db } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { systemClock } from '../platform/clock.js';
import { createLogger } from '../platform/logger.js';
import { createFileStore, type FileStore } from '../storage/file-store.js';

export interface ProposalsCommand {
  config: AppConfig;
  db: Db;
  fileStore: FileStore;
}

/** `run` against this environment's database, once the environment has been checked. */
export async function runProposalsCommand(
  run: (command: ProposalsCommand) => Promise<void>,
): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const logger = createLogger(config);

  assertSafeForEnvironment({
    config,
    emailSender: createEmailSender(config, logger),
    paymentProvider: createPaymentProvider(config, systemClock),
  });
  assertProposalsBelongHere(config);

  const database = createDatabase(config.databaseUrl, { maxConnections: 1 });
  try {
    await runMigrations(database.db);
    await run({ config, db: database.db, fileStore: createFileStore(config.files.storagePath) });
  } finally {
    await database.close();
  }
}

/**
 * The arguments after the command, without the `--` that `pnpm proposals:… -- …` hands down to
 * the script, where it would otherwise end option parsing.
 */
export function commandArguments(): string[] {
  return process.argv.slice(2).filter((token) => token !== '--');
}
