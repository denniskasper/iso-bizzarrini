import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { numericPrefixOf } from '../catalog/naming.js';
import { writeSheet } from '../sheets/csv.js';
import { compareReadings } from './compare.js';
import { interpretTable, type ComparedSheet, type ReadListing } from './interpret.js';
import {
  LISTING_COLUMNS,
  LISTINGS_FILE,
  READING_FILE,
  SCAN_FILE,
  SET_ASIDE_COLUMNS,
  SET_ASIDE_DIRECTORY,
  SET_ASIDE_FILE,
  TAVOLA_FILE,
  tableSheetFile,
  tavolaDirectory,
  type ReadingManifest,
  type TavolaManifest,
} from './read-directory.js';
import type { ReadingMethod, SheetIdentity, SheetImage, Tokens } from './reading-method.js';

/**
 * **The read command** (ADR 0016): a catalog PDF in, a directory of plain files out, which
 * `archive:load` turns into Unchecked Tavole.
 *
 * Every page is first asked what it is and whose. A sheet belongs to the Tavola printed on it and
 * never to the page it follows — the scans are out of order — and one whose number cannot be read
 * is set aside for a person rather than guessed. Each sheet is turned upright the way its headings
 * read. Then every Table sheet is read twice, independently, the two Readings are compared, and
 * what the factory meant by its dashes, repeats and ranges is worked out once, here.
 */
export interface ReadCatalogOptions {
  pdf: string;
  out: string;
  /** The car the catalog is for. A Tavola's number means something only within its Model. */
  model: { brand: string; name: string };
  method: ReadingMethod;
  pages: PageSource;
  /** Where each line of the running report goes. */
  print: (line: string) => void;
  /** The repository the output must stay out of. Found from this file when not given. */
  repositoryRoot?: string;
}

/** The pages of a PDF as images, in order. */
export type PageSource = (pdf: string) => AsyncIterable<SheetImage>;

export interface ReadCatalogResult {
  tavole: { number: string; directory: string; listings: number; inDoubt: number }[];
  setAside: { page: number; reason: string }[];
  tokens: Tokens;
}

export class ReadCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadCatalogError';
  }
}

interface IdentifiedSheet extends SheetImage {
  identity: SheetIdentity;
}

export async function readCatalog(options: ReadCatalogOptions): Promise<ReadCatalogResult> {
  const { method, print } = options;
  const out = resolve(options.out);
  await assertWritableOutside(out, options.repositoryRoot ?? repositoryRootOf());

  const tokens: Tokens = { input: 0, output: 0 };
  const spend = (used: Tokens) => {
    tokens.input += used.input;
    tokens.output += used.output;
  };

  const setAside: (ReadCatalogResult['setAside'][number] & { image: Buffer })[] = [];
  const byTavola = new Map<string, IdentifiedSheet[]>();

  for await (const page of options.pages(options.pdf)) {
    const { value: identity, tokens: used } = await method.identify(page);
    spend(used);

    if (identity.kind === 'other') {
      setAside.push({ ...page, reason: 'It is neither a drawing nor a Table sheet.' });
      continue;
    }
    const number = identity.tavola?.trim();
    if (!number) {
      setAside.push({ ...page, reason: 'Its Tavola number could not be read.' });
      continue;
    }

    const upright = await sharp(page.image).rotate(identity.turn).png().toBuffer();
    const sheets = byTavola.get(number) ?? [];
    sheets.push({ page: page.page, image: upright, identity: { ...identity, tavola: number } });
    byTavola.set(number, sheets);
  }

  await mkdir(out, { recursive: true });
  const manifest: ReadingManifest = {
    model: options.model,
    readingMethod: method.name,
    readFrom: basename(options.pdf),
    tavole: [],
  };
  const result: ReadCatalogResult = { tavole: [], setAside: [], tokens };

  for (const [number, sheets] of byTavola) {
    const [drawing, ...otherDrawings] = sheets.filter((sheet) => sheet.identity.kind === 'drawing');
    for (const extra of otherDrawings) {
      setAside.push({
        ...extra,
        reason: `A second drawing for Tavola ${number}; the one on page ${drawing?.page} is its Scan.`,
      });
    }
    const tables = inFactoryOrder(sheets.filter((sheet) => sheet.identity.kind === 'table'));

    print(
      `Tavola ${number}: ${drawing ? `drawing on page ${drawing.page}` : 'no drawing'}, ` +
        `${tables.length} Table ${tables.length === 1 ? 'sheet' : 'sheets'}` +
        (tables.length > 0 ? ` (${pagesNamed(tables)})` : ''),
    );

    const compared: ComparedSheet[] = [];
    for (const [index, sheet] of tables.entries()) {
      const first = await method.readTable(sheet, 1);
      spend(first.tokens);
      const second = await method.readTable(sheet, 2);
      spend(second.tokens);

      const rows = compareReadings(first.value.rows, second.value.rows);
      compared.push({ layout: first.value.layout, ranges: first.value.ranges, rows });
      print(
        `  Table sheet ${index + 1}, page ${sheet.page}: ${rows.length} rows, ` +
          `${rows.filter((row) => row.doubts.length > 0).length} in doubt`,
      );
    }

    const listings = interpretTable(compared);
    const directory = tavolaDirectory(number);
    await writeTavola(join(out, directory), number, method.name, drawing ?? null, tables, listings);

    const inDoubt = listings.filter((listing) => listing.doubts.length > 0).length;
    print(`  ${listings.length} Listings, ${inDoubt} in doubt`);
    result.tavole.push({ number, directory, listings: listings.length, inDoubt });

    // After every Tavola, so a run that stops part-way leaves a directory that loads what it read.
    manifest.tavole.push(directory);
    await writeJson(join(out, READING_FILE), manifest);
  }

  await writeJson(join(out, READING_FILE), manifest);
  await writeSetAside(out, setAside);
  for (const sheet of setAside) {
    print(`Set aside: page ${sheet.page}. ${sheet.reason}`);
  }
  result.setAside = setAside.map(({ page, reason }) => ({ page, reason }));

  print(
    `Read by ${method.name}: ${tokens.input.toLocaleString('en-GB')} tokens in, ` +
      `${tokens.output.toLocaleString('en-GB')} out.`,
  );
  print(`Written to ${out}. Correct ${LISTINGS_FILE} where it needs it, then load it:`);
  print(`  pnpm archive:load -- --source ${out}`);

  return result;
}

/**
 * The factory's own order where every sheet carries a readable *Foglio N°*, and the PDF's where
 * one does not — the foglio is provenance, and a guess at it is no better than the page.
 */
function inFactoryOrder(sheets: IdentifiedSheet[]): IdentifiedSheet[] {
  const fogli = sheets.map((sheet) => numericPrefixOf(sheet.identity.foglio ?? ''));
  if (fogli.some((foglio) => foglio === null)) {
    return sheets;
  }
  return sheets
    .map((sheet, index) => ({ sheet, foglio: fogli[index] as number }))
    .sort((a, b) => a.foglio - b.foglio)
    .map(({ sheet }) => sheet);
}

async function writeTavola(
  directory: string,
  number: string,
  readingMethod: string,
  drawing: IdentifiedSheet | null,
  tables: IdentifiedSheet[],
  listings: ReadListing[],
): Promise<void> {
  await mkdir(directory, { recursive: true });

  const header = (drawing ?? tables[0])?.identity;
  const manifest: TavolaManifest = {
    number,
    titleIt: header?.titleIt?.trim() ?? '',
    titleEn: '',
    catalogSection: header?.sezione ?? null,
    catalogGroup: header?.gruppo ?? null,
    catalogSubgroup: header?.sottogruppo ?? null,
    readingMethod,
    scan: drawing ? SCAN_FILE : null,
    tableSheets: tables.map((sheet, index) => ({
      file: tableSheetFile(index + 1),
      page: sheet.page,
      foglio: sheet.identity.foglio,
    })),
  };

  if (drawing) {
    await writeFile(join(directory, SCAN_FILE), drawing.image);
  }
  for (const [index, sheet] of tables.entries()) {
    await writeFile(join(directory, tableSheetFile(index + 1)), sheet.image);
  }
  await writeJson(join(directory, TAVOLA_FILE), manifest);

  const c = LISTING_COLUMNS;
  await writeFile(
    join(directory, LISTINGS_FILE),
    writeSheet(
      Object.values(c),
      listings.map((listing) => ({
        [c.position]: listing.position,
        [c.drawn]: listing.drawn ? 'yes' : 'no',
        [c.catalogNumber]: listing.catalogNumber,
        [c.disegnoOrigine]: listing.disegnoOrigine,
        [c.quantity]: listing.quantity,
        [c.nameIt]: listing.nameIt,
        [c.catalogNote]: listing.catalogNote,
        [c.fitmentQualifier]: listing.fitmentQualifier,
        [c.tableSheet]: String(listing.tableSheet),
        [c.doubt]: listing.doubts.join('; '),
        [c.readingNote]: listing.notes.join('; '),
      })),
    ),
    'utf8',
  );
}

async function writeSetAside(
  out: string,
  sheets: { page: number; image: Buffer; reason: string }[],
): Promise<void> {
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

function pagesNamed(sheets: IdentifiedSheet[]): string {
  return `${sheets.length === 1 ? 'page' : 'pages'} ${sheets.map((sheet) => sheet.page).join(', ')}`;
}

/**
 * **The Club's scans never land in the repository** (`AGENTS.md`, ADR 0016), and a directory
 * already holding something is not one to read into: two runs in one place are one directory
 * nobody can say the provenance of.
 */
async function assertWritableOutside(out: string, repositoryRoot: string): Promise<void> {
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
  if (existsSync(out) && (await readdir(out)).length > 0) {
    throw new ReadCatalogError(`${out} already holds something. Give an empty or new directory.`);
  }
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
