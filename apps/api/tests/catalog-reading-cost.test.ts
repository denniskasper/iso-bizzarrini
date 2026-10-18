import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCatalog } from '../src/reading/read-catalog.js';
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
 * **What a reading run costs** (ADR 0016, issue #37): an estimate before anything is sent, a
 * limit it never passes, a running total, and a record afterwards.
 *
 * The fake Reading method answers every request with the same token counts, so every figure here
 * is known: at the price list's $4 in and $20 out per million, a request costs $0.04, the most one
 * could cost is $0.10, and every page is estimated at $0.12 — asked what it is, and read twice.
 */
describe('the cost of reading a catalog', () => {
  const opened: OutputDirectory[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  async function read(pages: InventedPage[], limit: number | undefined) {
    const out = await givenOutputDirectory();
    opened.push(out);
    const printed: string[] = [];
    const method = fakeReadingMethod(pages);
    const run = readCatalog({
      pdf: '/somewhere/catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method,
      pages: fakePages(pages),
      limit,
      print: (line) => printed.push(line),
    });
    return { out: out.path, printed, method, run };
  }

  const aTavola = (number: string): InventedPage[] => [
    aDrawing(number),
    aTableSheet(number, [aTable([aRow('1', '208501', 'VITE')])]),
  ];

  async function costRecordOf(out: string) {
    return JSON.parse(await readFile(join(out, 'cost.json'), 'utf8'));
  }

  it('refuses to start without a limit, and sends nothing', async () => {
    const { out, method, run } = await read(aTavola('84'), undefined);

    await expect(run).rejects.toThrow(/Give a spending limit in dollars.*There is no default/);
    expect(method.estimated).toEqual([]);
    expect(method.calls).toEqual([]);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses to start when the estimate is above the limit, and says both', async () => {
    const { out, method, run } = await read(aTavola('84'), 0.2);

    await expect(run).rejects.toThrow(
      'The estimate, $0.24, is above the limit of $0.20. Nothing was read.',
    );
    expect(method.estimated).toEqual([1, 2]);
    expect(method.calls).toEqual([]);
    expect(existsSync(out)).toBe(false);
  });

  it('prints the estimate first, a running total after every sheet, and each Tavola’s cost', async () => {
    const { printed, run } = await read(aTavola('84'), 1);
    await run;

    expect(printed[0]).toBe(
      'Estimated at $0.24 for 2 pages, at claude-opus-5-5 list prices checked on 2026-10-17. ' +
        'Every page is counted as a Table sheet read twice; a drawing costs less.',
    );
    expect(printed).toContain('Page 1: drawing of Tavola 84. $0.04, $0.04 so far.');
    expect(printed).toContain('Page 2: Table sheet of Tavola 84. $0.04, $0.08 so far.');
    expect(printed).toContain('  Table sheet 1, page 2: 1 rows, 0 in doubt. $0.08, $0.16 so far.');
    expect(printed).toContain('  1 Listings, 0 in doubt. Tavola 84 cost $0.16.');
    expect(printed).toContain(
      'Cost $0.16, estimated at $0.24, within a limit of $1.00. Recorded in cost.json.',
    );
  });

  it('stops before a sheet that could pass the limit, and keeps the Tavole it finished', async () => {
    // Every request about Tavola 84's Table sheet takes the most it could: $0.10.
    const [drawing84, table84] = aTavola('84') as [InventedPage, InventedPage];
    const pages = [
      drawing84,
      { ...table84, tokens: { input: 5000, output: 4000 } },
      ...aTavola('85'),
    ];
    // Estimated at $0.48. After the four pages ($0.22) and Tavola 84's two Readings ($0.20),
    // $0.42 is spent, and Tavola 85's sheet could cost up to $0.20 more.
    const { out, printed, run } = await read(pages, 0.5);
    const result = await run;

    expect(result.tavole.map((tavola) => tavola.number)).toEqual(['84']);
    expect(result.notRead).toEqual(['85']);
    expect(printed).toContain(
      'Stopped: the next sheet could cost up to $0.20, which would pass the limit of $0.50 ' +
        'with $0.42 spent.',
    );
    expect(printed).toContain('Not read: Tavola 85.');

    expect(JSON.parse(await readFile(join(out, 'reading.json'), 'utf8')).tavole).toEqual([
      'tavola-84',
    ]);
    expect(existsSync(join(out, 'tavola-84', 'listings.csv'))).toBe(true);
    expect(existsSync(join(out, 'tavola-85'))).toBe(false);

    const record = await costRecordOf(out);
    expect(record.stoppedAtLimit).toBe(true);
    expect(record.total).toBeCloseTo(0.42, 6);
    expect(record.total).toBeLessThanOrEqual(record.limit);
    expect(
      record.tavole.map((tavola: { number: string; finished: boolean }) => [
        tavola.number,
        tavola.finished,
      ]),
    ).toEqual([
      ['84', true],
      ['85', false],
    ]);
  });

  it('stops while asking what the pages are, and reads nothing it has not placed', async () => {
    // Page 2 could take an answer of 40,000 tokens to say what it is: up to $0.82.
    const { out, printed, run } = await read(
      [
        aDrawing('84'),
        {
          ...aDrawing('85'),
          estimate: { identify: { input: 5000, output: 1000, outputAtMost: 40_000 } },
        },
      ],
      0.5,
    );
    const result = await run;

    expect(result.tavole).toEqual([]);
    expect(result.notRead).toEqual(['84']);
    expect(printed).toContain('Not looked at: page 2.');
    expect((await costRecordOf(out)).notIdentified).toEqual([2]);
  });

  it('records the cost per Tavola, sheet and Reading, beside the estimate, model and prices', async () => {
    const { out, run } = await read([...aTavola('84'), { identity: { kind: 'other' } }], 1);
    await run;

    const identification = { tokens: { input: 5000, output: 1000 }, cost: 0.04 };
    expect(await costRecordOf(out)).toEqual({
      readingMethod: 'a fake Reading method',
      model: 'claude-opus-5-5',
      priceList: {
        inputPerMillion: 4,
        outputPerMillion: 20,
        currency: 'USD',
        checkedOn: '2026-10-17',
        source: 'https://platform.claude.com/docs/en/about-claude/pricing',
      },
      limit: 1,
      estimate: 0.36,
      total: 0.2,
      stoppedAtLimit: false,
      tavole: [
        {
          number: '84',
          finished: true,
          cost: 0.16,
          sheets: [
            { page: 1, kind: 'drawing', cost: 0.04, identification, readings: [] },
            {
              page: 2,
              kind: 'table',
              cost: 0.12,
              identification,
              readings: [
                { reading: 1, ...identification },
                { reading: 2, ...identification },
              ],
            },
          ],
        },
      ],
      setAside: [{ page: 3, cost: 0.04, identification }],
      notIdentified: [],
    });
  });
});
