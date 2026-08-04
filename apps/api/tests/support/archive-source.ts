import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The club's material, as the migration is handed it: a directory holding the plan, the sheets
 * exported from the spreadsheets, and the scans.
 *
 * **Everything here is invented**, and the sheets are written out as text rather than committed
 * as files, for the same reason the practice archive is drawn in SVG: the archive is the Club's
 * and `AGENTS.md` keeps its material out of this repository. What the loader needs from a
 * fixture is a directory shaped exactly like the real one, which this is.
 */
export interface ArchiveSource {
  directory: string;
  remove(): Promise<void>;
}

export interface ArchiveSourceFiles {
  /** The plan, as JSON. Anything but an object is written verbatim, so a test can break it. */
  plan?: unknown;
  tavole?: string;
  parts?: string;
  /** Scan files, keyed by the name the Tavole sheet gives them. */
  scans?: Record<string, Buffer>;
}

/** What settles the catalog's first and last column, and the migration will not run without it. */
export const CONFIRMED_AGAINST =
  'Uncropped photograph of page 41 of the Grifo catalog, taken by the club archivist on ' +
  '2026-07-14: the first column is the catalog number and the last is the disegno origine.';

export function defaultArchivePlan(): Record<string, unknown> {
  return {
    catalogColumns: {
      confirmedAgainst: CONFIRMED_AGAINST,
      catalogNumber: 'Codice',
      disegnoOrigine: 'Dis. Origine',
    },
    models: [
      {
        key: 'grifo',
        brand: 'Iso',
        name: 'Grifo',
        series: 'GL 365',
        modelYears: '1965–68',
        fitmentColumn: 'Grifo',
      },
      {
        key: 'rivolta',
        brand: 'Iso',
        name: 'Rivolta IR 300',
        fitmentColumn: 'Rivolta',
      },
    ],
    tavole: {
      file: 'tavole.csv',
      columns: {
        model: 'Model',
        number: 'Tavola',
        nameIt: 'Denominazione',
        nameEn: 'Name',
        category: 'Category',
        catalogSection: 'Sezione',
        catalogGroup: 'Gruppo',
        catalogSubgroup: 'Sottogruppo',
        scan: 'Scan',
      },
    },
    parts: {
      file: 'parts.csv',
      columns: {
        model: 'Model',
        tavola: 'Tavola',
        position: 'Pos.',
        nameIt: 'Denominazione',
        nameEn: 'Name',
        quantityPerCar: 'Q.tà',
        drawn: 'Drawn',
        description: 'Description',
        dimensions: 'Dimensions',
        materialFinish: 'Material',
        catalogNote: 'Catalog note',
        note: 'Note',
        relatedPositions: 'Related Parts',
        subAssembly: 'Sub-Assembly',
        subAssemblyPositions: 'Sub-Assembly Positions',
      },
      equivalents: [
        { column: 'Girling', kind: 'oe-supplier', maker: 'Girling' },
        { column: 'OEM no.', kind: 'oem', maker: 'Fiat' },
        { column: 'Donor car', kind: 'donor-vehicle', cell: 'maker' },
      ],
      sources: [
        {
          name: 'Ricambi Storici',
          urlColumn: 'Shop link',
          priceColumn: 'Shop price',
          currency: 'EUR',
          observedOnColumn: 'Shop seen',
          conditionColumn: 'Shop condition',
        },
      ],
    },
    scans: { directory: 'scans' },
  };
}

const TAVOLE_HEADER = 'Model,Tavola,Denominazione,Name,Category,Sezione,Gruppo,Sottogruppo,Scan';

export const DEFAULT_TAVOLE_SHEET = [
  TAVOLE_HEADER,
  'grifo,2,Impianto frenante anteriore,Front brake system,Brakes,260,03,150,grifo-02.png',
  'grifo,12 bis,Alzacristallo porta,Door window winder,Body,260,03,151,',
].join('\n');

/** The columns a club spreadsheet of this shape has. Written once: the header and the type. */
const PARTS_COLUMNS = [
  'Model',
  'Tavola',
  'Pos.',
  'Codice',
  'Denominazione',
  'Name',
  'Q.tà',
  'Dis. Origine',
  'Drawn',
  'Description',
  'Dimensions',
  'Material',
  'Catalog note',
  'Note',
  'Grifo',
  'Rivolta',
  'Girling',
  'OEM no.',
  'Donor car',
  'Related Parts',
  'Sub-Assembly',
  'Sub-Assembly Positions',
  'Shop link',
  'Shop price',
  'Shop currency',
  'Shop seen',
  'Shop condition',
] as const;

export type PartsColumn = (typeof PARTS_COLUMNS)[number];

/**
 * One row per line. A test writes the sheet it needs by naming the columns it cares about — the
 * rest stay blank, which is what most of a real row is.
 */
export type PartsRow = Partial<Record<PartsColumn, string>>;

export function partsSheet(...rows: PartsRow[]): string {
  return [
    PARTS_COLUMNS.join(','),
    ...rows.map((row) => PARTS_COLUMNS.map((column) => quote(row[column] ?? '')).join(',')),
  ].join('\n');
}

function quote(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The rows the catalog page in the spec prints, as a sheet. */
export const DEFAULT_PARTS_SHEET = partsSheet(
  {
    Model: 'grifo',
    Tavola: '2',
    'Pos.': '207',
    Codice: '260 03 150',
    Denominazione: 'ASTA GUIDA PER CRISTALLO MONTANTE',
    Name: 'Window guide rod',
    'Q.tà': '2',
    'Dis. Origine': '208503',
    Grifo: 'fino al telaio 310',
    Rivolta: 'x',
  },
  {
    Model: 'grifo',
    Tavola: '2',
    'Pos.': '208',
    Codice: '260 03 151',
    Denominazione: 'VITE FISSAGGIO',
    Name: 'Mounting screw',
    'Q.tà': '4',
    Drawn: 'no',
  },
);

export async function givenArchiveSource(files: ArchiveSourceFiles = {}): Promise<ArchiveSource> {
  const directory = await mkdtemp(join(tmpdir(), 'ricambi-archive-'));

  const plan = files.plan ?? defaultArchivePlan();
  await writeFile(
    join(directory, 'plan.json'),
    typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2),
    'utf8',
  );
  await writeFile(join(directory, 'tavole.csv'), files.tavole ?? DEFAULT_TAVOLE_SHEET, 'utf8');
  await writeFile(join(directory, 'parts.csv'), files.parts ?? DEFAULT_PARTS_SHEET, 'utf8');

  if (files.scans) {
    await mkdir(join(directory, 'scans'), { recursive: true });
    for (const [name, contents] of Object.entries(files.scans)) {
      await writeFile(join(directory, 'scans', name), contents);
    }
  }

  return {
    directory,
    remove: () => rm(directory, { recursive: true, force: true }),
  };
}
