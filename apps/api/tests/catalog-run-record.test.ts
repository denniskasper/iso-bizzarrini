import type { CatalogRunResponse, CatalogRunsResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfiguredReading } from '../src/composition/reading.js';
import type { ModelRow } from '../src/db/schema.js';
import { PRICE_LIST } from '../src/reading/price-list.js';
import {
  aRow,
  aTable,
  aTableSheet,
  fakeReadingMethod,
  type InventedPage,
} from './support/catalog-reading.js';
import { configured, estimated, settled, start } from './support/catalog-run.js';
import { givenModel } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **The record of every Catalog run** (issue #62): what `cost.json` held, kept in the database and
 * shown in Ricambi, and the list of past runs that opens each one.
 *
 * Every request but a translation takes 5,000 tokens in and 1,000 out: $0.04 at the price list's
 * $4 and $20 a million. Translating a Tavola takes 2,500 in and 500 out: $0.02. Each Tavola below
 * is one Table sheet, asked what it is, read twice and translated, so it costs $0.14.
 */
const PAGES: InventedPage[] = [
  aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
  aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
];

const TRANSLATION = { input: 2500, output: 500 };
const REQUEST = { input: 5000, output: 1000, cost: 0.04 };

function sheet(page: number) {
  return {
    page,
    kind: 'table',
    cost: 0.12,
    identification: REQUEST,
    readings: [
      { reading: 1, ...REQUEST },
      { reading: 2, ...REQUEST },
    ],
    marks: [],
  };
}

describe('the record of a Catalog run', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    app = await startTestApp({
      reading: configured(fakeReadingMethod(PAGES, { translationTokens: TRANSLATION })),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta', series: 'GT' });
  });

  it('holds what each Tavola, sheet, Reading and translation cost, at the price list', async () => {
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);

    const finished = await settled(administrator, run);

    expect(finished).toMatchObject({
      state: 'finished',
      readingMethod: 'api-key',
      charged: true,
      estimate: 0.24,
      limit: 1,
      spent: 0.28,
      priceList: { model: 'claude-opus-5-5', checkedOn: PRICE_LIST.checkedOn },
    });
    expect(finished.costs).toEqual([
      {
        time: 1,
        priceList: {
          model: 'claude-opus-5-5',
          inputPerMillion: 4,
          outputPerMillion: 20,
          currency: 'USD',
          checkedOn: PRICE_LIST.checkedOn,
        },
        limit: 1,
        estimate: 0.24,
        total: 0.28,
        stopped: null,
        tavole: [
          {
            number: '1',
            finished: true,
            cost: 0.14,
            sheets: [sheet(1)],
            translation: { ...TRANSLATION, cost: 0.02 },
          },
          {
            number: '2',
            finished: true,
            cost: 0.14,
            sheets: [sheet(2)],
            translation: { ...TRANSLATION, cost: 0.02 },
          },
        ],
        setAside: [],
        cutOff: [],
      },
    ]);
    expect(finished.actions).toEqual([
      expect.objectContaining({ action: 'started', limit: 1, by: expect.anything() }),
    ]);
  });

  it('lists past runs, the latest first, each with what it opens', async () => {
    const other = await givenModel(app.db, { brand: 'Iso', name: 'Grifo', series: null });
    const first = await estimated(administrator, model);
    await start(administrator, first, { limit: 1 }).expect(202);
    await settled(administrator, first);
    app.clock.advanceBy(60_000);
    const second = await estimated(administrator, other, 1);

    const response = await administrator.get('/api/catalog-runs').expect(200);

    const { runs } = response.body as CatalogRunsResponse;
    expect(runs).toEqual([
      {
        id: second.id,
        model: { id: other.id, brand: 'Iso', name: 'Grifo', series: null },
        state: 'estimated',
        createdAt: second.createdAt,
        startedAt: null,
        spent: 0,
        estimate: 0.12,
        readingMethod: 'api-key',
        charged: true,
        readsAgain: null,
      },
      expect.objectContaining({
        id: first.id,
        state: 'finished',
        spent: 0.28,
        readingMethod: 'api-key',
      }),
    ]);
    const opened = await administrator.get(`/api/catalog-runs/${runs[1]?.id}`).expect(200);
    expect((opened.body as CatalogRunResponse).run.costs).toHaveLength(1);
  });

  it('is not there for an Editor or a Member', async () => {
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);
    await settled(administrator, run);
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await agent.get('/api/catalog-runs').expect(404);
      await agent.get(`/api/catalog-runs/${run.id}`).expect(404);
    }
  });
});

describe('the record of a Catalog run read on a subscription', () => {
  let app: TestApp;

  beforeAll(async () => {
    const method = fakeReadingMethod(PAGES, { charged: false, translationTokens: TRANSLATION });
    app = await startTestApp({
      reading: { ...configured(method), kind: 'subscription' } satisfies ConfiguredReading,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is not charged, and says what it would have cost at list prices', async () => {
    await app.reset();
    const administrator = (await givenAnAdministrator(app)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta', series: 'GT' });
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);

    const finished = await settled(administrator, run);

    expect(finished).toMatchObject({
      readingMethod: 'subscription',
      charged: false,
      spent: 0.28,
    });
    expect(finished.costs[0]?.total).toBe(0.28);
    expect(finished.costs[0]?.tavole.map((tavola) => tavola.cost)).toEqual([0.14, 0.14]);
  });
});
