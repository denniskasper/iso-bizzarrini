/**
 * Reads a scanned factory catalog into a directory of plain files (ADR 0017, issue #31).
 *
 * ```sh
 * pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading \
 *   --brand Iso --model Rivolta --pages 5-120 --limit 20
 * pnpm archive:load -- --source ../catalog-reading --dry-run
 * ```
 *
 * A developer tool: the Club reads its catalog inside Ricambi (ADR 0018). The directory is the
 * Club's material and is refused inside this repository; what is loaded from it arrives
 * Unchecked, for an Editor to check and publish in Ricambi. The procedure is in
 * `docs/operations/catalog-reading.md`.
 *
 * It reads with Claude Code's subscription login, which is not charged, or with an API key in
 * `ANTHROPIC_API_KEY`, which is billed per use. Where there are both, `--with subscription` or
 * `--with api-key` says which (issue #38).
 *
 * `--limit` is the most the run may cost, in dollars, and there is no default. The run is
 * estimated before anything is read, refused above the limit, and stopped before it could pass it.
 * What it cost is written to `cost.json`. A run that stopped, at its limit or at the plan's, is
 * carried on with `--resume` and the same `--out`.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnvFile } from '../src/config/env-file.js';
import { chooseCredential, CredentialChoiceError } from '../src/reading/choose-method.js';
import { createClaudeApiReadingMethod } from '../src/reading/claude-api-method.js';
import {
  createClaudeSubscriptionReadingMethod,
  subscriptionLoginAvailable,
} from '../src/reading/claude-subscription-method.js';
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
    limit: { type: 'string' },
    with: { type: 'string' },
    resume: { type: 'boolean' },
  },
});

const usage =
  'pnpm catalog:read -- --pdf ../catalog.pdf --out ../catalog-reading --brand Iso --model Rivolta --limit 20 [--pages 5-120] [--with subscription|api-key] [--resume]';

if (!values.pdf || !values.out || (!values.resume && (!values.brand || !values.model))) {
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
let credential;
try {
  credential = chooseCredential(
    { subscription: await subscriptionLoginAvailable(), apiKey: !!apiKey },
    values.with,
  );
} catch (error) {
  if (!(error instanceof CredentialChoiceError)) {
    throw error;
  }
  console.error(`${error.message}\n`);
  process.exit(2);
}

try {
  await readCatalog({
    pdf: resolve(values.pdf),
    out: resolve(values.out),
    model: values.brand && values.model ? { brand: values.brand, name: values.model } : undefined,
    method:
      credential === 'api-key'
        ? createClaudeApiReadingMethod({ apiKey: apiKey as string })
        : createClaudeSubscriptionReadingMethod(),
    pages: pdfPages({
      first: pages[1] ? Number(pages[1]) : undefined,
      last: pages[2] ? Number(pages[2]) : undefined,
    }),
    limit: values.limit === undefined ? undefined : Number(values.limit.replace(/^\$/, '')),
    resume: values.resume,
    print: (line) => console.log(line),
  });
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exitCode = 1;
}
