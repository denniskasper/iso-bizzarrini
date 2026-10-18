import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
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
  type InventedPage,
  type OutputDirectory,
} from './support/catalog-reading.js';

/**
 * **Reading a scanned catalog into files** (ADR 0017, issue #31).
 *
 * The command is run against a fake Reading method and an invented PDF, and what is asserted is
 * what the operator and the Editor can see: the directory it writes, and what it prints.
 */
describe('reading a scanned catalog', () => {
  const opened: OutputDirectory[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  async function read(pages: InventedPage[]) {
    const out = await givenOutputDirectory();
    opened.push(out);
    const printed: string[] = [];
    const method = fakeReadingMethod(pages);
    const result = await readCatalog({
      pdf: '/somewhere/catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method,
      pages: fakePages(pages),
      limit: 100,
      print: (line) => printed.push(line),
    });
    return { out: out.path, printed: printed.join('\n'), result, method };
  }

  async function listingsOf(out: string, tavola: string) {
    const text = await readFile(join(out, `tavola-${tavola}`, 'listings.csv'), 'utf8');
    return readSheet('listings.csv', text).rows.map((row) => ({
      position: row.get('Position'),
      drawn: row.get('Drawn'),
      catalogNumber: row.get('Catalog Number'),
      disegnoOrigine: row.get('Disegno Origine'),
      quantity: row.get('Quantity'),
      nameIt: row.get('Denominazione'),
      catalogNote: row.get('Catalog Note'),
      fitmentQualifier: row.get('Fitment qualifier'),
      doubt: row.get('Doubt'),
      readingNote: row.get('Reading note'),
    }));
  }

  async function manifestOf(out: string, tavola: string) {
    return JSON.parse(await readFile(join(out, `tavola-${tavola}`, 'tavola.json'), 'utf8'));
  }

  describe('which Tavola a sheet belongs to', () => {
    it('is the one printed on it, never the page it follows', async () => {
      const { out, result } = await read([
        aDrawing('84'),
        aTableSheet('51', [aTable([aRow('1', '208503', 'STAFFA')])]),
        aTableSheet('84', [aTable([aRow('1', '208611', 'ROSETTA')])]),
        aDrawing('51'),
      ]);

      expect(result.tavole.map((tavola) => tavola.number)).toEqual(['84', '51']);
      expect((await manifestOf(out, '84')).tableSheets).toEqual([
        { file: 'table-1.png', page: 3, foglio: null },
      ]);
      expect((await manifestOf(out, '51')).tableSheets).toEqual([
        { file: 'table-1.png', page: 2, foglio: null },
      ]);
      expect((await listingsOf(out, '51')).map((row) => row.nameIt)).toEqual(['STAFFA']);
      expect((await listingsOf(out, '84')).map((row) => row.nameIt)).toEqual(['ROSETTA']);
    });

    it('sets aside a sheet whose number cannot be read, and says so', async () => {
      const { out, printed, result } = await read([
        aDrawing('84'),
        { identity: { kind: 'table', tavola: null } },
      ]);

      expect(result.setAside).toEqual([
        { page: 2, reason: 'Its Tavola number could not be read.' },
      ]);
      expect(printed).toContain('Set aside: page 2. Its Tavola number could not be read.');
      const setAside = readSheet(
        'set-aside.csv',
        await readFile(join(out, 'set-aside.csv'), 'utf8'),
      );
      expect(setAside.rows.map((row) => row.get('Page'))).toEqual(['2']);
      await expect(readFile(join(out, 'set-aside', 'page-2.png'))).resolves.toBeInstanceOf(Buffer);
      expect((await manifestOf(out, '84')).tableSheets).toEqual([]);
    });

    it('orders a Tavola’s Table sheets by the foglio printed on them', async () => {
      const { out } = await read([
        aTableSheet('84', [aTable([aRow('5', '208505', 'DADO')])], { foglio: '3/8' }),
        aTableSheet('84', [aTable([aRow('1', '208501', 'VITE')])], { foglio: '2/8' }),
      ]);

      expect((await listingsOf(out, '84')).map((row) => row.position)).toEqual(['1', '5']);
    });
  });

  it('turns the drawing upright the way its headings read, and each Table sheet too', async () => {
    const { out } = await read([
      { ...aDrawing('84', { turn: 90 }), width: 300, height: 200 },
      { ...aTableSheet('84', [aTable([])], { turn: 270 }), width: 300, height: 200 },
    ]);

    const scan = await sharp(join(out, 'tavola-84', 'scan.png')).metadata();
    const table = await sharp(join(out, 'tavola-84', 'table-1.png')).metadata();
    expect([scan.width, scan.height]).toEqual([200, 300]);
    expect([table.width, table.height]).toEqual([200, 300]);
  });

  describe('positions, as the factory meant them', () => {
    it('on the catalogue layout, a dash is an undrawn Part at the Position above', async () => {
      const { out } = await read([
        aTableSheet('84', [
          aTable([aRow('12', '208512', 'STAFFA'), aRow('-', '208900', 'VITE', { quantity: '4' })]),
        ]),
      ]);

      expect(await listingsOf(out, '84')).toMatchObject([
        { position: '12', drawn: 'yes', catalogNumber: '208512' },
        { position: '12', drawn: 'no', catalogNumber: '208900', quantity: '4' },
      ]);
    });

    it('a repeated position number is drawn alternatives', async () => {
      const { out } = await read([
        aTableSheet('84', [
          aTable([aRow('7', '208507', 'MOLLA'), aRow('7', '208508', 'MOLLA RINFORZATA')]),
        ]),
      ]);

      expect(await listingsOf(out, '84')).toMatchObject([
        { position: '7', drawn: 'yes', catalogNumber: '208507' },
        { position: '7', drawn: 'yes', catalogNumber: '208508' },
      ]);
    });

    it('a range lists the Part once at each Position in it', async () => {
      const { out } = await read([
        aTableSheet('84', [aTable([aRow('16-17', '208516', 'BOCCOLA')])]),
      ]);

      expect(await listingsOf(out, '84')).toMatchObject([
        { position: '16', catalogNumber: '208516' },
        { position: '17', catalogNumber: '208516' },
      ]);
    });

    it('a dash at the top of a Table sheet is the last Position of the sheet before', async () => {
      const { out } = await read([
        aTableSheet('84', [aTable([aRow('30', '208530', 'TUBO')])]),
        aTableSheet('84', [aTable([aRow('-', '208901', 'FASCETTA')])]),
      ]);

      expect((await listingsOf(out, '84'))[1]).toMatchObject({ position: '30', drawn: 'no' });
    });

    it('a number printed on the catalogue form with nothing beside it is the form', async () => {
      const { out } = await read([
        aTableSheet('84', [aTable([aRow('1', '208501', 'VITE'), aRow('2', '', '')])]),
      ]);

      expect((await listingsOf(out, '84')).map((row) => row.position)).toEqual(['1']);
    });

    describe('on the Ufficio Tecnico layout', () => {
      const ranges = ['Dal 1 Al 500', 'Dal 501 Al 1000'];
      const utRow = (position: string, numbers: [string, string], nameIt: string) =>
        aRow(position, '', nameIt, {
          disegnoOrigine: '260 06 110',
          numbers: numbers.map((number, index) => ({ number, range: ranges[index] as string })),
        });

      it('a dash is a drawn Part of the other hand at the Position above', async () => {
        const { out } = await read([
          aTableSheet('84', [
            aTable(
              [
                utRow('3', ['208503', '208503'], 'MANIGLIA DESTRA'),
                utRow('-', ['208504', '208504'], 'MANIGLIA SINISTRA'),
              ],
              { layout: 'ufficio-tecnico', ranges },
            ),
          ]),
        ]);

        expect(await listingsOf(out, '84')).toMatchObject([
          { position: '3', drawn: 'yes', catalogNumber: '208503', fitmentQualifier: '' },
          { position: '3', drawn: 'yes', catalogNumber: '208504', disegnoOrigine: '260 06 110' },
        ]);
      });

      it('different numbers under the Dal–Al columns are separate Parts, each qualified by its heading', async () => {
        const { out } = await read([
          aTableSheet('84', [
            aTable([utRow('9', ['208509', '208509/01/D'], 'CERNIERA')], {
              layout: 'ufficio-tecnico',
              ranges,
            }),
          ]),
        ]);

        expect(await listingsOf(out, '84')).toMatchObject([
          { position: '9', catalogNumber: '208509', fitmentQualifier: 'Dal 1 Al 500', doubt: '' },
          {
            position: '9',
            catalogNumber: '208509/01/D',
            fitmentQualifier: 'Dal 501 Al 1000',
            doubt: '',
          },
        ]);
      });
    });
  });

  describe('two Readings of every Table sheet', () => {
    it('are two independent requests', async () => {
      const { method } = await read([aTableSheet('84', [aTable([])])]);
      expect(method.calls).toEqual(['identify 1', 'read 1 1', 'read 1 2']);
    });

    it('put a row in doubt where they differ on its Catalog Number, Position or quantity', async () => {
      const { out, printed } = await read([
        aTableSheet('84', [
          aTable([
            aRow('1', '208501', 'VITE'),
            aRow('2', '208502', 'DADO'),
            aRow('3', '208503', 'ROSETTA', { quantity: '2' }),
          ]),
          aTable([
            aRow('1', '208507', 'VITE'),
            aRow('2', '208502', 'DADO'),
            aRow('3', '208503', 'ROSETTA', { quantity: '3' }),
          ]),
        ]),
      ]);

      expect((await listingsOf(out, '84')).map((row) => row.doubt)).toEqual([
        'The Catalog Number: the other Reading has “208507”',
        '',
        'The quantity: the other Reading has “3”',
      ]);
      expect(printed).toContain('Table sheet 1, page 1: 3 rows, 2 in doubt');
    });

    it('do not raise a doubt over a name spelt differently', async () => {
      const { out } = await read([
        aTableSheet('84', [
          aTable([aRow('1', '208501', 'VITE TESTA ESAGONALE')]),
          aTable([aRow('1', '208501', 'VITE TESTA ESAG.')]),
        ]),
      ]);

      expect((await listingsOf(out, '84'))[0]?.doubt).toBe('');
    });

    it('keep a hesitation the other Reading agrees with as a note, not a doubt', async () => {
      const { out } = await read([
        aTableSheet('84', [
          aTable([aRow('1', '208501', 'VITE', { unsure: ['numbers'] })]),
          aTable([aRow('1', '208501', 'VITE')]),
        ]),
      ]);

      expect((await listingsOf(out, '84'))[0]).toMatchObject({
        doubt: '',
        readingNote: 'One Reading hesitated over the Catalog Number; the other read the same',
      });
    });

    it('raise a doubt over a Catalog Number not shaped like one, even where both agree', async () => {
      const { out } = await read([
        aTableSheet('84', [
          aTable([aRow('1', '2O85O1', 'VITE'), aRow('2', '208505/01/D', 'DADO')]),
        ]),
      ]);

      expect((await listingsOf(out, '84')).map((row) => row.doubt)).toEqual([
        '“2O85O1” is not shaped like a Catalog Number',
        '',
      ]);
    });

    it('line up around a row only one of them saw', async () => {
      const { out } = await read([
        aTableSheet('84', [
          aTable([
            aRow('1', '208501', 'VITE'),
            aRow('2', '208502', 'DADO'),
            aRow('3', '208503', 'MOLLA'),
          ]),
          aTable([aRow('1', '208501', 'VITE'), aRow('3', '208503', 'MOLLA')]),
        ]),
      ]);

      expect((await listingsOf(out, '84')).map((row) => [row.position, row.doubt])).toEqual([
        ['1', ''],
        ['2', 'Only one of the two Readings has this row'],
        ['3', ''],
      ]);
    });
  });

  it('writes the Listings as a CSV Excel opens, one row per Listing, the Italian verbatim', async () => {
    const { out } = await read([
      aTableSheet('84', [
        aTable([
          aRow('4', '208504', 'CUSCINETTO A SFERE Ø 30', { note: 'RIV 6006; vedi tav. 85' }),
        ]),
      ]),
    ]);

    const bytes = await readFile(join(out, 'tavola-84', 'listings.csv'));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(await listingsOf(out, '84')).toEqual([
      {
        position: '4',
        drawn: 'yes',
        catalogNumber: '208504',
        disegnoOrigine: '',
        quantity: '1',
        nameIt: 'CUSCINETTO A SFERE Ø 30',
        catalogNote: 'RIV 6006; vedi tav. 85',
        fitmentQualifier: '',
        doubt: '',
        readingNote: '',
      },
    ]);
  });

  it('records the Reading method, the Model and the factory’s header', async () => {
    const { out } = await read([
      aDrawing('84', {
        titleIt: 'ASSALE POSTERIORE',
        sezione: '260',
        gruppo: '06',
        sottogruppo: '110',
      }),
    ]);

    expect(JSON.parse(await readFile(join(out, 'reading.json'), 'utf8'))).toEqual({
      model: { brand: 'Iso', name: 'Rivolta' },
      readingMethod: 'a fake Reading method',
      readFrom: 'catalog.pdf',
      tavole: ['tavola-84'],
    });
    expect(await manifestOf(out, '84')).toMatchObject({
      number: '84',
      titleIt: 'ASSALE POSTERIORE',
      titleEn: '[en] ASSALE POSTERIORE',
      catalogSection: '260',
      catalogGroup: '06',
      catalogSubgroup: '110',
      readingMethod: 'a fake Reading method',
      scan: 'scan.png',
    });
  });

  it('prints what it read as it goes, and the tokens it used', async () => {
    const { printed } = await read([
      aDrawing('84'),
      aTableSheet('84', [
        aTable([aRow('1', '208501', 'VITE'), aRow('16-17', '208516', 'BOCCOLA')]),
      ]),
    ]);

    expect(printed).toContain('Tavola 84: drawing on page 1, 1 Table sheet (page 2)');
    expect(printed).toContain('  3 Listings, 0 in doubt');
    // Two pages identified, one Table sheet read twice: four calls at 5,000 in and 1,000 out.
    expect(printed).toContain('Read by a fake Reading method: 20,000 tokens in, 4,000 out.');
  });

  describe('where it writes', () => {
    it('refuses a directory inside the repository', async () => {
      const inside = join(import.meta.dirname, '..', '.tmp-reading');
      await expect(
        readCatalog({
          pdf: 'catalog.pdf',
          out: inside,
          model: { brand: 'Iso', name: 'Rivolta' },
          method: fakeReadingMethod([]),
          pages: fakePages([]),
          limit: 100,
          print: () => undefined,
        }),
      ).rejects.toThrow(/inside the repository/);
    });

    it('refuses a directory that already holds something', async () => {
      const out = await givenOutputDirectory();
      opened.push(out);
      await mkdir(out.path, { recursive: true });
      await writeFile(join(out.path, 'reading.json'), '{}');

      await expect(
        readCatalog({
          pdf: 'catalog.pdf',
          out: out.path,
          model: { brand: 'Iso', name: 'Rivolta' },
          method: fakeReadingMethod([]),
          pages: fakePages([]),
          limit: 100,
          print: () => undefined,
        }),
      ).rejects.toThrow(/already holds something/);
    });
  });
});
