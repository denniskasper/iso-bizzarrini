import type { CatalogRun } from '@ricambi/contracts';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ModelRow } from '../src/db/schema.js';
import {
  NO_ESTIMATE,
  aRow,
  aTable,
  aTableSheet,
  type InventedPage,
} from './support/catalog-reading.js';
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
 * **The pages a Catalog run set aside** (issue #60).
 *
 * Page 1 is a Table sheet of Tavola 1. Page 2 is a Table sheet whose Tavola number could not be
 * read, so it is set aside rather than guessed, and is estimated only to be asked about. Page 3
 * is a Table sheet of Tavola 3. A limit of $0.35 asks about all three pages ($0.12), reads Tavola
 * 1 ($0.08), and stops before Tavola 3, whose two Readings could cost $0.20 at most.
 */
const PAGES: InventedPage[] = [
  aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
  { identity: { kind: 'table', tavola: null }, estimate: { reading: NO_ESTIMATE } },
  aTableSheet('3', [aTable([aRow('1', '41.03.001', 'VITE')])], { titleIt: 'VITERIA' }),
];

const UNREADABLE = 'Its Tavola number could not be read.';

describe('the pages a Catalog run set aside', () => {
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

  async function finishedRun(): Promise<CatalogRun> {
    const run = await estimated(administrator, model, 3);
    await start(administrator, run, { limit: 1 }).expect(202);
    return settled(administrator, run);
  }

  it('lists each with its reason, and serves its image to an Administrator', async () => {
    const run = await finishedRun();

    expect(run.state).toBe('finished');
    expect(run.tavole.map((tavola) => tavola.number)).toEqual(['1', '3']);
    expect(run.setAside).toEqual([
      { page: 2, reason: UNREADABLE, image: `/api/catalog-runs/${run.id}/set-aside/2` },
    ]);

    const response = await administrator.get(run.setAside[0]!.image).expect(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toMatch(/^private/);
    expect((await sharp(response.body as Buffer).metadata()).format).toBe('png');

    // Only the pages it set aside: not a page it read, and not one it never had.
    await administrator.get(`/api/catalog-runs/${run.id}/set-aside/1`).expect(404);
    await administrator.get(`/api/catalog-runs/${run.id}/set-aside/9`).expect(404);
    await administrator.get(`/api/catalog-runs/${run.id}/set-aside/two`).expect(400);
  });

  it('is not there for an Editor or a Member', async () => {
    const run = await finishedRun();
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await agent.get(`/api/catalog-runs/${run.id}`).expect(404);
      await agent.get(run.setAside[0]!.image).expect(404);
    }
  });

  it('is not asked about again when the run is continued, and is still listed', async () => {
    const run = await estimated(administrator, model, 3);
    await start(administrator, run, { limit: 0.35 }).expect(202);

    const stopped = await settled(administrator, run);
    expect(stopped.state).toBe('stopped-at-limit');
    expect(method.calls).toEqual([
      'identify 1',
      'identify 2',
      'identify 3',
      'read 1 1',
      'read 1 2',
    ]);
    expect(stopped.setAside.map(({ page, reason }) => [page, reason])).toEqual([[2, UNREADABLE]]);

    method.calls.length = 0;
    await carryOn(administrator, run, { limit: 1 }).expect(202);

    const finished = await settled(administrator, run);
    expect(finished.state).toBe('finished');
    expect(method.calls).toEqual(['read 3 1', 'read 3 2']);
    expect(finished.setAside.map(({ page, reason }) => [page, reason])).toEqual([[2, UNREADABLE]]);
    await administrator.get(finished.setAside[0]!.image).expect(200);
  });
});
