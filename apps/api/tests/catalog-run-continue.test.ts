import type { CatalogRun, CatalogRunResponse, TavolaResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ModelRow } from '../src/db/schema.js';
import { ReadingMethodError } from '../src/reading/reading-method.js';
import {
  aRow,
  aTable,
  aTableSheet,
  fakeReadingMethod,
  type FakeMethodOptions,
  type InventedPage,
} from './support/catalog-reading.js';
import {
  carryOn,
  configured,
  estimated,
  heldReadingMethod,
  settled,
  start,
  stop,
} from './support/catalog-run.js';
import { givenModel } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Stopping a Catalog run, and continuing it, across a restart too** (issue #59).
 *
 * Page 1 is a Table sheet of Tavola 1 and page 2 one of Tavola 2. Every request costs $0.04 and
 * could cost at most $0.10 (`support/catalog-reading.ts`), so a run asks about both pages for
 * $0.08 and then reads each Tavola twice for $0.08, as long as $0.20 is left for the two Readings
 * at their most. A limit of $0.30 reads Tavola 1 and stops before Tavola 2.
 */
const PAGES: InventedPage[] = [
  aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
  aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
];

const READ_TO_TAVOLA_2 = ['identify 1', 'identify 2', 'read 1 1', 'read 1 2'];

async function current(agent: TestAgent, run: CatalogRun): Promise<CatalogRun> {
  const response = await agent.get(`/api/catalog-runs/${run.id}`).expect(200);
  return (response.body as CatalogRunResponse).run;
}

/** Tavola 1 read and in the archive, Unchecked; Tavola 2 not read. */
async function expectTavola1Kept(agent: TestAgent, run: CatalogRun): Promise<void> {
  const [first, second] = run.tavole;
  expect(first).toMatchObject({ number: '1', finished: true, cost: 0.12 });
  expect(second).toMatchObject({ number: '2', finished: false, tavolaId: null });
  const tavola = await agent.get(`/api/tavole/${first?.tavolaId}`).expect(200);
  expect((tavola.body as TavolaResponse).tavola.state).toBe('unchecked');
}

describe('a Catalog run that stops', () => {
  const options: FakeMethodOptions = {};
  let app: TestApp;
  let method: ReturnType<typeof heldReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    method = heldReadingMethod(PAGES, options);
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    method.calls.length = 0;
    delete options.usageLimitAfter;
    administrator = (await givenAnAdministrator(app, { name: 'Ada Admin' })).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
  });

  it('stops at its limit, keeps what it read, and continues once the limit is raised', async () => {
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 0.3 }).expect(202);

    const stopped = await settled(administrator, run);
    expect(stopped).toMatchObject({ state: 'stopped-at-limit', limit: 0.3, spent: 0.16 });
    await expectTavola1Kept(administrator, stopped);
    expect(method.calls).toEqual(READ_TO_TAVOLA_2);

    // The limit is what stopped it, so it is raised before anything more is read.
    const unraised = await carryOn(administrator, run).expect(400);
    expect(unraised.body.error.message).toMatch(/Raise the limit/);
    await carryOn(administrator, run, { limit: 0.3 }).expect(400);
    expect((await current(administrator, run)).state).toBe('stopped-at-limit');

    method.calls.length = 0;
    app.clock.setTo(new Date('2026-01-16T10:00:00.000Z'));
    const continued = await carryOn(administrator, run, { limit: 1 }).expect(202);
    expect((continued.body as CatalogRunResponse).run).toMatchObject({
      state: 'running',
      limit: 1,
    });

    const finished = await settled(administrator, run);
    expect(finished).toMatchObject({ state: 'finished', limit: 1, spent: 0.24, failure: null });
    // Neither page asked about again, and Tavola 1 not read again.
    expect(method.calls).toEqual(['read 2 1', 'read 2 2']);
    expect(finished.tavole).toEqual([
      expect.objectContaining({ number: '1', finished: true, cost: 0.12 }),
      expect.objectContaining({ number: '2', finished: true, cost: 0.12 }),
    ]);
    expect(finished.tavole[0]?.tavolaId).toBe(stopped.tavole[0]?.tavolaId);
    expect(finished.tavole[1]?.tavolaId).not.toBeNull();

    // Who did each, and when.
    const by = { id: expect.any(String), name: 'Ada Admin' };
    expect(finished.actions).toEqual([
      { action: 'started', by, at: '2026-01-15T09:00:00.000Z', limit: 0.3 },
      { action: 'raised', by, at: '2026-01-16T10:00:00.000Z', limit: 1 },
      { action: 'continued', by, at: '2026-01-16T10:00:00.000Z', limit: null },
    ]);
  });

  it('stops at the plan’s usage limit, and continues without a new limit', async () => {
    options.usageLimitAfter = READ_TO_TAVOLA_2.length;
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);

    const stopped = await settled(administrator, run);
    expect(stopped.state).toBe('stopped-at-usage-limit');
    await expectTavola1Kept(administrator, stopped);

    delete options.usageLimitAfter;
    method.calls.length = 0;
    await carryOn(administrator, run).expect(202);

    expect(await settled(administrator, run)).toMatchObject({ state: 'finished', spent: 0.24 });
    expect(method.calls).toEqual(['read 2 1', 'read 2 2']);
  });

  it('stops when the model fails, rather than asking again', async () => {
    const readTable = method.readTable;
    method.readTable = async (sheet, reading) => {
      if (sheet.page === 2) {
        throw new ReadingMethodError('The model declined to read this sheet.');
      }
      return readTable(sheet, reading);
    };
    try {
      const run = await estimated(administrator, model);
      await start(administrator, run, { limit: 1 }).expect(202);

      const stopped = await settled(administrator, run);
      expect(stopped).toMatchObject({ state: 'stopped-after-failures', spent: 0.16 });
      await expectTavola1Kept(administrator, stopped);
      expect(method.calls).toEqual(READ_TO_TAVOLA_2);

      method.readTable = readTable;
      method.calls.length = 0;
      await carryOn(administrator, run).expect(202);
      expect((await settled(administrator, run)).state).toBe('finished');
      expect(method.calls).toEqual(['read 2 1', 'read 2 2']);
    } finally {
      method.readTable = readTable;
    }
  });

  it('stops when an Administrator presses Stop, and an Editor cannot', async () => {
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const run = await estimated(administrator, model);
    const hold = method.holdAt('read 2 1');
    await start(administrator, run, { limit: 1 }).expect(202);
    await hold.reached;

    await stop(editor, run).expect(404);
    await carryOn(editor, run).expect(404);
    const pressed = await stop(administrator, run).expect(202);
    expect((pressed.body as CatalogRunResponse).run.state).toBe('running');
    hold.release();

    // The Reading in hand is finished; the next one is never asked for.
    const stopped = await settled(administrator, run);
    expect(stopped.state).toBe('stopped-by-administrator');
    await expectTavola1Kept(administrator, stopped);
    expect(method.calls).toEqual([...READ_TO_TAVOLA_2, 'read 2 1']);
    expect(stopped.actions.map((action) => action.action)).toEqual(['started', 'stopped']);
    expect(stopped.actions[1]?.by?.name).toBe('Ada Admin');
    await stop(administrator, run).expect(409);

    // The Tavola it stopped in the middle of is read again whole.
    method.calls.length = 0;
    await carryOn(administrator, run).expect(202);
    const finished = await settled(administrator, run);
    expect(finished.state).toBe('finished');
    expect(method.calls).toEqual(['read 2 1', 'read 2 2']);
    expect(finished.tavole[1]).toMatchObject({ finished: true, cost: 0.16 });
    expect(finished.spent).toBe(0.28);
  });

  it('cannot continue a run that has not stopped', async () => {
    const run = await estimated(administrator, model);
    await carryOn(administrator, run).expect(409);

    await start(administrator, run, { limit: 1 }).expect(202);
    await settled(administrator, run);
    await carryOn(administrator, run).expect(409);
  });
});

describe('a Catalog run when the server restarts', () => {
  let before: TestApp;
  let after: TestApp;

  afterAll(async () => {
    await after.close();
  });

  it('is carried on by the next server, without paying again for anything it did', async () => {
    const interrupted = heldReadingMethod(PAGES);
    before = await startTestApp({ reading: configured(interrupted) });
    const { agent: administrator, email, password } = await givenAnAdministrator(before);
    const model = await givenModel(before.db, { brand: 'Iso', name: 'Grifo' });
    const run = await estimated(administrator, model);
    const hold = interrupted.holdAt('read 2 1');
    await start(administrator, run, { limit: 1 }).expect(202);
    await hold.reached;

    // The server goes away in the middle of Tavola 2, and the next one starts on the same data.
    const carriedOn = fakeReadingMethod(PAGES);
    after = await before.restart({ reading: configured(carriedOn) });
    const again = await after.memberAgent({ email, password });

    // The Reading it was waiting for was sent and paid for, and is counted at the most it could
    // cost: $0.10, on top of the $0.16 answered before it and the $0.08 read after.
    const finished = await settled(again, run);
    expect(finished).toMatchObject({ state: 'finished', spent: 0.34 });
    expect(finished.costs.map(({ total, cutOff }) => ({ total, cutOff }))).toEqual([
      {
        total: 0.26,
        cutOff: [{ request: 'reading', page: 2, tavola: '2', reading: 1, cost: 0.1 }],
      },
      { total: 0.08, cutOff: [] },
    ]);
    expect(interrupted.calls).toEqual(READ_TO_TAVOLA_2);
    expect(carriedOn.calls).toEqual(['read 2 1', 'read 2 2']);
    expect(finished.tavole.map((tavola) => [tavola.number, tavola.finished])).toEqual([
      ['1', true],
      ['2', true],
    ]);
    expect(finished.actions.map(({ action, by }) => [action, by === null])).toEqual([
      ['started', false],
      ['continued', true],
    ]);
  });
});

describe('a Catalog run cut off in the middle of a request', () => {
  let before: TestApp;
  let after: TestApp;

  afterAll(async () => {
    await after.close();
  });

  it('counts the request against its limit when it carries on', async () => {
    const interrupted = heldReadingMethod(PAGES);
    before = await startTestApp({ reading: configured(interrupted) });
    const { agent: administrator, email, password } = await givenAnAdministrator(before);
    const model = await givenModel(before.db, { brand: 'Iso', name: 'Grifo' });
    const run = await estimated(administrator, model);
    const hold = interrupted.holdAt('read 2 1');
    await start(administrator, run, { limit: 0.4 }).expect(202);
    await hold.reached;

    const carriedOn = fakeReadingMethod(PAGES);
    after = await before.restart({ reading: configured(carriedOn) });
    const again = await after.memberAgent({ email, password });

    // $0.16 answered and $0.10 cut off leave $0.14, short of the $0.20 Tavola 2 could cost. Had
    // the cut-off Reading not been counted, $0.24 would be left and it would have read on.
    const stopped = await settled(again, run);
    expect(stopped).toMatchObject({ state: 'stopped-at-limit', limit: 0.4, spent: 0.26 });
    expect(carriedOn.calls).toEqual([]);
  });
});
