/**
 * Loads the Club's existing spreadsheets and scans into the archive (ticket 13, ADR 0005).
 *
 * ```sh
 * pnpm archive:load -- --source ../club-archive --dry-run
 * pnpm archive:load -- --source ../club-archive
 * ```
 *
 * **Run the dry run first, read the report, correct the sheet, run it again.** That loop is the
 * whole method: the loader is re-runnable by construction, so a rejected row is something to fix
 * in the spreadsheet rather than something to work around here, and a second run adds what was
 * missing without touching what already landed.
 *
 * **A directory the read command wrote** (`pnpm catalog:read`, ADR 0017) is loaded the same way
 * and is told apart by its `reading.json`: its Tavole arrive Unchecked, an Unchecked one already
 * there is replaced whole, and a Published one is refused.
 *
 * The material itself lives outside this repository — the archive is the Club's, and
 * `AGENTS.md` keeps its contents out of version control. What is versioned is this loader and
 * the plan that says what the columns mean. The procedure is in
 * `docs/operations/archive-migration.md`.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { assertSafeForEnvironment } from '../src/composition/environment-safety.js';
import { createEmailSender, createPaymentProvider } from '../src/composition/platform.js';
import { loadConfig } from '../src/config/config.js';
import { loadEnvFile } from '../src/config/env-file.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { loadArchive } from '../src/migration/load-archive.js';
import { isReadingDirectory, loadReading } from '../src/migration/load-reading.js';
import { renderReadingReport } from '../src/migration/reading-report.js';
import { renderReport } from '../src/migration/report.js';
import { systemClock } from '../src/platform/clock.js';
import { createLogger } from '../src/platform/logger.js';
import { createFileStore } from '../src/storage/file-store.js';

const { values } = parseArgs({
  // `pnpm archive:load -- --source …` hands the `--` down to the script, where it would
  // otherwise end option parsing and turn every flag after it into a positional. Dropping it is
  // what makes the documented invocation the one that works.
  args: process.argv.slice(2).filter((token) => token !== '--'),
  options: {
    source: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    report: { type: 'string', default: 'archive-load-report.md' },
  },
});

if (!values.source) {
  console.error(
    'Which archive? Give the directory holding plan.json, the exported sheets and the scans:\n' +
      '  pnpm archive:load -- --source ../club-archive --dry-run\n',
  );
  process.exit(2);
}

loadEnvFile();
const config = loadConfig();

// ADR 0012: an entry point that does not build the application owes the environment guard a
// call of its own, or it is a way into the environment that nothing checked. **This one is
// meant for production** — the archive is loaded into the real system, deliberately and once —
// so what it checks for is a practice system holding something that can reach a real person.
assertSafeForEnvironment({
  config,
  emailSender: createEmailSender(config, createLogger(config)),
  paymentProvider: createPaymentProvider(config, systemClock),
});

const source = resolve(values.source);
const dryRun = values['dry-run'] === true;
const database = createDatabase(config.databaseUrl, { maxConnections: 1 });

try {
  // The same step the application takes when it boots, for the same reason: a load against a
  // database a migration behind fails somewhere in the middle of a spreadsheet with a message
  // about a column, and the person running it is a volunteer with an export, not a developer.
  //
  // **Not in a dry run**, which promises to write nothing and has to mean it — applying DDL is
  // writing, whatever it is called. A rehearsal against a database that is behind will fail
  // saying so, and `pnpm db:migrate` is the answer.
  if (!dryRun) {
    await runMigrations(database.db);
  }

  const dependencies = {
    db: database.db,
    fileStore: createFileStore(config.files.storagePath),
    clock: systemClock,
    logger: createLogger({ ...config, logLevel: 'warn' }),
    source,
    dryRun,
  };
  const path = resolve(values.report);
  let refused: number;

  if (await isReadingDirectory(source)) {
    const report = await loadReading(dependencies);
    await writeFile(path, `${renderReadingReport(report)}\n`, 'utf8');
    refused = report.rejected.length;

    console.log(
      `\n${dryRun ? 'Dry run against' : 'Loaded'} the reading ${source} into "${config.environmentName}".\n\n` +
        report.tavole
          .map(
            (tavola) =>
              `  Tavola ${tavola.number}: ${tavola.outcome}, ${tavola.listings} Listings\n`,
          )
          .join('') +
        `\n  ${refused} refused, ${report.warnings.length} loaded with something missing\n\n` +
        `The report is at ${path}.\n`,
    );
  } else {
    const report = await loadArchive(dependencies);
    await writeFile(path, `${renderReport(report)}\n`, 'utf8');
    refused = report.rejected.length;

    console.log(
      `\n${dryRun ? 'Dry run against' : 'Loaded'} ${source} into "${config.environmentName}".\n\n` +
        `  ${report.rowsLoaded} of ${report.rowsRead} catalog rows\n` +
        `  ${report.parts.created} Parts, ${report.listings.created} Listings, ` +
        `${report.positions.created} Positions on ${report.tavole.created} Tavole\n` +
        `  ${report.fitments.created} Fitments, ${report.equivalents.created} Equivalents, ` +
        `${report.sources.created} Sources\n` +
        `  ${report.subAssemblies.created} Sub-assemblies, ` +
        `${report.relatedPositions.created} Related Positions\n` +
        `  ${report.scans.ingested} scans ingested, ${report.scans.alreadyIngested} already there\n\n` +
        `  ${refused} rows refused, ${report.warnings.length} loaded with something missing\n\n` +
        `The report is at ${path}.\n`,
    );
  }

  if (dryRun) {
    console.log('Nothing was written. Drop --dry-run to load it.\n');
  }

  // A refused row is work left to do on the spreadsheet, so this does not exit cleanly with
  // rows still on the floor — the rest of the archive is loaded either way, and running again
  // after the sheet is corrected is safe.
  if (refused > 0) {
    process.exitCode = 1;
  }
} finally {
  await database.close();
}
