import type { MonthlyLimitLeftResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { monthlySpending } from '../src/db/schema.js';
import { aRow, aTable, aTableSheet, type InventedPage } from './support/catalog-reading.js';
import { configured, estimated, heldReadingMethod, settled, start } from './support/catalog-run.js';
import { givenModel } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator, givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **What is left of this month's Monthly limit** (issue #192), for the screens that start and
 * continue a Catalog run: the Monthly limit less what was billed this month, from the same record
 * Spending reads. Only a warning is made of it; a run given more is still started.
 *
 * Page 1 is a Table sheet of Tavola 1 and page 2 one of Tavola 2, and every request costs $0.04
 * (`support/catalog-reading.ts`): both pages asked about and each read twice, $0.24 in all.
 */
function catalog(): InventedPage[] {
  return [
    aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
    aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
  ];
}

async function startedWith(options: {
  monthlyLimit?: string;
  charged?: boolean;
  reading?: boolean;
}): Promise<TestApp> {
  const { monthlyLimit, charged = true, reading = true } = options;
  return startTestApp({
    now: new Date('2026-03-10T12:00:00.000Z'),
    env: monthlyLimit === undefined ? {} : { ANTHROPIC_MONTHLY_LIMIT_USD: monthlyLimit },
    ...(reading ? { reading: configured(heldReadingMethod(catalog(), { charged })) } : {}),
  });
}

async function left(agent: TestAgent): Promise<MonthlyLimitLeftResponse['left']> {
  return ((await agent.get('/api/spending/left').expect(200)).body as MonthlyLimitLeftResponse)
    .left;
}

describe('what is left of the Monthly limit', () => {
  it('is the Monthly limit less what was billed this month, and starting more is allowed', async () => {
    const app = await startedWith({ monthlyLimit: '0.5' });
    try {
      const administrator = (await givenAnAdministrator(app)).agent;
      expect(await left(administrator)).toEqual({
        month: '2026-03',
        monthlyLimitUsd: 0.5,
        spentUsd: 0,
        leftUsd: 0.5,
      });

      // Last month's spending, and this month's that was only priced, leave this month alone.
      await app.db.insert(monthlySpending).values([
        { month: '2026-02', purpose: 'catalog-runs', billed: true, estimatedCostMicroUsd: 400_000 },
        {
          month: '2026-03',
          purpose: 'proposal-conversations',
          billed: false,
          estimatedCostMicroUsd: 300_000,
        },
      ]);
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
      const run = await estimated(administrator, model);
      await start(administrator, run, { limit: 1 }).expect(202);
      expect(await settled(administrator, run)).toMatchObject({ state: 'finished', spent: 0.24 });

      expect(await left(administrator)).toEqual({
        month: '2026-03',
        monthlyLimitUsd: 0.5,
        spentUsd: 0.24,
        leftUsd: 0.26,
      });

      // A second run given more than is left is started all the same.
      const second = await estimated(administrator, model);
      await start(administrator, second, { limit: 1 }).expect(202);
      expect(await settled(administrator, second)).toMatchObject({ state: 'finished' });
    } finally {
      await app.close();
    }
  });

  it('is nothing, not less than nothing, once the month has spent past the limit', async () => {
    const app = await startedWith({ monthlyLimit: '0.1' });
    try {
      const administrator = (await givenAnAdministrator(app)).agent;
      await app.db.insert(monthlySpending).values({
        month: '2026-03',
        purpose: 'proposal-conversations',
        billed: true,
        estimatedCostMicroUsd: 250_000,
      });
      expect(await left(administrator)).toEqual({
        month: '2026-03',
        monthlyLimitUsd: 0.1,
        spentUsd: 0.25,
        leftUsd: 0,
      });
    } finally {
      await app.close();
    }
  });

  it('is not said without a Monthly limit', async () => {
    const app = await startedWith({});
    try {
      expect(await left((await givenAnAdministrator(app)).agent)).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('is not said where the Reading method is not billed', async () => {
    const subscription = await startedWith({ monthlyLimit: '100', charged: false });
    try {
      expect(await left((await givenAnAdministrator(subscription)).agent)).toBeNull();
    } finally {
      await subscription.close();
    }
    const none = await startedWith({ monthlyLimit: '100', reading: false });
    try {
      expect(await left((await givenAnAdministrator(none)).agent)).toBeNull();
    } finally {
      await none.close();
    }
  });

  it('is refused to anybody but an Administrator', async () => {
    const app = await startedWith({ monthlyLimit: '100' });
    try {
      const administrator = await givenAnAdministrator(app);
      const member = await givenAMember(app, administrator.agent);
      const editor = await givenAnEditor(app);

      await app.request().get('/api/spending/left').expect(401);
      await member.agent.get('/api/spending/left').expect(404);
      await editor.get('/api/spending/left').expect(404);
    } finally {
      await app.close();
    }
  });
});
