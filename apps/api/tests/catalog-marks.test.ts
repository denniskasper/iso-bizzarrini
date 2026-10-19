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
  type OutputDirectory,
} from './support/catalog-reading.js';

/**
 * **Marks proposed from the drawing** (ADR 0017, issue #33).
 *
 * The drawings here are invented with real ink on them — digits a finder can find, and a ruled
 * title block — and the fake Reading method reads a crop as whatever is printed inside its box.
 * So what is asserted is the part that is not the model's: where the numbers are, which ink counts
 * as one, what is left out, and where the drawing and the table disagree.
 */
describe('Marks proposed from the drawing', () => {
  const opened: OutputDirectory[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  const WIDTH = 1000;
  const HEIGHT = 800;

  function drawing(fields: Partial<InventedPage>): InventedPage {
    return { ...aDrawing('84'), width: WIDTH, height: HEIGHT, ...fields };
  }

  function tableListing(...positions: string[]): InventedPage {
    return aTableSheet('84', [
      aTable(positions.map((position, index) => aRow(position, `20850${index}`, 'VITE'))),
    ]);
  }

  async function read(pages: InventedPage[], limit = 100, options: FakeMethodOptions = {}) {
    const out = await givenOutputDirectory();
    opened.push(out);
    const printed: string[] = [];
    const method = fakeReadingMethod(pages, options);
    const result = await readCatalog({
      pdf: 'catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method,
      pages: fakePages(pages),
      limit,
      print: (line) => printed.push(line),
    });
    return { out: out.path, result, method, printed: printed.join('\n') };
  }

  async function marksOf(out: string) {
    const text = await readFile(join(out, 'tavola-84', 'marks.csv'), 'utf8');
    return readSheet('marks.csv', text).rows.map((row) => ({
      position: row.get('Position'),
      x: Number(row.get('X')),
      y: Number(row.get('Y')),
      readingNote: row.get('Reading note'),
    }));
  }

  async function doubtsOf(out: string) {
    const text = await readFile(join(out, 'tavola-84', 'doubts.csv'), 'utf8');
    return readSheet('doubts.csv', text).rows.map((row) => ({
      position: row.get('Position'),
      doubt: row.get('Doubt'),
    }));
  }

  it('proposes a Mark on every number, in fractions of the drawing', async () => {
    const { out, result } = await read([
      drawing({
        numbers: [
          { text: '7', x: 200, y: 100 },
          { text: '12', x: 600, y: 300 },
          { text: '150', x: 400, y: 600 },
        ],
      }),
      tableListing('7', '12', '150'),
    ]);

    const marks = await marksOf(out);
    expect(marks.map((mark) => mark.position)).toEqual(['7', '12', '150']);
    const [seven, twelve, hundredFifty] = marks;
    // Each at the middle of its number: "7" is 14 pixels wide and every digit 26 tall.
    expect(seven?.x).toBeCloseTo((200 + 7) / WIDTH, 3);
    expect(seven?.y).toBeCloseTo((100 + 13) / HEIGHT, 3);
    expect(twelve?.x).toBeCloseTo((600 + (4 + 3 + 14) / 2) / WIDTH, 3);
    expect(hundredFifty?.y).toBeCloseTo((600 + 13) / HEIGHT, 3);
    for (const mark of marks) {
      expect(mark.x).toBeGreaterThan(0);
      expect(mark.x).toBeLessThan(1);
    }
    expect(result.tavole[0]).toMatchObject({ marks: 3, markDoubts: 0 });
    expect(await doubtsOf(out)).toEqual([]);
  });

  it('reads two numbers side by side as two, and a number whose digits touch as one', async () => {
    const { out } = await read([
      drawing({
        numbers: [
          { text: '81', x: 200, y: 200 },
          { text: '82', x: 250, y: 200 },
          { text: '46', x: 500, y: 400, gap: 0 },
        ],
      }),
      tableListing('81', '82', '46'),
    ]);

    expect((await marksOf(out)).map((mark) => mark.position)).toEqual(['81', '82', '46']);
  });

  it('puts back together a number the finder split in two', async () => {
    const { out } = await read([
      drawing({ numbers: [{ text: '123', x: 300, y: 300, gap: 10 }] }),
      tableListing('123'),
    ]);

    const [mark] = await marksOf(out);
    expect(mark?.position).toBe('123');
    expect(mark?.readingNote).toBe('The number was hard to read.');
    // One Mark, at the middle of the whole number rather than of either part.
    expect(mark?.x).toBeCloseTo((300 + (4 + 10 + 14 + 3 + 14) / 2) / WIDTH, 2);
  });

  it('notes a number the reading hesitated over', async () => {
    const { out } = await read([
      drawing({ numbers: [{ text: '68', x: 300, y: 300, unsure: true }] }),
      tableListing('68'),
    ]);

    expect(await marksOf(out)).toMatchObject([
      { position: '68', readingNote: 'The number was hard to read.' },
    ]);
  });

  it('proposes no Mark for a number in the title block or the margin', async () => {
    const { out, method } = await read([
      drawing({
        numbers: [
          { text: '12', x: 300, y: 300 },
          // Tavola N° 84, in a ruled cell of the title block.
          { text: '84', x: 830, y: 700 },
          // A page number in the margin.
          { text: '9', x: 500, y: 785 },
          // Between two outlines of the drawing, which close it in above and below and not
          // either side.
          { text: '30', x: 600, y: 400 },
        ],
        lines: [
          { x: 450, y: 380, w: 300, h: 3 },
          { x: 450, y: 445, w: 300, h: 3 },
        ],
        rules: [
          { x: 700, y: 670, w: 280, h: 90 },
          { x: 420, y: 670, w: 283, h: 90 },
        ],
      }),
      tableListing('12', '30'),
    ]);

    expect((await marksOf(out)).map((mark) => mark.position)).toEqual(['12', '30']);
    // What is left out is never sent to be read.
    expect(method.calls.filter((call) => call.startsWith('numbers'))).toEqual(['numbers 2']);
  });

  it('proposes no Mark in a title block whose cells are open on a side', async () => {
    // As Tavola 51's: two rows of cells across the top, cut off at the sheet's right edge, a
    // label between each cell's left rule and its number.
    const { out } = await read([
      drawing({
        numbers: [
          // Foglio N° 101, in the upper row.
          { text: '101', x: 850, y: 45 },
          // Gruppo 1, Sottogruppo 11 and Tavola N° 51, in the lower row.
          { text: '1', x: 560, y: 82 },
          { text: '11', x: 740, y: 82 },
          { text: '51', x: 900, y: 82 },
          // Position numbers on the drawing, one just below the title block.
          { text: '7', x: 400, y: 125 },
          { text: '12', x: 300, y: 400 },
        ],
        lines: [
          // The title block's rules, running off the right of the sheet's frame.
          { x: 50, y: 40, w: 930, h: 3 },
          { x: 300, y: 75, w: 680, h: 3 },
          { x: 50, y: 110, w: 930, h: 3 },
          // Its cells' sides, and the labels standing before the numbers.
          { x: 300, y: 40, w: 3, h: 73 },
          { x: 600, y: 78, w: 3, h: 35 },
          { x: 800, y: 78, w: 3, h: 35 },
          { x: 320, y: 92, w: 80, h: 4 },
          { x: 620, y: 92, w: 80, h: 4 },
          { x: 820, y: 92, w: 50, h: 4 },
        ],
      }),
      tableListing('1', '7', '11', '12'),
    ]);

    expect((await marksOf(out)).map((mark) => mark.position)).toEqual(['7', '12']);
  });

  it('finds numbers printed sideways to the title block, and marks them where they are on the Scan', async () => {
    // Printed a quarter turn from the headings: the numbers read upright once the sheet is
    // turned 90° clockwise, and its title block once it is not turned at all.
    const { out } = await read([
      {
        ...aDrawing('84', { turn: 0, numbersTurn: 90 }),
        width: WIDTH,
        height: HEIGHT,
        numbers: [
          { text: '7', x: 200, y: 100 },
          { text: '22', x: 600, y: 300 },
        ],
      },
      tableListing('7', '22'),
    ]);

    const marks = await marksOf(out);
    expect(marks.map((mark) => mark.position)).toEqual(['22', '7']);
    const [twentyTwo, seven] = marks;
    // The Scan is the sheet as its headings read, the numbers' frame turned back a quarter.
    expect(seven?.x).toBeCloseTo((100 + 13) / HEIGHT, 3);
    expect(seven?.y).toBeCloseTo(1 - (200 + 7) / WIDTH, 3);
    expect(twentyTwo?.x).toBeCloseTo((300 + 13) / HEIGHT, 3);
  });

  it('asks which way up the numbers are, and turns them half round where it was guessed wrong', async () => {
    const { out, method } = await read([
      {
        ...aDrawing('84', { turn: 0, numbersTurn: 90 }),
        // Identified as reading the other way round, downward.
        saysNumbersTurn: 270,
        width: WIDTH,
        height: HEIGHT,
        numbers: [
          { text: '7', x: 200, y: 100 },
          { text: '22', x: 600, y: 300 },
        ],
      },
      tableListing('7', '22'),
    ]);

    expect(method.calls).toContain('orient 1');
    const [twentyTwo, seven] = await marksOf(out);
    expect([twentyTwo?.position, seven?.position]).toEqual(['22', '7']);
    expect(seven?.x).toBeCloseTo((100 + 13) / HEIGHT, 3);
    expect(seven?.y).toBeCloseTo(1 - (200 + 7) / WIDTH, 3);
  });

  it('does not ask which way up the numbers are where they read as the headings do', async () => {
    const { method } = await read([
      drawing({ numbers: [{ text: '7', x: 200, y: 100 }] }),
      tableListing('7'),
    ]);

    expect(method.calls.filter((call) => call.startsWith('orient'))).toEqual([]);
  });

  it('asks a drawing identified before again which way its numbers read, and keeps the rest', async () => {
    const pages = [
      {
        ...aDrawing('84', { turn: 0, numbersTurn: 90, titleIt: 'ASKED AGAIN' }),
        width: WIDTH,
        height: HEIGHT,
        numbers: [{ text: '7', x: 200, y: 100 }],
      },
      tableListing('7'),
    ];
    const method = fakeReadingMethod(pages);
    const { numbersTurn: _, ...before } = {
      kind: 'drawing' as const,
      tavola: '84',
      foglio: null,
      turn: 0 as const,
      numbersTurn: undefined,
      titleIt: 'AS FIRST READ',
      sezione: null,
      gruppo: null,
      sottogruppo: null,
    };
    const store = memoryStore({
      run: 2,
      pages: [
        { page: 1, identity: before },
        { page: 2, identity: { ...before, kind: 'table' } },
      ],
      tavole: [],
      translations: [],
    });

    await readCatalogInto({
      method,
      pages: fakePages(pages)('catalog.pdf'),
      limit: 100,
      store,
      print: () => undefined,
    });

    expect(method.calls.filter((call) => call.startsWith('identify'))).toEqual(['identify 1']);
    expect(store.pages.at(-1)).toEqual({
      page: 1,
      identity: { ...before, numbersTurn: 90 },
    });
    expect(store.tavole[0]?.marks.map((mark) => mark.position)).toEqual(['7']);
  });

  it('lists every Position with no Mark, and every Mark listed in no row', async () => {
    const { out, result, printed } = await read([
      drawing({
        numbers: [
          { text: '1', x: 200, y: 200 },
          { text: '3', x: 400, y: 200 },
          { text: '57', x: 600, y: 200 },
        ],
      }),
      tableListing('1', '2', '-', '3', '16'),
    ]);

    expect(await doubtsOf(out)).toEqual([
      {
        position: '2',
        doubt: 'Position 2 is in the table, and no Mark for it was found on the drawing.',
      },
      {
        position: '16',
        doubt: 'Position 16 is in the table, and no Mark for it was found on the drawing.',
      },
      {
        position: '57',
        doubt: 'A Mark for 57 is on the drawing, and no row of the table has Position 57.',
      },
    ]);
    expect(result.tavole[0]).toMatchObject({ marks: 3, markDoubts: 3 });
    expect(printed).toContain(
      '  Drawing, page 1: 3 Marks proposed from 3 candidates, 3 Positions in doubt ' +
        'between the drawing and the table. $0.04, $0.20 so far.',
    );
  });

  it('writes no Marks for a Tavola with no drawing', async () => {
    const { out } = await read([tableListing('1')]);

    await expect(readFile(join(out, 'tavola-84', 'marks.csv'))).rejects.toThrow();
    await expect(readFile(join(out, 'tavola-84', 'doubts.csv'))).rejects.toThrow();
  });

  describe('what reading the numbers costs', () => {
    it('is recorded against the drawing, a request at a time', async () => {
      const { out } = await read([
        drawing({ numbers: [{ text: '12', x: 300, y: 300 }] }),
        tableListing('12'),
      ]);

      const cost = JSON.parse(await readFile(join(out, 'cost.json'), 'utf8'));
      const [drawingSheet] = cost.tavole[0].sheets;
      expect(drawingSheet).toMatchObject({
        page: 1,
        kind: 'drawing',
        cost: 0.08,
        numbers: [{ tokens: { input: 5000, output: 1000 }, cost: 0.04 }],
      });
    });

    it('is estimated for numbers printed sideways, which cannot be found as the page was scanned', async () => {
      // 81 numbers, three requests of 40 at $0.04: more than the $0.08 of reading it as a
      // Table sheet, so the drawing is estimated at $0.16 with asking what it is.
      const numbers = Array.from({ length: 81 }, (_, index) => ({
        text: String((index % 9) + 1),
        x: 60 + (index % 9) * 100,
        y: 60 + Math.floor(index / 9) * 80,
      }));
      const { result, method, printed } = await read([
        {
          ...aDrawing('84', { turn: 0, numbersTurn: 90 }),
          width: WIDTH,
          height: HEIGHT,
          numbers,
        },
        tableListing('1'),
      ]);

      expect(method.calls.filter((call) => call.startsWith('numbers'))).toEqual([
        'numbers 40',
        'numbers 40',
        'numbers 1',
      ]);
      expect(printed).toContain('Estimated at $0.28 for 2 pages');
      expect(result.cost.total).toBeLessThanOrEqual(result.cost.estimate);
    });

    it('is held to the limit: a run that could pass it stops before reading them', async () => {
      // Asked about both pages ($0.08) and read the Table sheet twice ($0.08); reading the
      // numbers could cost $0.22 more, which a limit of $0.30 has no room for.
      const pages = [drawing({ numbers: [{ text: '12', x: 300, y: 300 }] }), tableListing('12')];
      const { result, method, printed } = await read(pages, 0.3, {
        numbersEstimate: { input: 5000, output: 1000, outputAtMost: 10000 },
      });

      expect(method.calls.filter((call) => call.startsWith('numbers'))).toEqual([]);
      expect(result.notRead).toEqual(['84']);
      expect(printed).toContain('Stopped: reading the numbers on the drawing of Tavola 84');
    });
  });
});
