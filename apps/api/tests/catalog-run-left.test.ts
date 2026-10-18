import type { CatalogRun, CatalogRunResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ModelRow } from '../src/db/schema.js';
import { aRow, aTable, aTableSheet, type InventedPage } from './support/catalog-reading.js';
import {
  carryOn,
  configured,
  estimated,
  heldReadingMethod,
  settled,
  start,
} from './support/catalog-run.js';
import { givenModel } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **What a Catalog run has not yet read** (issue #64).
 *
 * Page 1 is a Table sheet of Tavola 1, pages 2 and 3 are Tavola 2's two Table sheets, and page 4
 * is Tavola 3's. Every request costs $0.04 and could cost at most $0.10, so the run asks about
 * all four pages for $0.16, reads Tavola 1 for $0.08 and Tavola 2's first sheet for $0.08, and a
 * limit of $0.50 stops it there: the second sheet's two Readings could take it to $0.52.
 */
const PAGES: InventedPage[] = [
  aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
  aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
  aTableSheet('2', [aTable([aRow('2', '41.02.002', 'DADO')])], { titleIt: 'VITERIA' }),
  aTableSheet('3', [aTable([aRow('1', '41.03.001', 'MOLLA')])], { titleIt: 'MOLLE' }),
];

/** Tavola 1 read, Tavola 2 begun and not finished, and Tavola 3's page never reached. */
function expectPartWay(run: CatalogRun): void {
  expect(run.tavole.filter((tavola) => tavola.finished).map((tavola) => tavola.number)).toEqual([
    '1',
  ]);
  expect(run.left).toEqual({ tavole: ['2'], pages: [4] });
}

async function current(agent: TestAgent, run: CatalogRun): Promise<CatalogRun> {
  const response = await agent.get(`/api/catalog-runs/${run.id}`).expect(200);
  return (response.body as CatalogRunResponse).run;
}

describe('what a Catalog run has not yet read', () => {
  let app: TestApp;
  let method: ReturnType<typeof heldReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    method = heldReadingMethod(PAGES);
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    method.calls.length = 0;
    administrator = (await givenAnAdministrator(app)).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
  });

  it('is every page before the run starts', async () => {
    const run = await estimated(administrator, model, 4);
    expect(run.left).toEqual({ tavole: [], pages: [1, 2, 3, 4] });
  });

  it('lists the Tavola stopped part-way and the pages never reached, until it is finished', async () => {
    const run = await estimated(administrator, model, 4);
    await start(administrator, run, { limit: 0.5 }).expect(202);

    const stopped = await settled(administrator, run);
    expect(stopped).toMatchObject({ state: 'stopped-at-limit', spent: 0.32 });
    expectPartWay(stopped);

    await carryOn(administrator, run, { limit: 1 }).expect(202);
    const finished = await settled(administrator, run);
    expect(finished.state).toBe('finished');
    expect(finished.tavole.map((tavola) => [tavola.number, tavola.finished])).toEqual([
      ['1', true],
      ['2', true],
      ['3', true],
    ]);
    expect(finished.left).toEqual({ tavole: [], pages: [] });
  });

  it('is not there for an Editor or a Member', async () => {
    const run = await estimated(administrator, model, 4);
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await agent.get(`/api/catalog-runs/${run.id}`).expect(404);
    }
  });
});

describe('what a Catalog run cut off by a restart has not yet read', () => {
  let after: TestApp | undefined;

  afterAll(async () => {
    await after?.close();
  });

  it('is the same on the next server, and nothing once it has finished', async () => {
    const interrupted = heldReadingMethod(PAGES);
    const before = await startTestApp({ reading: configured(interrupted) });
    const { agent: administrator, email, password } = await givenAnAdministrator(before);
    const model = await givenModel(before.db, { brand: 'Iso', name: 'Grifo' });
    const run = await estimated(administrator, model, 4);
    const cutOff = interrupted.holdAt('read 3 1');
    await start(administrator, run, { limit: 1 }).expect(202);
    await cutOff.reached;
    expectPartWay(await current(administrator, run));

    // The next server reads Tavola 2 again whole, and is held at its first sheet.
    const carriedOn = heldReadingMethod(PAGES);
    const held = carriedOn.holdAt('read 2 1');
    after = await before.restart({ reading: configured(carriedOn) });
    const again = await after.memberAgent({ email, password });
    await held.reached;
    expectPartWay(await current(again, run));

    held.release();
    const finished = await settled(again, run);
    expect(finished.state).toBe('finished');
    expect(finished.left).toEqual({ tavole: [], pages: [] });
  });
});
