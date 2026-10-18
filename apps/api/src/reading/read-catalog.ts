import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCatalogInto, ReadCatalogError, type CatalogReading } from './catalog-reading.js';
import { dollars } from './cost.js';
import { directoryStore } from './directory-store.js';
import { LISTINGS_FILE, tavolaDirectory } from './read-directory.js';
import type { ReadingMethod, SheetImage } from './reading-method.js';

export { ReadCatalogError };

/**
 * **The read command** (ADR 0017): a catalog PDF in, a directory of plain files out, which
 * `archive:load` turns into Unchecked Tavole.
 *
 * The reading itself is `catalog-reading.ts`. This keeps its progress in the directory
 * `read-directory.ts` describes (`directory-store.ts`), and tells the operator where it went.
 */
export interface ReadCatalogOptions {
  pdf: string;
  out: string;
  /**
   * The car the catalog is for. A Tavola's number means something only within its Model. A
   * resumed run takes it from the directory, and refuses one that differs.
   */
  model?: { brand: string; name: string };
  method: ReadingMethod;
  pages: PageSource;
  /**
   * The most the run may cost, in dollars. There is no default, so nobody spends by accident:
   * a run without one does not start.
   */
  limit: number | undefined;
  /**
   * Carry on in a directory an earlier run stopped in: pages already asked about are not asked
   * again, and Tavole already finished are not read again.
   */
  resume?: boolean;
  /** Where each line of the running report goes. */
  print: (line: string) => void;
  /** The repository the output must stay out of. Found from this file when not given. */
  repositoryRoot?: string;
}

/** The pages of a PDF as images, in order. */
export type PageSource = (pdf: string) => AsyncIterable<SheetImage>;

export interface ReadCatalogResult extends Omit<CatalogReading, 'tavole'> {
  tavole: (CatalogReading['tavole'][number] & { directory: string })[];
}

export async function readCatalog(options: ReadCatalogOptions): Promise<ReadCatalogResult> {
  const { print } = options;
  const out = resolve(options.out);
  const store = directoryStore({
    out,
    pdf: options.pdf,
    model: options.model,
    resume: options.resume,
    repositoryRoot: options.repositoryRoot ?? repositoryRootOf(),
  });
  const reading = await readCatalogInto({
    method: options.method,
    pages: options.pages(options.pdf),
    limit: options.limit,
    store,
    print,
  });

  const { cost } = reading;
  print(
    (cost.charged
      ? `Cost ${dollars(cost.total)}`
      : `Would have cost ${dollars(cost.total)} at list prices, and was not charged`) +
      `, estimated at ${dollars(cost.estimate)}, within a limit of ${dollars(cost.limit)}. ` +
      `Recorded in ${store.costFile()}.`,
  );
  print(`Written to ${out}. Correct ${LISTINGS_FILE} where it needs it, then load it:`);
  print(`  pnpm archive:load -- --source ${out}`);
  if (cost.stopped !== null) {
    print('To read the rest, run the same command again with --resume and a limit for the rest.');
  }

  return {
    ...reading,
    tavole: reading.tavole.map((tavola) => ({
      ...tavola,
      directory: tavolaDirectory(tavola.number),
    })),
  };
}

/** The directory holding `pnpm-workspace.yaml`, found by walking up from this file. */
function repositoryRootOf(): string {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new ReadCatalogError('Could not find the repository this command belongs to.');
    }
    directory = parent;
  }
  return directory;
}
