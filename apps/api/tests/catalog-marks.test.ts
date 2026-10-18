import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
