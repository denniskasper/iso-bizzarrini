import type { Proposal, SpendingMonth, SpendingResponse } from '@ricambi/contracts';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type TestAgent from 'supertest/lib/agent.js';
import { describe, expect, it } from 'vitest';
import { ConfigurationError, loadConfig } from '../src/config/config.js';
import { createDatabase } from '../src/db/client.js';
import { migrationsFolder } from '../src/db/migrate.js';
import type {
  ConversationMethod,
  ConversationUsage,
} from '../src/proposals/conversation-method.js';
import { FAKE_SUMMARY } from '../src/proposals/fake-conversation-method.js';
import { givenAMember, givenAnAdministrator, givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';
import { testDatabaseUrl, workerSchemaName } from './support/test-database.js';

/**
 * **What Ricambi has spent on Claude, against the Monthly limit** (issue #189): one request, an
 * Administrator's alone, saying this month, what it was for, the last twelve months, the limit as
 * Ricambi is told it, and whether any of it was billed. Proposals' conversations are its first
 * purpose; the conversation is a fake that says what each request cost, so nothing talks to a
 * model.
 */

/** A conversation billed by the request, whose every answer costs a dime. */
const billedConversation: ConversationMethod = {
  name: 'A conversation billed by the request',
  priced: true,
  billed: true,
  async *answer(_conversation, used) {
    used?.(usage(0.1));
    yield 'Noted.';
  },
  async summarise(conversation) {
    return FAKE_SUMMARY[conversation.kind];
  },
};

function usage(estimatedUsd: number): ConversationUsage {
  return {
    request: 'answer',
    model: 'claude-sonnet-5-5',
    inputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    estimatedUsd,
  };
}

const SETTINGS = {
  NODE_ENV: 'test',
  ENVIRONMENT_NAME: 'test',
  DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
};

async function startedWith(
  env: Record<string, string>,
  method: ConversationMethod = billedConversation,
): Promise<TestApp> {
  return startTestApp({ env, conversation: { method, unavailable: null } });
}

async function anAdministratorWhoProposes(app: TestApp): Promise<TestAgent> {
  const administrator = await givenAnAdministrator(app);
  await administrator.agent
    .patch(`/api/roster/${administrator.entry.id}`)
    .send({ mayPropose: true })
    .expect(200);
  return administrator.agent;
}

async function aDraft(agent: TestAgent): Promise<string> {
  const started = await agent.post('/api/proposals').send({ kind: 'fix', pageAddress: '/' });
  expect(started.status).toBe(201);
  return (started.body.proposal as Proposal).id;
}

/** One answer, which the conversation above prices at a dime. */
async function converse(agent: TestAgent, proposalId: string): Promise<void> {
  await agent
    .post(`/api/proposals/${proposalId}/turns`)
    .send({ text: 'The numbers are hard to read.', screenshots: [] })
    .buffer(true)
    .parse((res, callback) => {
      res.on('data', () => undefined);
      res.on('end', () => callback(null, null));
    })
    .expect(200);
}

async function spending(agent: TestAgent): Promise<SpendingResponse> {
  return (await agent.get('/api/spending').expect(200)).body as SpendingResponse;
}

function month(name: string, proposalConversations: number, billed: boolean): SpendingMonth {
  return {
    month: name,
    byPurpose: { 'proposal-conversations': proposalConversations, 'catalog-runs': 0 },
    totalUsd: proposalConversations,
    billed,
  };
}

describe('Spending', () => {
  it('says this month, what it was for, the last twelve months and the Monthly limit', async () => {
    const app = await startedWith({ ANTHROPIC_MONTHLY_LIMIT_USD: '100' });
    try {
      const administrator = await anAdministratorWhoProposes(app);
      app.clock.setTo(new Date('2026-03-10T12:00:00.000Z'));

      // Two answers this month, on a Draft then discarded: still paid for, so still counted.
      const discarded = await aDraft(administrator);
      await converse(administrator, discarded);
      await converse(administrator, discarded);
      await administrator.delete(`/api/proposals/${discarded}`).expect(204);
      // One in January, and one thirteen months back, which is no longer among the twelve.
      app.clock.setTo(new Date('2026-01-20T12:00:00.000Z'));
      await converse(administrator, await aDraft(administrator));
      app.clock.setTo(new Date('2025-02-20T12:00:00.000Z'));
      await converse(administrator, await aDraft(administrator));
      app.clock.setTo(new Date('2026-03-10T12:00:00.000Z'));

      const seen = await spending(administrator);
      expect(seen.thisMonth).toEqual(month('2026-03', 0.2, true));
      expect(seen.monthlyLimitUsd).toBe(100);
      expect(seen.months).toHaveLength(12);
      expect(seen.months.map((row) => row.month)).toEqual([
        '2026-03',
        '2026-02',
        '2026-01',
        '2025-12',
        '2025-11',
        '2025-10',
        '2025-09',
        '2025-08',
        '2025-07',
        '2025-06',
        '2025-05',
        '2025-04',
      ]);
      expect(seen.months[0]).toEqual(month('2026-03', 0.2, true));
      expect(seen.months[1]).toEqual(month('2026-02', 0, true));
      expect(seen.months[2]).toEqual(month('2026-01', 0.1, true));
    } finally {
      await app.close();
    }
  });

  it('counts by the calendar month in UTC', async () => {
    const app = await startTestApp({
      now: new Date('2026-04-30T23:00:00.000Z'),
      conversation: { method: billedConversation, unavailable: null },
    });
    try {
      const administrator = await anAdministratorWhoProposes(app);
      const id = await aDraft(administrator);
      // The last minute of April in UTC, already May in Rome; then the first of May in UTC.
      app.clock.setTo(new Date('2026-04-30T23:59:00.000Z'));
      await converse(administrator, id);
      app.clock.setTo(new Date('2026-05-01T00:00:00.000Z'));
      await converse(administrator, id);
      await converse(administrator, id);

      const seen = await spending(administrator);
      expect(seen.thisMonth.month).toBe('2026-05');
      expect(seen.thisMonth.totalUsd).toBe(0.2);
      expect(seen.months[1]).toEqual(month('2026-04', 0.1, true));
    } finally {
      await app.close();
    }
  });

  it('says no Monthly limit is known where Ricambi is not told one', async () => {
    const app = await startedWith({});
    try {
      const administrator = await givenAnAdministrator(app);
      expect((await spending(administrator.agent)).monthlyLimitUsd).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('says nothing was billed where nothing here is billed by the request', async () => {
    // The practice conversation, and no Reading method: whatever is priced would have cost.
    const app = await startTestApp({ env: { PROPOSALS_METHOD: 'fake' } });
    try {
      const administrator = await anAdministratorWhoProposes(app);
      await converse(administrator, await aDraft(administrator));

      const seen = await spending(administrator);
      expect(seen.thisMonth).toEqual(month('2026-01', 0, false));
      expect(seen.months.every((row) => !row.billed)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('is refused to anybody but an Administrator', async () => {
    const app = await startedWith({ ANTHROPIC_MONTHLY_LIMIT_USD: '100' });
    try {
      const administrator = await givenAnAdministrator(app);
      const member = await givenAMember(app, administrator.agent);
      await administrator.agent
        .patch(`/api/roster/${member.entry.id}`)
        .send({ mayPropose: true })
        .expect(200);
      const editor = await givenAnEditor(app);

      await app.request().get('/api/spending').expect(401);
      await member.agent.get('/api/spending').expect(404);
      await editor.get('/api/spending').expect(404);
    } finally {
      await app.close();
    }
  });
});

describe('the Monthly limit setting', () => {
  it('is read from ANTHROPIC_MONTHLY_LIMIT_USD, and is optional', () => {
    expect(loadConfig({ ...SETTINGS, ANTHROPIC_MONTHLY_LIMIT_USD: '100' }).monthlyLimitUsd).toBe(
      100,
    );
    expect(loadConfig(SETTINGS).monthlyLimitUsd).toBeNull();
    expect(loadConfig({ ...SETTINGS, ANTHROPIC_MONTHLY_LIMIT_USD: '' }).monthlyLimitUsd).toBeNull();
  });

  it('refuses the old name, naming the new one, so no limit is quietly lost', () => {
    const load = () => loadConfig({ ...SETTINGS, PROPOSALS_MONTHLY_LIMIT_USD: '100' });
    expect(load).toThrow(ConfigurationError);
    expect(load).toThrow(/ANTHROPIC_MONTHLY_LIMIT_USD/);
  });
});

describe('months recorded for Proposals before Spending', () => {
  it('are kept, as Proposals’ conversations billed by the request', async () => {
    // The migrations up to the one before Spending, in a schema of this test's own.
    const schema = `${workerSchemaName()}_before_spending`;
    const before = await mkdtemp(join(tmpdir(), 'ricambi-migrations-'));
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    const upTo = journal.entries.findIndex((entry) => entry.tag.startsWith('0040_'));
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
        sql`INSERT INTO proposal_monthly_costs (month, estimated_cost_micro_usd)
            VALUES ('2026-09', 1250000), ('2026-10', 350000)`,
      );

      await migrate(database.db, { migrationsFolder, migrationsSchema: schema });

      const rows = await database.db.execute(
        sql`SELECT month, purpose, billed, estimated_cost_micro_usd::int AS micro_usd
            FROM monthly_spending ORDER BY month`,
      );
      expect(rows.rows).toEqual([
        { month: '2026-09', purpose: 'proposal-conversations', billed: true, micro_usd: 1250000 },
        { month: '2026-10', purpose: 'proposal-conversations', billed: true, micro_usd: 350000 },
      ]);
    } finally {
      await database.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await database.close();
      await rm(before, { recursive: true, force: true });
    }
  });
});
