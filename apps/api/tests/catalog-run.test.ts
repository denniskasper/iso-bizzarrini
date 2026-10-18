import type { CatalogRunResponse, TavolaResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ModelRow } from '../src/db/schema.js';
import {
  aRow,
  aTable,
  aTableSheet,
  fakeReadingMethod,
  type InventedPage,
} from './support/catalog-reading.js';
import { configured, estimated, heldReadingMethod, settled, start } from './support/catalog-run.js';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Starting a Catalog run, and Tavole arriving Unchecked as they finish** (issue #58).
 *
 * The catalog is a fixture PDF of blank pages, and the fake Reading method says what each page
 * is: page 1 a Table sheet of Tavola 1, page 2 one of Tavola 2. Every request costs $0.04
 * (`support/catalog-reading.ts`), so each page is estimated at $0.12 and each Tavola costs that:
 * asked what it is, and read twice.
 */
const PAGES: InventedPage[] = [
  aTableSheet(
    '1',
    [aTable([aRow('1', '41.01.001', 'COPERCHIO'), aRow('2', '41.01.002', 'GUARNIZIONE')])],
    { titleIt: 'COPERCHIO MOTORE' },
  ),
  aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
];

describe('starting a Catalog run', () => {
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
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta', series: 'GT' });
  });

  it('is refused without a limit, and nothing is read', async () => {
    const run = await estimated(administrator, model);

    const response = await start(administrator, run, {}).expect(400);

    expect(response.body.error.message).toMatch(/spending limit/);
    expect(method.calls).toEqual([]);
    const after = await administrator.get(`/api/catalog-runs/${run.id}`).expect(200);
    expect((after.body as CatalogRunResponse).run.state).toBe('estimated');
  });

  it('is refused with the estimate above the limit, and says both', async () => {
    const run = await estimated(administrator, model);

    const response = await start(administrator, run, { limit: 0.2 }).expect(400);

    expect(response.body.error.message).toMatch(/\$0\.24.*\$0\.20/);
    expect(method.calls).toEqual([]);
  });

  it('reads to the end, its running total matching the fake method’s counts', async () => {
    const run = await estimated(administrator, model);

    const response = await start(administrator, run, { limit: 1 }).expect(202);
    expect((response.body as CatalogRunResponse).run).toMatchObject({
      state: 'running',
      limit: 1,
    });

    const finished = await settled(administrator, run);
    expect(finished).toMatchObject({
      state: 'finished',
      limit: 1,
      spent: 0.24,
      estimate: 0.24,
      failure: null,
    });
    expect(finished.startedAt).not.toBeNull();
    expect(finished.endedAt).not.toBeNull();
    expect(finished.tavole).toEqual([
      expect.objectContaining({ number: '1', finished: true, cost: 0.12, refused: null }),
      expect.objectContaining({ number: '2', finished: true, cost: 0.12, refused: null }),
    ]);
    expect(method.calls).toEqual([
      'identify 1',
      'identify 2',
      'read 1 1',
      'read 1 2',
      'read 2 1',
      'read 2 2',
    ]);

    // Each is in the archive, Unchecked, under the Model the run was for.
    const [first] = finished.tavole;
    const tavola = await administrator.get(`/api/tavole/${first?.tavolaId}`).expect(200);
    expect((tavola.body as TavolaResponse).tavola).toMatchObject({
      number: '1',
      state: 'unchecked',
      model: { id: model.id },
    });
  });

  it('shows each Tavola to an Editor as Unchecked while the run is still going', async () => {
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    const run = await estimated(administrator, model);
    const hold = method.holdAt('read 2 1');

    await start(administrator, run, { limit: 1 }).expect(202);
    await hold.reached;

    const going = (
      (await administrator.get(`/api/catalog-runs/${run.id}`).expect(200))
        .body as CatalogRunResponse
    ).run;
    expect(going).toMatchObject({ state: 'running', spent: 0.16 });
    const first = going.tavole.find((tavola) => tavola.number === '1');
    expect(first).toMatchObject({ finished: true, cost: 0.12 });

    const seen = await editor.get(`/api/tavole/${first?.tavolaId}`).expect(200);
    expect((seen.body as TavolaResponse).tavola.state).toBe('unchecked');
    await member.get(`/api/tavole/${first?.tavolaId}`).expect(404);

    hold.release();
    expect((await settled(administrator, run)).state).toBe('finished');
  });

  it('refuses a second run while one is running', async () => {
    const first = await estimated(administrator, model);
    const second = await estimated(administrator, model);
    const hold = method.holdAt('read 1 1');

    await start(administrator, first, { limit: 1 }).expect(202);
    await hold.reached;

    const response = await start(administrator, second, { limit: 1 }).expect(409);
    expect(response.body.error.message).toMatch(/one at a time/i);

    hold.release();
    await settled(administrator, first);
    await start(administrator, second, { limit: 1 }).expect(202);
    expect((await settled(administrator, second)).state).toBe('finished');
  });

  it('cannot be started twice', async () => {
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);
    await settled(administrator, run);

    await start(administrator, run, { limit: 1 }).expect(409);
  });

  it('keeps a Published Tavola, and says why it was not loaded', async () => {
    await givenTavola(app.db, model.id, { number: '2', state: 'published' });
    const run = await estimated(administrator, model);

    await start(administrator, run, { limit: 1 }).expect(202);

    const finished = await settled(administrator, run);
    expect(finished.state).toBe('finished');
    expect(finished.tavole[1]).toMatchObject({ number: '2', tavolaId: null });
    expect(finished.tavole[1]?.refused).toMatch(/Published/);
  });

  it('is not there for an Editor or a Member, and they cannot start one', async () => {
    const run = await estimated(administrator, model);
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await start(agent, run, { limit: 1 }).expect(404);
      await agent.get(`/api/catalog-runs/${run.id}`).expect(404);
    }
    expect(method.calls).toEqual([]);

    await start(administrator, run, { limit: 1 }).expect(202);
    const finished = await settled(administrator, run);
    await member.get(`/api/catalog-runs/${run.id}`).expect(404);
    await member.get(`/api/tavole/${finished.tavole[0]?.tavolaId}`).expect(404);
  });
});

describe('a Catalog run that fails', () => {
  let app: TestApp;

  beforeAll(async () => {
    const method = fakeReadingMethod(PAGES);
    method.readTable = async () => {
      throw new Error('Request refused for key sk-ant-a-secret-key');
    };
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  it('says it failed, with no credential in the reason', async () => {
    const administrator = (await givenAnAdministrator(app)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const run = await estimated(administrator, model);

    await start(administrator, run, { limit: 1 }).expect(202);

    const failed = await settled(administrator, run);
    expect(failed.state).toBe('failed');
    expect(failed.failure).toBeTruthy();
    expect(JSON.stringify(failed)).not.toContain('sk-ant');
    // The next run is not held up by it.
    const next = await estimated(administrator, model);
    await start(administrator, next, { limit: 1 }).expect(202);
    await settled(administrator, next);
  });

  it('fails, rather than stopping the server, when it has nowhere to work', async () => {
    const administrator = (await givenAnAdministrator(app)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });
    const run = await estimated(administrator, model);

    const scratch = process.env.TMPDIR;
    process.env.TMPDIR = '/nowhere/ricambi-test';
    try {
      await start(administrator, run, { limit: 1 }).expect(202);
      expect((await settled(administrator, run)).state).toBe('failed');
    } finally {
      process.env.TMPDIR = scratch;
    }
    await administrator.get('/api/catalog-runs').expect(200);
  });
});
