/**
 * What the archive has measured about its own scans, and what that says about tiling.
 *
 * Ticket 03 asks for at least a dozen **real** scans to be measured before the deep-zoom
 * question is answered, and ADR 0013 records that none had been obtained. Rather than leave
 * that as a note for a volunteer with a ruler, ingest records the pixel dimensions and every
 * byte size of every scan it accepts. This reads them back and applies the threshold, so the
 * decision is re-examined by running one command against a system that has real drawings in it.
 *
 * It only reads. Run it against production if that is where the scans are.
 */
import { asc } from 'drizzle-orm';
import { createEmailSender, createPaymentProvider } from '../src/composition/platform.js';
import { assertSafeForEnvironment } from '../src/composition/environment-safety.js';
import { loadConfig } from '../src/config/config.js';
import { loadEnvFile } from '../src/config/env-file.js';
import { createDatabase } from '../src/db/client.js';
import { scans } from '../src/db/schema.js';

/**
 * The threshold ADR 0013 was decided against: tile if a whole drawing is more than this to
 * send, because that is where opening one on a phone on poor reception starts to hurt.
 */
const TILING_THRESHOLD_BYTES = 3 * 1024 * 1024;

/** Below this, a position number cannot be read on a phone whatever the delivery format is. */
const USABLE_LONG_EDGE = 3000;

loadEnvFile();
const config = loadConfig();

// ADR 0012: an entry point that does not build the app owes the environment guard a call of
// its own, or it is a way into the environment that nothing checked. This one only reads, but
// the rule is not "unless you think it is harmless" — that judgement is what it exists to
// remove, and the next maintenance script copied from this one may not be read-only.
assertSafeForEnvironment({
  config,
  emailSender: createEmailSender(config),
  paymentProvider: createPaymentProvider(config),
});

const database = createDatabase(config.databaseUrl, { maxConnections: 1 });
try {
  const rows = await database.db.select().from(scans).orderBy(asc(scans.ingestedAt));

  console.log(`\nScans measured in "${config.environmentName}": ${rows.length}\n`);

  if (rows.length === 0) {
    console.log('Nothing to measure yet. Upload real scans and run this again.\n');
  } else {
    console.log(
      ['source', 'pixels', 'megapixels', 'uploaded', 'display', 'preview'].join('\t').toUpperCase(),
    );
    for (const row of rows) {
      console.log(
        [
          row.sourceFormat,
          `${row.sourceWidth}×${row.sourceHeight}`,
          ((row.sourceWidth * row.sourceHeight) / 1_000_000).toFixed(1),
          megabytes(row.sourceByteSize),
          megabytes(row.displayByteSize),
          megabytes(row.previewByteSize),
        ].join('\t'),
      );
    }

    const displaySizes = rows.map((row) => row.displayByteSize).sort((a, b) => a - b);
    const longEdges = rows.map((row) => Math.max(row.sourceWidth, row.sourceHeight));

    console.log(`\nWhat a member is sent to open a drawing:`);
    console.log(
      `  median ${megabytes(median(displaySizes))}, largest ${megabytes(Math.max(...displaySizes))}`,
    );
    console.log(
      `  longest edge scanned: ${Math.max(...longEdges)}px, shortest: ${Math.min(...longEdges)}px\n`,
    );

    const tooBig = displaySizes.filter((size) => size > TILING_THRESHOLD_BYTES).length;
    const tooSmall = longEdges.filter((edge) => edge < USABLE_LONG_EDGE).length;

    if (rows.length < 12) {
      console.log(
        `Fewer than a dozen scans. Ticket 03 asks for at least twelve real ones before this\n` +
          `decision is reconsidered, because a handful of them says nothing about the archive.\n`,
      );
    } else if (tooBig > rows.length / 2) {
      console.log(
        `More than half of these are over ${megabytes(TILING_THRESHOLD_BYTES)} to open. That is\n` +
          `the case ADR 0013 said would justify a tile pyramid. Reopen it.\n`,
      );
    } else {
      console.log(
        `Under the threshold ADR 0013 set. One private image per Tavola remains the right\n` +
          `answer; nothing here justifies a tile pyramid.\n`,
      );
    }

    if (tooSmall > 0) {
      console.log(
        `${tooSmall} of these were scanned under ${USABLE_LONG_EDGE}px on the long edge. No\n` +
          `delivery format rescues that — a position number on them cannot be read on a phone,\n` +
          `and the scanning itself needs revisiting.\n`,
      );
    }
  }
} finally {
  await database.close();
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
