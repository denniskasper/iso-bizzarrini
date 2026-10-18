import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { writeSheet } from '../sheets/csv.js';
import { ReadCatalogError } from './catalog-reading.js';
import type { CostRecord } from './cost.js';
import {
  DOUBTS_FILE,
  DOUBT_COLUMNS,
  LISTING_COLUMNS,
  LISTINGS_FILE,
  MARKS_FILE,
  MARK_COLUMNS,
  PAGES_FILE,
  READING_FILE,
  SCAN_FILE,
  SET_ASIDE_COLUMNS,
  SET_ASIDE_DIRECTORY,
  SET_ASIDE_FILE,
  TAVOLA_FILE,
  costFile,
  pagesManifestSchema,
  readingManifestSchema,
  tableSheetFile,
  tavolaDirectory,
  tavolaManifestSchema,
  type PagesManifest,
  type ReadingManifest,
  type TavolaManifest,
} from './read-directory.js';
import {
  NOTHING_DONE,
  type DoneBefore,
  type FinishedTavola,
  type ReadingStore,
  type SetAsidePage,
} from './reading-store.js';
import type { MachineTranslation } from './translation.js';

export interface DirectoryStoreOptions {
  /** Where the reading is kept: resolved, and outside the repository. */
  out: string;
  /** The catalog it is read from. Only its file name is kept. */
  pdf: string;
  /** The car the catalog is for. A resumed run takes it from the directory. */
  model?: { brand: string; name: string };
  /** Carry on in a directory an earlier run stopped in, rather than start an empty one. */
  resume?: boolean;
  repositoryRoot: string;
}

/**
 * **The read command's store**: the directory `read-directory.ts` describes, which `archive:load`
 * turns into Unchecked Tavole.
 */
export function directoryStore(
  options: DirectoryStoreOptions,
): ReadingStore & { costFile(): string } {
  const { out, pdf } = options;
  assertOutside(out, options.repositoryRoot);

  let manifest: ReadingManifest | null = null;
  let asked: PagesManifest = { pages: [] };
  let run = 1;

  return {
    async done(): Promise<DoneBefore> {
      if (!options.resume) {
        await assertEmpty(out);
        if (!options.model) {
          throw new ReadCatalogError('Say which car the catalog is for, with --brand and --model.');
        }
        return NOTHING_DONE;
      }
      const previous = await previousReading(out, pdf, options.model);
      manifest = previous.manifest;
      asked = { pages: [...previous.pages.pages] };
      run = previous.run;
      return {
        run,
        pages: previous.pages.pages,
        tavole: previous.tavole,
        translations: previous.translations,
      };
    },

    async started({ readingMethod }) {
      manifest ??= {
        model: options.model as ReadingManifest['model'],
        readingMethod,
        readFrom: basename(pdf),
        tavole: [],
      };
      await mkdir(out, { recursive: true });
      await writeJson(join(out, READING_FILE), manifest);
    },

    async pageFound(page, identity) {
      asked.pages.push({ page, identity });
      await writeJson(join(out, PAGES_FILE), asked);
    },

    async tavolaFinished(tavola) {
      const reading = manifestOf(manifest);
      const directory = tavolaDirectory(tavola.number);
      await writeTavola(join(out, directory), tavola);
      reading.tavole.push(directory);
      await writeJson(join(out, READING_FILE), reading);
    },

    async costed(record) {
      await writeJson(join(out, costFile(run)), record);
    },

    async ended({ cost, setAside }: { cost: CostRecord; setAside: SetAsidePage[] }) {
      await writeJson(join(out, READING_FILE), manifestOf(manifest));
      await writeSetAside(out, setAside);
      await writeJson(join(out, costFile(run)), cost);
    },

    costFile: () => costFile(run),
  };
}

function manifestOf(manifest: ReadingManifest | null): ReadingManifest {
  if (!manifest) {
    throw new Error('A Tavola was finished before the reading started.');
  }
  return manifest;
}

async function writeTavola(directory: string, tavola: FinishedTavola): Promise<void> {
  await mkdir(directory, { recursive: true });

  const manifest: TavolaManifest = {
    number: tavola.number,
    titleIt: tavola.titleIt,
    titleEn: tavola.titleEn,
    catalogSection: tavola.catalogSection,
    catalogGroup: tavola.catalogGroup,
    catalogSubgroup: tavola.catalogSubgroup,
    readingMethod: tavola.readingMethod,
    scan: tavola.scan ? SCAN_FILE : null,
    tableSheets: tavola.tableSheets.map((sheet, index) => ({
      file: tableSheetFile(index + 1),
      page: sheet.page,
      foglio: sheet.foglio,
    })),
    machineTranslations: tavola.machineTranslations,
  };

  if (tavola.scan) {
    await writeFile(join(directory, SCAN_FILE), tavola.scan.image);
  }
  for (const [index, sheet] of tavola.tableSheets.entries()) {
    await writeFile(join(directory, tableSheetFile(index + 1)), sheet.image);
  }
  await writeJson(join(directory, TAVOLA_FILE), manifest);

  const c = LISTING_COLUMNS;
  await writeFile(
    join(directory, LISTINGS_FILE),
    writeSheet(
      Object.values(c),
      tavola.listings.map((listing) => ({
        [c.position]: listing.position,
        [c.drawn]: listing.drawn ? 'yes' : 'no',
        [c.catalogNumber]: listing.catalogNumber,
        [c.disegnoOrigine]: listing.disegnoOrigine,
        [c.quantity]: listing.quantity,
        [c.nameIt]: listing.nameIt,
        [c.nameEn]: listing.nameEn,
        [c.catalogNote]: listing.catalogNote,
        [c.catalogNoteEn]: listing.catalogNoteEn,
        [c.fitmentQualifier]: listing.fitmentQualifier,
        [c.tableSheet]: String(listing.tableSheet),
        [c.doubt]: listing.doubts.join('; '),
        [c.readingNote]: listing.notes.join('; '),
      })),
    ),
    'utf8',
  );

  if (tavola.scan) {
    const m = MARK_COLUMNS;
    await writeFile(
      join(directory, MARKS_FILE),
      writeSheet(
        Object.values(m),
        tavola.marks.map((mark) => ({
          [m.position]: mark.position,
          [m.x]: mark.x.toFixed(4),
          [m.y]: mark.y.toFixed(4),
          [m.readingNote]: mark.unsure ? 'The number was hard to read.' : '',
        })),
      ),
      'utf8',
    );
    const d = DOUBT_COLUMNS;
    await writeFile(
      join(directory, DOUBTS_FILE),
      writeSheet(
        Object.values(d),
        tavola.doubts.map((doubt) => ({ [d.position]: doubt.position, [d.doubt]: doubt.reason })),
      ),
      'utf8',
    );
  }
}

async function writeSetAside(out: string, sheets: SetAsidePage[]): Promise<void> {
  const c = SET_ASIDE_COLUMNS;
  const rows: Record<string, string>[] = [];
  if (sheets.length > 0) {
    await mkdir(join(out, SET_ASIDE_DIRECTORY), { recursive: true });
  }
  for (const sheet of sheets) {
    const file = join(SET_ASIDE_DIRECTORY, `page-${sheet.page}.png`);
    await writeFile(join(out, file), sheet.image);
    rows.push({ [c.page]: String(sheet.page), [c.file]: file, [c.reason]: sheet.reason });
  }
  await writeFile(join(out, SET_ASIDE_FILE), writeSheet(Object.values(c), rows), 'utf8');
}

function writeJson(path: string, value: unknown): Promise<void> {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** **The Club's scans never land in the repository** (`AGENTS.md`, ADR 0017). */
function assertOutside(out: string, repositoryRoot: string): void {
  const inside = relative(repositoryRoot, out);
  if (
    inside === '' ||
    (!inside.startsWith('..') && !inside.startsWith(sep) && !/^[A-Za-z]:/.test(inside))
  ) {
    throw new ReadCatalogError(
      `${out} is inside the repository. What is read is the Club's material and stays out of ` +
        'it: give a directory somewhere else, such as ../catalog-reading.',
    );
  }
}

/**
 * A directory already holding something is not one to start reading into: two catalogs in one
 * place are one directory nobody can say the provenance of. Carrying on is `--resume`.
 */
async function assertEmpty(out: string): Promise<void> {
  if (existsSync(out) && (await readdir(out)).length > 0) {
    throw new ReadCatalogError(
      `${out} already holds something. Give an empty or new directory, or carry on reading ` +
        'into it with --resume.',
    );
  }
}

/** What an earlier run in this directory left: the same catalog, for the same car. */
async function previousReading(
  out: string,
  pdf: string,
  model: DirectoryStoreOptions['model'],
): Promise<{
  manifest: ReadingManifest;
  pages: PagesManifest;
  run: number;
  tavole: string[];
  translations: MachineTranslation[];
}> {
  const readJson = async (file: string) => {
    try {
      return JSON.parse(await readFile(join(out, file), 'utf8')) as unknown;
    } catch {
      throw new ReadCatalogError(
        `${out} holds no reading to carry on with: its ${file} is missing or unreadable.`,
      );
    }
  };
  const manifest = readingManifestSchema.parse(await readJson(READING_FILE));
  const pages = existsSync(join(out, PAGES_FILE))
    ? pagesManifestSchema.parse(await readJson(PAGES_FILE))
    : { pages: [] };

  if (manifest.readFrom !== basename(pdf)) {
    throw new ReadCatalogError(
      `${out} was read from ${manifest.readFrom}, not ${basename(pdf)}. Carry on with the same PDF.`,
    );
  }
  if (model && (model.brand !== manifest.model.brand || model.name !== manifest.model.name)) {
    throw new ReadCatalogError(
      `${out} is the catalog of the ${manifest.model.brand} ${manifest.model.name}, not the ` +
        `${model.brand} ${model.name}.`,
    );
  }

  const files = await readdir(out);
  let run = 1;
  while (files.includes(costFile(run + 1))) {
    run += 1;
  }
  run += 1;
  // The finished Tavole, and what they were translated as, so the rest read the same.
  const tavole: string[] = [];
  const translations: MachineTranslation[] = [];
  for (const directory of manifest.tavole) {
    const tavola = tavolaManifestSchema.safeParse(
      await readJson(join(directory, TAVOLA_FILE)).catch(() => null),
    );
    if (tavola.success) {
      tavole.push(tavola.data.number);
      translations.push(...tavola.data.machineTranslations);
    }
  }
  return { manifest, pages, run, tavole, translations };
}
