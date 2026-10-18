import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCatalogInto } from '../src/reading/catalog-reading.js';
import { readCatalog } from '../src/reading/read-catalog.js';
import { readSheet } from '../src/sheets/csv.js';
import {
  aDrawing,
  aRow,
  aTable,
  aTableSheet,
  fakePages,
  fakeReadingMethod,
  givenOutputDirectory,
  memoryStore,
  type FakeMethodOptions,
  type InventedPage,
  type MemoryStore,
  type OutputDirectory,
} from './support/catalog-reading.js';

/**
 * **The reading, wherever its progress is kept** (issue #53).
 *
 * The same invented catalog is read twice: once through the read command, which keeps it in a
 * directory, and once straight into a store held in memory, as the database will keep a Catalog
 * run. What is asserted is that both are told the same Tavole, doubts and costs.
 */
describe('reading into a store', () => {
  const opened: OutputDirectory[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  const catalog: InventedPage[] = [
    {
      ...aDrawing('84'),
      width: 1000,
      height: 800,
      numbers: [
        { text: '7', x: 200, y: 100 },
        { text: '12', x: 600, y: 300, unsure: true },
      ],
    },
    aTableSheet('84', [
      aTable([
        aRow('7', '208507', 'VITE'),
        aRow('12', '208512', 'STAFFA', { note: 'DAL TELAIO 101' }),
        aRow('15', '208515', 'DADO'),
      ]),
      aTable([
        aRow('7', '208507', 'VITE'),
        aRow('12', '208512', 'STAFFA', { note: 'DAL TELAIO 101' }),
        aRow('15', '208516', 'DADO'),
      ]),
    ]),
    { identity: { kind: 'table', tavola: null } },
    aTableSheet('85', [aTable([aRow('1', '208601', 'ROSETTA')])]),
  ];

  async function throughTheCommand(pages: InventedPage[], options: FakeMethodOptions = {}) {
    const out = await givenOutputDirectory();
    opened.push(out);
    const method = fakeReadingMethod(pages, options);
    const result = await readCatalog({
      pdf: '/somewhere/catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method,
      pages: fakePages(pages),
      limit: 100,
      print: () => undefined,
    });
    return { out: out.path, result, calls: method.calls };
  }

  async function intoMemory(
    pages: InventedPage[],
    store: MemoryStore = memoryStore(),
    options: FakeMethodOptions = {},
  ) {
    const method = fakeReadingMethod(pages, options);
    const result = await readCatalogInto({
      method,
      pages: fakePages(pages)('catalog.pdf'),
      limit: 100,
      store,
      print: () => undefined,
    });
    return { store, result, calls: method.calls };
  }

  async function csv(out: string, file: string) {
    const sheet = readSheet(file, await readFile(join(out, file), 'utf8'));
    return sheet.rows.map((row) =>
      Object.fromEntries(sheet.columns.map((column) => [column, row.get(column)])),
    );
  }

  const json = async (out: string, file: string) =>
    JSON.parse(await readFile(join(out, file), 'utf8'));

  it('is told the same Tavole, Listings, Marks and doubts as the directory holds', async () => {
    const command = await throughTheCommand(catalog);
    const { store, result } = await intoMemory(catalog);

    expect(store.readingMethod).toBe('a fake Reading method');
    expect(store.tavole.map((tavola) => tavola.number)).toEqual(['84', '85']);
    expect(result.tavole).toEqual(
      command.result.tavole.map(({ directory: _directory, ...tavola }) => tavola),
    );

    const [eightyFour] = store.tavole;
    const manifest = await json(command.out, 'tavola-84/tavola.json');
    expect({
      number: eightyFour?.number,
      titleIt: eightyFour?.titleIt,
      titleEn: eightyFour?.titleEn,
      readingMethod: eightyFour?.readingMethod,
      machineTranslations: eightyFour?.machineTranslations,
      tableSheets: eightyFour?.tableSheets.map(({ page, foglio }) => ({ page, foglio })),
    }).toEqual({
      number: manifest.number,
      titleIt: manifest.titleIt,
      titleEn: manifest.titleEn,
      readingMethod: manifest.readingMethod,
      machineTranslations: manifest.machineTranslations,
      tableSheets: manifest.tableSheets.map(({ page, foglio }: { page: number; foglio: null }) => ({
        page,
        foglio,
      })),
    });
    expect(eightyFour?.scan?.image).toEqual(
      await readFile(join(command.out, 'tavola-84/scan.png')),
    );
    expect(eightyFour?.tableSheets[0]?.image).toEqual(
      await readFile(join(command.out, 'tavola-84/table-1.png')),
    );

    const listings = await csv(command.out, 'tavola-84/listings.csv');
    expect(
      eightyFour?.listings.map((listing) => ({
        Position: listing.position,
        'Catalog Number': listing.catalogNumber,
        'Name (English)': listing.nameEn,
        'Catalog Note (English)': listing.catalogNoteEn,
        Doubt: listing.doubts.join('; '),
        'Reading note': listing.notes.join('; '),
      })),
    ).toEqual(
      listings.map((row) => ({
        Position: row.Position,
        'Catalog Number': row['Catalog Number'],
        'Name (English)': row['Name (English)'],
        'Catalog Note (English)': row['Catalog Note (English)'],
        Doubt: row.Doubt,
        'Reading note': row['Reading note'],
      })),
    );
    expect(listings.some((row) => row.Doubt !== '')).toBe(true);

    const marks = await csv(command.out, 'tavola-84/marks.csv');
    expect(marks.map((row) => row.Position)).toEqual(['7', '12']);
    expect(
      eightyFour?.marks.map((mark) => ({
        Position: mark.position,
        X: mark.x.toFixed(4),
        Y: mark.y.toFixed(4),
        unsure: mark.unsure,
      })),
    ).toEqual(
      marks.map((row) => ({
        Position: row.Position,
        X: row.X,
        Y: row.Y,
        unsure: row['Reading note'] !== '',
      })),
    );

    const doubts = await csv(command.out, 'tavola-84/doubts.csv');
    expect(doubts.map((row) => row.Position)).toEqual(['15']);
    expect(
      eightyFour?.doubts.map((doubt) => ({ Position: doubt.position, Doubt: doubt.reason })),
    ).toEqual(doubts);
  });

  it('is told the same pages, set-aside pages and costs as the directory holds', async () => {
    const command = await throughTheCommand(catalog);
    const { store, result } = await intoMemory(catalog);

    expect({ pages: store.pages }).toEqual(await json(command.out, 'pages.json'));
    expect(store.setAside.map(({ page, reason }) => ({ page, reason }))).toEqual(
      command.result.setAside,
    );
    expect(store.setAside[0]?.image).toEqual(
      await readFile(join(command.out, 'set-aside/page-3.png')),
    );

    const record = await json(command.out, 'cost.json');
    expect(store.costs.at(-1)).toEqual(record);
    expect(result.cost).toEqual(record);
    expect(record.total).toBeGreaterThan(0);
    expect(record.tavole.map((tavola: { number: string }) => tavola.number)).toEqual(['84', '85']);
    // Once after each Tavola, and once at the end.
    expect(store.costs).toHaveLength(3);
    expect(store.stopped).toBeNull();
  });

  it('is told that the run stopped and why, and carries on from what it was told', async () => {
    const twoTavole = [
      aDrawing('84'),
      aTableSheet('84', [aTable([aRow('1', '208501', 'VITE')])]),
      aDrawing('85'),
      aTableSheet('85', [aTable([aRow('1', '208601', 'VITE')])]),
    ];
    // Four pages asked about, Tavola 84 read twice, and then the plan will read no more.
    const first = await intoMemory(twoTavole, memoryStore(), {
      charged: false,
      usageLimitAfter: 6,
    });

    expect(first.store.stopped).toBe('usage-limit');
    expect(first.store.tavole.map((tavola) => tavola.number)).toEqual(['84']);
    expect(first.result.notRead).toEqual(['85']);

    const second = await intoMemory(twoTavole, memoryStore(first.store.carriedOn()));

    expect(second.calls).toEqual(['read 4 1', 'read 4 2']);
    expect(second.result.readBefore).toEqual(['84']);
    expect(second.store.tavole.map((tavola) => tavola.number)).toEqual(['85']);
    expect(second.store.costs.at(-1)).toMatchObject({ run: 2, stopped: null });
  });
});
