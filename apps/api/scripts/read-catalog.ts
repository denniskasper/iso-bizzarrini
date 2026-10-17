/**
 * Reads a scanned factory catalog into a directory of plain files (ADR 0016, issue #31).
 *
 * ```sh
 * ANTHROPIC_API_KEY=… pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading \
 *   --brand Iso --model Rivolta --pages 5-120
 * pnpm archive:load -- --source ../catalog-reading --dry-run
 * ```
 *
 * The directory is the Club's material and is refused inside this repository. `listings.csv` in
 * each Tavola's directory opens in Excel and may be corrected there before it is loaded; what is
 * loaded arrives Unchecked, for an Editor to compare with the sheets and publish. The procedure
 * is in `docs/operations/catalog-reading.md`.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnvFile } from '../src/config/env-file.js';
import { createClaudeApiReadingMethod } from '../src/reading/claude-api-method.js';
import { pdfPages } from '../src/reading/pdf-pages.js';
import { readCatalog } from '../src/reading/read-catalog.js';

const { values } = parseArgs({
  // `pnpm catalog:read -- …` hands the `--` down; see scripts/load-archive.ts.
  args: process.argv.slice(2).filter((token) => token !== '--'),
  options: {
    pdf: { type: 'string' },
    out: { type: 'string' },
    brand: { type: 'string' },
    model: { type: 'string' },
    pages: { type: 'string' },
  },
});

const usage =
  'pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading --brand Iso --model Rivolta [--pages 5-120]';

if (!values.pdf || !values.out || !values.brand || !values.model) {
  console.error(`Which catalog, for which car, and where to? Give all four:\n  ${usage}\n`);
  process.exit(2);
}

const pages = /^(\d+)?-(\d+)?$/.exec(values.pages ?? '-');
if (!pages) {
  console.error(`--pages is a range such as 5-120, 5- or -120.\n  ${usage}\n`);
  process.exit(2);
}

loadEnvFile();
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('There is no API key in ANTHROPIC_API_KEY, and nothing else to read with yet.\n');
  process.exit(2);
}

try {
  await readCatalog({
    pdf: resolve(values.pdf),
    out: resolve(values.out),
    model: { brand: values.brand, name: values.model },
    method: createClaudeApiReadingMethod({ apiKey }),
    pages: pdfPages({
      first: pages[1] ? Number(pages[1]) : undefined,
      last: pages[2] ? Number(pages[2]) : undefined,
    }),
    print: (line) => console.log(line),
  });
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exitCode = 1;
}
