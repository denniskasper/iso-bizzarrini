import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  PositionListingsResponse,
  SearchResponse,
  TavolaCheckingResponse,
  TavolaResponse,
} from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadReadTavole, type ReadTavola } from '../src/migration/load-read-tavola.js';
import { loadReading, type ReadingLoadReport } from '../src/migration/load-reading.js';
import { readCatalog } from '../src/reading/read-catalog.js';
import { createFileStore } from '../src/storage/file-store.js';
import {
  aDrawing,
  aRow,
  aTable,
  aTableSheet,
  fakePages,
  fakeReadingMethod,
  givenOutputDirectory,
  type InventedPage,
  type OutputDirectory,
} from './support/catalog-reading.js';
import {
  givenModel,
  givenPhotographImage,
  givenScanImage,
  givenTavola,
} from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Loading what the read command wrote, as Unchecked Tavole** (ADR 0017, issue #31).
 *
 * Read back over HTTP, as an Editor and as a Member, because "loaded as Unchecked" is a claim
 * about who can open what. The catalog is invented per test and read with a fake Reading method.
 */
describe('a machine-read catalog, loaded', () => {
  let app: TestApp;
  let editor: TestAgent;
  let member: TestAgent;
  const opened: OutputDirectory[] = [];

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app);
    editor = (await givenAMember(app, administrator.agent, { name: 'An Editor', role: 'editor' }))
      .agent;
    member = (await givenAMember(app, administrator.agent)).agent;
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  /** What a form sends: every field a plain string, blank meaning "not recorded". */
  const A_BLANK_PART = {
    nameEn: '',
    nameIt: '',
    catalogNumber: '',
    disegnoOrigine: '',
    description: '',
    dimensions: '',
    materialFinish: '',
    catalogNote: '',
    note: '',
  };

  const TAVOLA_84: InventedPage[] = [
    aDrawing('84', { titleIt: 'ASSALE POSTERIORE', sezione: '260', gruppo: '06' }),
    aTableSheet('84', [
      aTable([
        aRow('1', '208501', 'SCATOLA DIFFERENZIALE', { note: 'RIV 6006' }),
        aRow('-', '208900', 'VITE', { quantity: '6' }),
        aRow('2', '208502', 'SEMIASSE'),
      ]),
    ]),
  ];

  async function givenRead(pages: InventedPage[] = TAVOLA_84): Promise<string> {
    const out = await givenOutputDirectory();
    opened.push(out);
    await readCatalog({
      pdf: 'catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method: fakeReadingMethod(pages),
      pages: fakePages(pages),
      limit: 100,
      print: () => undefined,
    });
    return out.path;
  }

  function load(source: string, options: { dryRun?: boolean } = {}): Promise<ReadingLoadReport> {
    return loadReading({
      db: app.db,
      fileStore: createFileStore(app.filesPath),
      clock: app.clock,
      logger: app.logger,
      source,
      dryRun: options.dryRun ?? false,
    });
  }

  async function tavolaNumbered(agent: TestAgent, number: string) {
    const { models } = (await agent.get('/api/models').expect(200)).body;
    const rivolta = models.find((model: { name: string }) => model.name === 'Rivolta');
    if (!rivolta) {
      return undefined;
    }
    const { tavole } = (await agent.get(`/api/models/${rivolta.id}`).expect(200)).body;
    return tavole.find((tavola: { number: string }) => tavola.number === number) as
      { id: string; state: string; nameIt: string } | undefined;
  }

  async function listingsAt(tavolaId: string, number: string) {
    const drawing = (await editor.get(`/api/tavole/${tavolaId}`).expect(200))
      .body as TavolaResponse;
    const position = drawing.positions.find((candidate) => candidate.number === number);
    expect(position, `position ${number} was not loaded`).toBeDefined();
    return (
      (await editor.get(`/api/positions/${position?.id}/listings`).expect(200))
        .body as PositionListingsResponse
    ).listings;
  }

  /** The store is the test app's for the whole file, so what a test adds is counted, not totalled. */
  async function filesUnder(prefix: string): Promise<number> {
    return (await readdir(join(app.filesPath, prefix)).catch(() => [])).length;
  }

  async function search(agent: TestAgent, q: string): Promise<SearchResponse> {
    return (await agent.get('/api/search').query({ q }).expect(200)).body;
  }

  it('arrives as an Unchecked Tavola an Editor can open and a Member cannot', async () => {
    const report = await load(await givenRead());
    expect(report.rejected).toEqual([]);
    expect(report.tavole).toEqual([
      { number: '84', outcome: 'loaded', readingMethod: 'a fake Reading method', listings: 3 },
    ]);

    const tavola = await tavolaNumbered(editor, '84');
    expect(tavola).toMatchObject({ state: 'unchecked', nameIt: 'ASSALE POSTERIORE' });
    expect(await tavolaNumbered(member, '84')).toBeUndefined();
    await member.get(`/api/tavole/${tavola?.id}`).expect(404);

    const drawing = (await editor.get(`/api/tavole/${tavola?.id}`).expect(200))
      .body as TavolaResponse;
    expect(drawing.tavola.provenance).toEqual({ section: '260', group: '06', subgroup: null });
    expect(drawing.tavola.scan).not.toBeNull();
  });

  it('carries its Listings, drawn and undrawn, with their Catalog Notes', async () => {
    await load(await givenRead());
    const tavola = await tavolaNumbered(editor, '84');

    const atOne = await listingsAt(tavola?.id as string, '1');
    expect(
      atOne.map((listing) => ({
        catalogNumber: listing.part.catalogNumber,
        nameIt: listing.part.nameIt,
        catalogNote: listing.part.catalogNote,
        drawn: listing.drawn,
        quantityPerCar: listing.quantityPerCar,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          catalogNumber: '208501',
          nameIt: 'SCATOLA DIFFERENZIALE',
          catalogNote: 'RIV 6006',
          drawn: true,
          quantityPerCar: 1,
        },
        {
          catalogNumber: '208900',
          nameIt: 'VITE',
          catalogNote: null,
          drawn: false,
          quantityPerCar: 6,
        },
      ]),
    );
  });

  it('keeps every Table sheet, in the private store', async () => {
    const before = await filesUnder('table-sheets');
    const report = await load(await givenRead());

    expect(report.tableSheets).toBe(1);
    expect(await filesUnder('table-sheets')).toBe(before + 1);
  });

  it('gives a Part read under one Dal–Al heading a Fitment qualified by it', async () => {
    const ranges = ['Dal 1 Al 500', 'Dal 501 Al 1000'];
    await load(
      await givenRead([
        aTableSheet(
          '84',
          [
            aTable(
              [
                aRow('9', '', 'CERNIERA', {
                  numbers: [
                    { number: '208509', range: ranges[0] as string },
                    { number: '208510', range: ranges[1] as string },
                  ],
                }),
              ],
              { layout: 'ufficio-tecnico', ranges },
            ),
          ],
          { titleIt: 'PORTE' },
        ),
      ]),
    );
    const tavola = await tavolaNumbered(editor, '84');

    const atNine = await listingsAt(tavola?.id as string, '9');
    expect(
      atNine.map((listing) => [
        listing.part.catalogNumber,
        listing.part.fitments.map((fitment) => fitment.qualifier),
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['208509', ['Dal 1 Al 500']],
        ['208510', ['Dal 501 Al 1000']],
      ]),
    );
  });

  it('loads the Listings as an Editor corrected them in Excel', async () => {
    const source = await givenRead();
    const file = join(source, 'tavola-84', 'listings.csv');
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replace('208502', '208522').replace('SEMIASSE', 'SEMIASSE DESTRO'));

    await load(source);
    const tavola = await tavolaNumbered(editor, '84');

    const atTwo = await listingsAt(tavola?.id as string, '2');
    expect(atTwo.map((listing) => [listing.part.catalogNumber, listing.part.nameIt])).toEqual([
      ['208522', 'SEMIASSE DESTRO'],
    ]);
  });

  it('loads a CSV that Excel saved with semicolons', async () => {
    const source = await givenRead();
    const file = join(source, 'tavola-84', 'listings.csv');
    const text = await readFile(file, 'utf8');
    await writeFile(file, text.replaceAll(',', ';'));

    const report = await load(source);
    expect(report.tavole[0]?.listings).toBe(3);
  });

  it('discards an Unchecked Tavola and loads it again whole, with the Parts found nowhere else', async () => {
    await load(await givenRead());
    expect((await search(editor, '208502')).matches).toHaveLength(1);
    const scansBefore = await filesUnder('scans');
    const sheetsBefore = await filesUnder('table-sheets');

    const report = await load(
      await givenRead([
        aDrawing('84', { titleIt: 'ASSALE POSTERIORE' }),
        aTableSheet('84', [aTable([aRow('1', '208501', 'SCATOLA DIFFERENZIALE')])]),
      ]),
    );

    expect(report.tavole[0]).toMatchObject({ number: '84', outcome: 'replaced', listings: 1 });
    // All three went with it; the one read again is a new Part, recorded afresh.
    expect(report.partsDiscarded).toBe(3);
    expect((await search(editor, '208502')).matches).toEqual([]);
    expect((await search(editor, '208900')).matches).toEqual([]);

    const tavola = await tavolaNumbered(editor, '84');
    const drawing = (await editor.get(`/api/tavole/${tavola?.id}`).expect(200))
      .body as TavolaResponse;
    expect(drawing.positions.map((position) => position.number)).toEqual(['1']);
    expect(await filesUnder('scans')).toBe(scansBefore);
    expect(await filesUnder('table-sheets')).toBe(sheetsBefore);
  });

  it('removes the Photographs of a Part that goes with a discarded Tavola, files and all', async () => {
    await load(await givenRead());
    const [match] = (await search(editor, '208502')).matches;
    await editor
      .post(`/api/parts/${match?.part.id}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(201);
    expect(await filesUnder('photographs')).toBe(1);

    await load(await givenRead([aTableSheet('84', [aTable([])], { titleIt: 'ASSALE' })]));

    expect((await search(editor, '208502')).matches).toEqual([]);
    expect(await filesUnder('photographs')).toBe(0);
  });

  it('keeps a Part that is also listed on a Published Tavola when it discards one', async () => {
    const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const published = await givenTavola(app.db, grifo.id, { number: '2', nameEn: 'Front brakes' });
    const { positions } = (
      await editor.post(`/api/tavole/${published.id}/positions`).send({ number: '5' }).expect(201)
    ).body as { positions: { id: string }[] };
    await editor
      .post(`/api/tavole/${published.id}/listings`)
      .send({
        positionId: positions[0]?.id,
        quantityPerCar: 4,
        drawn: false,
        part: { ...A_BLANK_PART, catalogNumber: '208900', nameIt: 'VITE' },
      })
      .expect(201);

    await load(await givenRead());
    await load(await givenRead([aTableSheet('84', [aTable([])], { titleIt: 'ASSALE' })]));

    expect((await search(editor, '208900')).matches).toHaveLength(1);
    expect((await search(editor, '208501')).matches).toEqual([]);
  });

  it('refuses a Tavola that is Published, and leaves it as it is', async () => {
    await load(await givenRead());
    const tavola = await tavolaNumbered(editor, '84');
    await editor.post(`/api/tavole/${tavola?.id}/publication`).expect(200);

    const report = await load(
      await givenRead([
        aTableSheet('84', [aTable([aRow('1', '208777', 'ALTRO')])], { titleIt: 'X' }),
      ]),
    );

    expect(report.tavole).toEqual([
      expect.objectContaining({ number: '84', outcome: 'refused', listings: 0 }),
    ]);
    expect(report.rejected[0]?.reason).toMatch(/Published/);
    expect((await listingsAt(tavola?.id as string, '1')).map((l) => l.part.catalogNumber)).toEqual(
      expect.arrayContaining(['208501', '208900']),
    );
    expect((await search(editor, '208777')).matches).toEqual([]);
  });

  describe('with the Marks the drawing proposed', () => {
    const MARKED: InventedPage[] = [
      {
        ...TAVOLA_84[0],
        width: 1000,
        height: 800,
        numbers: [
          { text: '1', x: 200, y: 200 },
          { text: '57', x: 600, y: 400 },
        ],
      } as InventedPage,
      TAVOLA_84[1] as InventedPage,
    ];

    async function drawingOf(tavolaId: string): Promise<TavolaResponse> {
      return (await editor.get(`/api/tavole/${tavolaId}`).expect(200)).body as TavolaResponse;
    }

    it('puts each Mark on its Position, in fractions of the drawing', async () => {
      const report = await load(await givenRead(MARKED));
      expect(report.marks).toBe(2);

      const tavola = await tavolaNumbered(editor, '84');
      const { positions } = await drawingOf(tavola?.id as string);
      const one = positions.find((position) => position.number === '1');
      expect(one?.marks).toEqual([
        { id: expect.any(String), x: expect.closeTo(0.2, 2), y: expect.closeTo(0.266, 2) },
      ]);
      expect(positions.find((position) => position.number === '2')?.marks).toEqual([]);
    });

    it('makes a Mark listed in no row a Position with nothing listed at it', async () => {
      await load(await givenRead(MARKED));
      const tavola = await tavolaNumbered(editor, '84');

      const fiftySeven = (await drawingOf(tavola?.id as string)).positions.find(
        (position) => position.number === '57',
      );
      expect(fiftySeven?.marks).toHaveLength(1);
      const { listings } = (
        await editor.get(`/api/positions/${fiftySeven?.id}/listings`).expect(200)
      ).body as PositionListingsResponse;
      expect(listings).toEqual([]);
    });

    it('shows the Editor every Position with no Mark, and every Mark listed nowhere', async () => {
      await load(await givenRead(MARKED));
      const tavola = await tavolaNumbered(editor, '84');
      const { positions } = await drawingOf(tavola?.id as string);
      const { doubts } = (await editor.get(`/api/tavole/${tavola?.id}/checking`).expect(200))
        .body as TavolaCheckingResponse;

      const idOf = (number: string) => positions.find((position) => position.number === number)?.id;
      expect(doubts).toEqual(
        expect.arrayContaining([
          {
            id: expect.any(String),
            reason: 'Position 2 is in the table, and no Mark for it was found on the drawing.',
            listingId: null,
            positionId: idOf('2'),
          },
          {
            id: expect.any(String),
            reason: 'A Mark for 57 is on the drawing, and no row of the table has Position 57.',
            listingId: null,
            positionId: idOf('57'),
          },
        ]),
      );
      expect(doubts).toHaveLength(2);
    });

    it('loads the Marks as an Editor corrected them in Excel', async () => {
      const source = await givenRead(MARKED);
      const file = join(source, 'tavola-84', 'marks.csv');
      // Saved where the decimal separator is a comma, with the misread 57 taken to be the 2 it is.
      const text = (await readFile(file, 'utf8'))
        .split('\n')
        .map((line) =>
          line
            .replace(/(\d)\.(\d)/g, '$1|$2')
            .replaceAll(',', ';')
            .replaceAll('|', ','),
        )
        .map((line) => line.replace(/^57;/, '2;'))
        .join('\n');
      await writeFile(file, text);

      const report = await load(source);
      expect(report.rejected).toEqual([]);

      const tavola = await tavolaNumbered(editor, '84');
      const { positions } = await drawingOf(tavola?.id as string);
      expect(positions.find((position) => position.number === '2')?.marks).toEqual([
        { id: expect.any(String), x: expect.closeTo(0.6, 1), y: expect.closeTo(0.5, 1) },
      ]);
    });

    it('refuses a Mark outside the drawing, and says where it is', async () => {
      const source = await givenRead(MARKED);
      const file = join(source, 'tavola-84', 'marks.csv');
      await writeFile(file, (await readFile(file, 'utf8')).replace(/^1,0\.\d+/m, '1,1.5'));

      const report = await load(source);

      expect(report.marks).toBe(1);
      expect(report.rejected).toEqual([
        expect.objectContaining({
          file: join('tavola-84', 'marks.csv'),
          line: 2,
          reason: expect.stringContaining('fractions of the drawing'),
        }),
      ]);
    });

    it('never puts one on a Tavola that is Published', async () => {
      await load(await givenRead());
      const tavola = await tavolaNumbered(editor, '84');
      await editor.post(`/api/tavole/${tavola?.id}/publication`).expect(200);

      const report = await load(await givenRead(MARKED));

      expect(report.marks).toBe(0);
      const { positions } = await drawingOf(tavola?.id as string);
      expect(positions.flatMap((position) => position.marks)).toEqual([]);
    });
  });

  it('writes nothing on a dry run', async () => {
    const report = await load(await givenRead(), { dryRun: true });

    expect(report.tavole[0]).toMatchObject({ outcome: 'loaded', listings: 3 });
    expect(await tavolaNumbered(editor, '84')).toBeUndefined();
  });

  describe('held in memory, with no directory', () => {
    const A_ROW = {
      drawn: '',
      disegnoOrigine: '',
      quantity: '',
      nameEn: '',
      catalogNote: '',
      catalogNoteEn: '',
      fitmentQualifier: '',
      tableSheet: '1',
      doubt: '',
      readingNote: '',
    };

    async function aReadTavola(): Promise<ReadTavola> {
      const scan = await givenScanImage();
      const sheet = await givenScanImage({ width: 800, height: 1200 });
      return {
        number: '12',
        titleIt: 'FRENO ANTERIORE',
        titleEn: 'FRONT BRAKE',
        catalogSection: '300',
        catalogGroup: '04',
        catalogSubgroup: null,
        readingMethod: 'a Reading method in memory',
        machineTranslations: [{ italian: 'FRENO ANTERIORE', english: 'FRONT BRAKE' }],
        scan: () => Promise.resolve(scan),
        tableSheets: [() => Promise.resolve(sheet)],
        listings: [
          { ...A_ROW, position: '1', catalogNumber: '310001', nameIt: 'PINZA FRENO' },
          {
            ...A_ROW,
            position: '1',
            drawn: 'no',
            catalogNumber: '310900',
            nameIt: 'VITE',
            quantity: '4',
            readingNote: 'One Reading hesitated over the quantity.',
          },
          {
            ...A_ROW,
            position: '2',
            catalogNumber: '310002',
            nameIt: 'DISCO',
            doubt: 'The two Readings disagree on the Catalog Number.',
          },
        ],
        marks: [
          { position: '1', x: '0.25', y: '0.5' },
          { position: '2', x: '0.75', y: '0.5' },
        ],
        positionDoubts: [{ position: '2', doubt: 'Its Mark was hard to read.' }],
      };
    }

    it('arrives as an Unchecked Tavola an Editor checks over HTTP, and a Member cannot open', async () => {
      const report = await loadReadTavole({
        db: app.db,
        fileStore: createFileStore(app.filesPath),
        clock: app.clock,
        logger: app.logger,
        reading: 'a Catalog run',
        model: { brand: 'Iso', name: 'Rivolta' },
        tavole: [await aReadTavola()],
      });
      expect(report.rejected).toEqual([]);
      expect(report).toMatchObject({ scans: 1, tableSheets: 1, marks: 2 });
      expect(report.tavole).toEqual([
        {
          number: '12',
          outcome: 'loaded',
          readingMethod: 'a Reading method in memory',
          listings: 3,
        },
      ]);

      const tavola = await tavolaNumbered(editor, '12');
      expect(tavola).toMatchObject({ state: 'unchecked', nameIt: 'FRENO ANTERIORE' });
      expect(await tavolaNumbered(member, '12')).toBeUndefined();
      await member.get(`/api/tavole/${tavola?.id}`).expect(404);

      const drawing = (await editor.get(`/api/tavole/${tavola?.id}`).expect(200))
        .body as TavolaResponse;
      expect(drawing.tavola.scan).not.toBeNull();
      expect(drawing.positions.flatMap((position) => position.marks)).toHaveLength(2);

      const checking = (await editor.get(`/api/tavole/${tavola?.id}/checking`).expect(200))
        .body as TavolaCheckingResponse;
      expect(checking.readingMethod).toBe('a Reading method in memory');
      expect(
        checking.listings.map((listing) => ({
          catalogNumber: listing.part.catalogNumber,
          drawn: listing.drawn,
          quantityPerCar: listing.quantityPerCar,
          tableSheet: listing.tableSheet,
          readingNote: listing.readingNote,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            catalogNumber: '310001',
            drawn: true,
            quantityPerCar: null,
            tableSheet: 1,
            readingNote: null,
          },
          {
            catalogNumber: '310900',
            drawn: false,
            quantityPerCar: 4,
            tableSheet: 1,
            readingNote: 'One Reading hesitated over the quantity.',
          },
        ]),
      );
      expect(checking.doubts.map((doubt) => doubt.reason).sort()).toEqual([
        'Its Mark was hard to read.',
        'The two Readings disagree on the Catalog Number.',
      ]);
    });

    it('replaces an Unchecked copy whole, and refuses a Published one', async () => {
      const options = {
        db: app.db,
        fileStore: createFileStore(app.filesPath),
        clock: app.clock,
        logger: app.logger,
        reading: 'a Catalog run',
        model: { brand: 'Iso', name: 'Rivolta' },
        tavole: [await aReadTavola()],
      };
      await loadReadTavole(options);
      const again = await loadReadTavole(options);
      expect(again.tavole[0]).toMatchObject({ outcome: 'replaced', listings: 3 });

      const tavola = await tavolaNumbered(editor, '12');
      await editor.post(`/api/tavole/${tavola?.id}/publication`).expect(200);
      const refused = await loadReadTavole(options);
      expect(refused.tavole[0]).toMatchObject({ outcome: 'refused' });
      expect(refused.rejected[0]).toMatchObject({ file: 'Tavola 12', at: 'tavola 12' });
    });
  });
});
