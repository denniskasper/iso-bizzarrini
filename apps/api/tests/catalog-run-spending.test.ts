import type { SpendingResponse } from '@ricambi/contracts';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { migrationsFolder } from '../src/db/migrate.js';
import { catalogRuns, type ModelRow } from '../src/db/schema.js';
import { aRow, aTable, aTableSheet, type InventedPage } from './support/catalog-reading.js';
import { configured, estimated, heldReadingMethod, settled, start } from './support/catalog-run.js';
import { givenModel } from './support/fixtures.js';
import { givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';
import { testDatabaseUrl, workerSchemaName } from './support/test-database.js';

/**
 * **A Catalog run's spending, on Spending, in the month it was spent** (issue #191).
 *
 * Page 1 is a Table sheet of Tavola 1 and page 2 one of Tavola 2, and every request costs $0.04
 * (`support/catalog-reading.ts`): both pages asked about and each read twice, $0.24 in all. Read
 * again, Tavola 1 costs its two Readings, $0.08.
 */
function catalog(): InventedPage[] {
  return [
    aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
    aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
  ];
}

async function spending(agent: TestAgent): Promise<SpendingResponse> {
  return (await agent.get('/api/spending').expect(200)).body as SpendingResponse;
}

function catalogRunsIn(seen: SpendingResponse, month: string) {
  const found = seen.months.find((row) => row.month === month);
  return { catalogRuns: found?.byPurpose['catalog-runs'], billed: found?.billed };
}

describe('a Catalog run on Spending', () => {
  let app: TestApp;
  let method: ReturnType<typeof heldReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    method = heldReadingMethod(catalog());
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    method.calls.length = 0;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
  });

  /** The clock set to `now`, and an Administrator signed in then, whose session has not lapsed. */
  async function at(now: string): Promise<void> {
    app.clock.setTo(new Date(now));
    administrator = (await givenAnAdministrator(app)).agent;
  }

  it('counts beside Proposals’ conversations, billed, and in this month’s total', async () => {
    await at('2026-03-10T12:00:00.000Z');
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);
    expect(await settled(administrator, run)).toMatchObject({ state: 'finished', spent: 0.24 });

    const seen = await spending(administrator);
    expect(seen.thisMonth).toEqual({
      month: '2026-03',
      byPurpose: { 'proposal-conversations': 0, 'catalog-runs': 0.24 },
      totalUsd: 0.24,
      billed: true,
    });
  });

  it('counts in each month a run crossing the month spent in, adding up to its own total', async () => {
    await at('2026-04-30T23:58:00.000Z');
    const run = await estimated(administrator, model);
    const hold = method.holdAt('read 2 1');
    await start(administrator, run, { limit: 1 }).expect(202);
    await hold.reached;
    // Tavola 1 was answered in the last minutes of April, UTC; Tavola 2 is answered in May.
    app.clock.setTo(new Date('2026-05-01T00:00:00.000Z'));
    hold.release();
    const finished = await settled(administrator, run);
    expect(finished).toMatchObject({ state: 'finished', spent: 0.24 });

    const seen = await spending(administrator);
    expect(catalogRunsIn(seen, '2026-04')).toEqual({ catalogRuns: 0.16, billed: true });
    expect(catalogRunsIn(seen, '2026-05')).toEqual({ catalogRuns: 0.08, billed: true });
  });

  it('leaves every month as it was when a Tavola is read again, or a run deleted', async () => {
    await at('2026-06-10T12:00:00.000Z');
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);
    const finished = await settled(administrator, run);
    const tavolaId = finished.tavole.find((tavola) => tavola.number === '1')?.tavolaId;

    await at('2026-07-10T12:00:00.000Z');
    const again = (
      await administrator.post('/api/catalog-runs/read-again').send({ tavolaId }).expect(201)
    ).body.run as typeof run;
    const readAgain = await settled(administrator, await estimatedAgain(administrator, again));
    expect(readAgain).toMatchObject({ state: 'finished', spent: 0.08 });

    const before = await spending(administrator);
    expect(catalogRunsIn(before, '2026-06').catalogRuns).toBe(0.24);
    expect(catalogRunsIn(before, '2026-07').catalogRuns).toBe(0.08);

    await app.db.delete(catalogRuns);
    expect(await spending(administrator)).toEqual(before);
  });

  /** A run reading a Tavola again, estimated, then started. */
  async function estimatedAgain(agent: TestAgent, run: { id: string }) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const response = await agent.get(`/api/catalog-runs/${run.id}`).expect(200);
      if (response.body.run.state !== 'estimating') {
        await start(agent, response.body.run, { limit: 1 }).expect(202);
        return response.body.run;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Catalog run ${run.id} was still estimating.`);
  }
});

describe('a Catalog run on a subscription, on Spending', () => {
  it('counts as what it would have cost, not billed', async () => {
    const method = heldReadingMethod(catalog(), { charged: false });
    const app = await startTestApp({
      reading: configured(method),
      env: { PROPOSALS_METHOD: 'fake' },
      now: new Date('2026-03-10T12:00:00.000Z'),
    });
    try {
      const administrator = (await givenAnAdministrator(app)).agent;
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
      const run = await estimated(administrator, model);
      await start(administrator, run, { limit: 1 }).expect(202);
      expect(await settled(administrator, run)).toMatchObject({ state: 'finished', spent: 0.24 });

      expect(catalogRunsIn(await spending(administrator), '2026-03')).toEqual({
        catalogRuns: 0.24,
        billed: false,
      });
    } finally {
      await app.close();
    }
  });
});

describe('Catalog runs from before they counted by month', () => {
  it('are counted once, in the month each started, billed or not as each was', async () => {
    // The migrations up to the one before this, in a schema of this test's own.
    const schema = `${workerSchemaName()}_before_catalog_spending`;
    const before = await mkdtemp(join(tmpdir(), 'ricambi-migrations-'));
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    const upTo = journal.entries.findIndex((entry) => entry.tag.startsWith('0042_'));
    const kept = journal.entries.slice(0, upTo);
    await mkdir(join(before, 'meta'));
    await writeFile(
      join(before, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: kept }),
    );
    for (const file of await readdir(migrationsFolder)) {
      if (kept.some((entry) => file === `${entry.tag}.sql`)) {
        await copyFile(join(migrationsFolder, file), join(before, file));
      }
    }

    const maintenance = createDatabase(testDatabaseUrl(), { maxConnections: 1 });
    await maintenance.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
    await maintenance.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));
    await maintenance.close();
    const database = createDatabase(testDatabaseUrl(), { searchPath: schema, maxConnections: 1 });
    try {
      await migrate(database.db, { migrationsFolder: before, migrationsSchema: schema });
      await database.db.execute(
        sql`INSERT INTO models (id, brand, name)
            VALUES ('00000000-0000-4000-8000-000000000001', 'Iso', 'Rivolta')`,
      );
      // Started on 30 September and continued into October: all of it September's, since
      // nothing finer is known. One on a subscription; one never started, which spent nothing.
      const run = (id: string, charged: boolean, spent: number, startedAt: string | null) =>
        sql`INSERT INTO catalog_runs (id, model_id, state, catalog_key, catalog_byte_size,
              catalog_pages, first_page, last_page, reading_method, charged, priced_model,
              prices_checked_on, estimate, created_at, spending_limit, spent, started_at)
            VALUES (${id}, '00000000-0000-4000-8000-000000000001',
              ${startedAt ? 'finished' : 'estimated'}, 'catalog.pdf', 1, 2, 1, 2, 'api-key',
              ${charged}, 'claude-sonnet-5-5', '2026-09-01', 1, '2026-09-29T08:00:00Z',
              ${startedAt ? 5 : null}, ${spent}, ${startedAt})`;
      await database.db.execute(
        run('00000000-0000-4000-8000-000000000011', true, 1.25, '2026-09-30T22:30:00Z'),
      );
      await database.db.execute(
        run('00000000-0000-4000-8000-000000000012', true, 0.5, '2026-10-02T09:00:00Z'),
      );
      await database.db.execute(
        run('00000000-0000-4000-8000-000000000013', false, 0.333333, '2026-10-03T09:00:00Z'),
      );
      await database.db.execute(run('00000000-0000-4000-8000-000000000014', true, 0, null));

      await migrate(database.db, { migrationsFolder, migrationsSchema: schema });

      const rows = await database.db.execute(
        sql`SELECT month, purpose, billed, estimated_cost_micro_usd::int AS micro_usd
            FROM monthly_spending ORDER BY month, billed`,
      );
      expect(rows.rows).toEqual([
        { month: '2026-09', purpose: 'catalog-runs', billed: true, micro_usd: 1250000 },
        { month: '2026-10', purpose: 'catalog-runs', billed: false, micro_usd: 333333 },
        { month: '2026-10', purpose: 'catalog-runs', billed: true, micro_usd: 500000 },
      ]);
    } finally {
      await database.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await database.close();
      await rm(before, { recursive: true, force: true });
    }
  });
});
