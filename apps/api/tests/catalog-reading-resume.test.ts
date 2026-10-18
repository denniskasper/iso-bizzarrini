import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCatalog, type ReadCatalogOptions } from '../src/reading/read-catalog.js';
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
 * **Reading on a subscription, which is not charged and can run out** (ADR 0016, issue #38).
 *
 * A run on a subscription is priced and limited exactly like one on an API key, and reported as
 * what it would have cost. When the plan's usage limit is reached it stops cleanly, and a later
 * run in the same directory reads only what is left. The figures are the fake method's: a request
 * costs $0.04, and every page is estimated at $0.12.
 */
describe('reading on a subscription', () => {
  const opened: OutputDirectory[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  const aTavola = (number: string): InventedPage[] => [
    aDrawing(number),
    aTableSheet(number, [aTable([aRow('1', '208501', 'VITE')])]),
  ];
  const twoTavole = [...aTavola('84'), ...aTavola('85')];

  async function newDirectory(): Promise<string> {
    const out = await givenOutputDirectory();
    opened.push(out);
    return out.path;
  }

  async function read(
    out: string,
    pages: InventedPage[],
    method: FakeMethodOptions = {},
    options: Partial<ReadCatalogOptions> = {},
  ) {
    const printed: string[] = [];
    const fake = fakeReadingMethod(pages, method);
    const result = await readCatalog({
      pdf: '/somewhere/catalog.pdf',
      out,
      model: { brand: 'Iso', name: 'Rivolta' },
      method: fake,
      pages: fakePages(pages),
      limit: 1,
      print: (line) => printed.push(line),
      ...options,
    });
    return { printed, result, calls: fake.calls };
  }

  const json = async (out: string, file: string) =>
    JSON.parse(await readFile(join(out, file), 'utf8'));

  it('says before it starts that it is not charged, and reports what it would have cost', async () => {
    const out = await newDirectory();
    const { printed } = await read(out, aTavola('84'), { charged: false });

    expect(printed[0]).toBe(
      'Reading with a fake subscription: not charged. Its cost is what it would have been at ' +
        'list prices.',
    );
    expect(printed).toContain('  1 Listings, 0 in doubt. Tavola 84 would have cost $0.16.');
    expect(printed).toContain(
      'Would have cost $0.16 at list prices, and was not charged, estimated at $0.24, within a ' +
        'limit of $1.00. Recorded in cost.json.',
    );
    const record = await json(out, 'cost.json');
    expect(record.charged).toBe(false);
    expect(record.total).toBeCloseTo(0.16, 6);
    expect(record.tavole[0].cost).toBeCloseTo(0.16, 6);
  });

  it('holds a run that is not charged to its limit exactly as one that is', async () => {
    const charged = await read(await newDirectory(), twoTavole, { charged: true }, { limit: 0.5 });
    const notCharged = await read(
      await newDirectory(),
      twoTavole,
      { charged: false },
      { limit: 0.5 },
    );

    expect(notCharged.calls).toEqual(charged.calls);
    expect(notCharged.result.notRead).toEqual(charged.result.notRead);
    expect(notCharged.result.cost.total).toBe(charged.result.cost.total);
  });

  it('stops cleanly at the plan’s usage limit, and keeps the Tavole it finished', async () => {
    const out = await newDirectory();
    // Four pages asked about, Tavola 84 read twice, and then the plan will read no more.
    const { printed, result } = await read(out, twoTavole, {
      charged: false,
      usageLimitAfter: 6,
    });

    expect(result.tavole.map((tavola) => tavola.number)).toEqual(['84']);
    expect(result.notRead).toEqual(['85']);
    expect(printed).toContain(
      'Stopped: The subscription’s usage limit was reached: resets at 5pm.',
    );
    expect(printed).toContain('Not read: Tavola 85.');
    expect(printed.at(-1)).toBe(
      'To read the rest, run the same command again with --resume and a limit for the rest.',
    );
    expect((await json(out, 'reading.json')).tavole).toEqual(['tavola-84']);
    const record = await json(out, 'cost.json');
    expect(record.stopped).toBe('usage-limit');
    expect(record.total).toBeCloseTo(0.24, 6);
  });

  it('carries on where it stopped, reading neither the pages asked about nor the Tavole finished', async () => {
    const out = await newDirectory();
    await read(out, twoTavole, { charged: false, usageLimitAfter: 6 });

    const { printed, result, calls } = await read(
      out,
      twoTavole,
      { charged: false },
      {
        resume: true,
      },
    );

    expect(calls).toEqual(['read 4 1', 'read 4 2']);
    expect(printed).toContain(
      // Tavola 85's drawing is still to be read too, and with no numbers on it costs nothing.
      'Estimated at $0.08 for 2 pages, at claude-opus-5-5 list prices checked on 2026-10-17. ' +
        'Every page is counted as whichever costs more: a Table sheet read twice and translated, ' +
        'or a drawing with its numbers read.',
    );
    expect(printed).toContain('Read before, and not again: Tavola 84.');
    expect(result.readBefore).toEqual(['84']);
    expect(result.tavole.map((tavola) => tavola.number)).toEqual(['85']);
    expect((await json(out, 'reading.json')).tavole).toEqual(['tavola-84', 'tavola-85']);

    // Each run keeps a record of its own.
    expect((await json(out, 'cost.json')).run).toBe(1);
    const second = await json(out, 'cost-2.json');
    expect(second.run).toBe(2);
    expect(second.total).toBeCloseTo(0.08, 6);
    expect(second.tavole.map((tavola: { number: string }) => tavola.number)).toEqual(['85']);
  });

  it('carries on from a stop while the pages were still being asked about', async () => {
    const out = await newDirectory();
    const first = await read(out, twoTavole, { charged: false, usageLimitAfter: 2 });
    expect(first.result.tavole).toEqual([]);
    expect((await json(out, 'cost.json')).notIdentified).toEqual([3, 4]);

    const { calls, result } = await read(out, twoTavole, { charged: false }, { resume: true });

    expect(calls).toEqual([
      'identify 3',
      'identify 4',
      'read 2 1',
      'read 2 2',
      'read 4 1',
      'read 4 2',
    ]);
    expect(result.tavole.map((tavola) => tavola.number)).toEqual(['84', '85']);
  });

  it('records on each Tavola the Reading method that read it', async () => {
    const out = await newDirectory();
    await read(out, twoTavole, { charged: false, usageLimitAfter: 6 });
    await read(out, twoTavole, { charged: true }, { resume: true });

    expect((await json(out, 'tavola-84/tavola.json')).readingMethod).toBe('a fake subscription');
    expect((await json(out, 'tavola-85/tavola.json')).readingMethod).toBe('a fake Reading method');
  });

  it('keeps the set-aside pages of the run it carries on from', async () => {
    const out = await newDirectory();
    const pages = [{ identity: { kind: 'other' as const } }, ...twoTavole];
    await read(out, pages, { usageLimitAfter: 7 });
    await read(out, pages, {}, { resume: true });

    const setAside = await readFile(join(out, 'set-aside.csv'), 'utf8');
    expect(setAside).toContain('set-aside/page-1.png');
    expect(existsSync(join(out, 'set-aside', 'page-1.png'))).toBe(true);
  });

  it('starts a new reading only in an empty directory, and carries on only in a reading', async () => {
    const out = await newDirectory();
    await read(out, aTavola('84'));

    await expect(read(out, aTavola('84'))).rejects.toThrow(
      /already holds something\. Give an empty or new directory, or carry on reading into it with --resume\./,
    );
    await expect(read(await newDirectory(), aTavola('84'), {}, { resume: true })).rejects.toThrow(
      /holds no reading to carry on with/,
    );
    await expect(
      read(out, aTavola('84'), {}, { resume: true, pdf: '/somewhere/other.pdf' }),
    ).rejects.toThrow('was read from catalog.pdf, not other.pdf.');
    await expect(
      read(out, aTavola('84'), {}, { resume: true, model: { brand: 'Iso', name: 'Grifo' } }),
    ).rejects.toThrow('is the catalog of the Iso Rivolta, not the Iso Grifo.');
  });

  it('takes the car from the directory it carries on in', async () => {
    const out = await newDirectory();
    await read(out, twoTavole, { usageLimitAfter: 6 });

    const { result } = await read(out, twoTavole, {}, { resume: true, model: undefined });

    expect(result.tavole.map((tavola) => tavola.number)).toEqual(['85']);
  });
});
