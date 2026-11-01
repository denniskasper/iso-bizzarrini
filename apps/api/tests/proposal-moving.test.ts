import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Proposal, ProposalKind, ProposalScreenshot } from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { reseedPracticeSystem } from '../src/catalog/practice-system.js';
import { accounts, proposals, proposalScreenshots, proposalTurns } from '../src/db/schema.js';
import { describeProposal, listNewProposals } from '../src/proposals/proposal-fetch.js';
import {
  exportProposals,
  importProposals,
  ProposalMoveError,
} from '../src/proposals/proposal-move.js';
import { createFileStore } from '../src/storage/file-store.js';
import { givenPhotographImage } from './support/fixtures.js';
import {
  A_GOOD_PASSWORD,
  givenAMember,
  givenAnAdministrator,
  type RecruitedMember,
} from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Proposals outlive the practice data and move between hosts** (issue #157). They are real
 * where everything around them on a practice system is invented, so re-seeding leaves them alone;
 * they are exported and imported, screenshots and all, when Integration moves; and the developer's
 * agent reads them from a command. Prior art: the practice archive tests.
 */

const execute = promisify(execFile);

/** The words an author wrote, with a line break kept, so "word for word" is tested as such. */
const AUTHORS_WORDS = 'The washer at 12 is missing.\nIt was there yesterday.';

async function aDraft(agent: TestAgent, kind: ProposalKind = 'fix'): Promise<string> {
  const started = await agent.post('/api/proposals').send({ kind, pageAddress: '/' }).expect(201);
  return (started.body.proposal as Proposal).id;
}

async function aScreenshot(agent: TestAgent, proposalId: string): Promise<ProposalScreenshot> {
  const shown = await agent
    .post(`/api/proposals/${proposalId}/screenshots`)
    .set('Content-Type', 'image/png')
    .send(await givenPhotographImage({ format: 'png' }))
    .expect(201);
  return shown.body.screenshot as ProposalScreenshot;
}

/** A turn, with screenshots sent with it, answered by the fake conversation. */
async function say(
  agent: TestAgent,
  proposalId: string,
  text: string,
  screenshots: { id: string; note?: string }[] = [],
): Promise<void> {
  await agent
    .post(`/api/proposals/${proposalId}/turns`)
    .send({ text, screenshots })
    .buffer(true)
    .parse((res, callback) => {
      res.on('data', () => undefined);
      res.on('end', () => callback(null, null));
    })
    .expect(200);
}

/** A Proposal talked through with a screenshot and its note, finished and handed over. */
async function aHandedOver(agent: TestAgent, kind: ProposalKind = 'fix'): Promise<string> {
  const id = await aDraft(agent, kind);
  const shot = await aScreenshot(agent, id);
  await say(agent, id, AUTHORS_WORDS, [{ id: shot.id, note: 'Circle 12, top left' }]);
  await agent.post(`/api/proposals/${id}/summary`).send({}).expect(200);
  await agent.post(`/api/proposals/${id}/hand-over`).expect(200);
  return id;
}

/** One request after another: a burst of them at once is reset under a loaded suite. */
async function inTurn<T, R>(items: T[], each: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await each(item));
  }
  return results;
}

/** Only an Account an Administrator has let propose reaches the Proposals at all. */
async function letPropose(administrator: TestAgent, member: RecruitedMember): Promise<void> {
  await administrator
    .patch(`/api/roster/${member.entry.id}`)
    .send({ mayPropose: true })
    .expect(200);
}

async function read(agent: TestAgent, proposalId: string): Promise<Proposal> {
  return (await agent.get(`/api/proposals/${proposalId}`).expect(200)).body.proposal as Proposal;
}

/** Every picture a Proposal shows, as the bytes a reader is served. */
async function pictures(agent: TestAgent, proposal: Proposal): Promise<Buffer[]> {
  const shots = [...proposal.turns.flatMap((turn) => turn.screenshots), ...proposal.unsent];
  const served: Buffer[] = [];
  for (const shot of shots) {
    served.push((await agent.get(shot.displayUrl).expect(200)).body as Buffer);
    served.push((await agent.get(shot.previewUrl).expect(200)).body as Buffer);
  }
  return served;
}

describe('Proposals on a practice system', () => {
  let app: TestApp;
  let directory: string;

  beforeAll(async () => {
    app = await startTestApp({ env: { PROPOSALS_METHOD: 'fake' } });
  });
  afterEach(async () => {
    await app.reset();
    await createFileStore(app.filesPath).remove('proposal-screenshots');
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  });
  afterAll(() => app.close());

  function fileStore() {
    return createFileStore(app.filesPath);
  }

  async function aProposer(administrator: TestAgent, email?: string): Promise<RecruitedMember> {
    const member = await givenAMember(app, administrator, email === undefined ? {} : { email });
    await letPropose(administrator, member);
    return member;
  }

  async function counts() {
    return {
      proposals: await app.db.$count(proposals),
      turns: await app.db.$count(proposalTurns),
      screenshots: await app.db.$count(proposalScreenshots),
    };
  }

  async function anExportDirectory(): Promise<string> {
    directory = await mkdtemp(join(tmpdir(), 'ricambi-proposals-'));
    return directory;
  }

  describe('re-seeding', () => {
    it('leaves every Proposal, its turns and its screenshots in place', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent);
      const handedOver = await aHandedOver(author.agent);
      const draft = await aDraft(author.agent);
      const waiting = await aScreenshot(author.agent, draft);
      await say(author.agent, draft, 'Half a thought.');
      const before = await read(author.agent, handedOver);
      const served = await pictures(author.agent, before);
      const held = await counts();

      await reseedPracticeSystem({
        db: app.db,
        fileStore: fileStore(),
        clock: app.clock,
        logger: app.logger,
        config: app.config,
        password: A_GOOD_PASSWORD,
      });

      expect(await counts()).toEqual(held);
      expect(held).toEqual({ proposals: 2, turns: 4, screenshots: 2 });
      // The Draft's screenshot is still on the volume, waiting, though nobody can reach it now.
      await stat(join(app.filesPath, 'proposal-screenshots', waiting.id));

      // The roster is the invented one now, and its Administrator, let propose, reads the
      // handed-over Proposal as it was, pictures and all.
      await app.db
        .update(accounts)
        .set({ mayPropose: true })
        .where(eq(accounts.email, 'ada@example.invalid'));
      const ada = await app.memberAgent({
        email: 'ada@example.invalid',
        password: A_GOOD_PASSWORD,
      });
      const after = await read(ada, handedOver);
      expect(after).toEqual({ ...before, mine: false });
      expect(await pictures(ada, after)).toEqual(served);
    });
  });

  describe('moving between hosts', () => {
    it('yields the same Proposals, statuses, turns and screenshots on the other side', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent, 'author@club.example');

      await letPropose(administrator.agent, administrator);

      const takenUp = await aHandedOver(author.agent);
      await administrator.agent
        .patch(`/api/proposals/${takenUp}`)
        .send({ status: 'taken-up' })
        .expect(200);
      const declined = await aHandedOver(author.agent, 'idea');
      await administrator.agent
        .patch(`/api/proposals/${declined}`)
        .send({ status: 'declined', reason: 'Not for now.' })
        .expect(200);
      const draft = await aDraft(author.agent);
      const sent = await aScreenshot(author.agent, draft);
      await say(author.agent, draft, 'Look at this.', [{ id: sent.id }]);
      await aScreenshot(author.agent, draft);

      const ids = [takenUp, declined, draft];
      const before = await inTurn(ids, (id) => read(author.agent, id));
      const served = await inTurn(before, (proposal) => pictures(author.agent, proposal));

      const into = await anExportDirectory();
      expect(await exportProposals({ db: app.db, fileStore: fileStore() }, into)).toEqual({
        proposals: 3,
        turns: 6,
        screenshots: 4,
      });

      // The other host: nothing on it but an Account with the author's address.
      await app.reset();
      await fileStore().remove('proposal-screenshots');
      const elsewhere = await givenAnAdministrator(app);
      const again = await aProposer(elsewhere.agent, 'author@club.example');

      await importProposals({ db: app.db, fileStore: fileStore() }, into);

      const after = await inTurn(ids, (id) => read(again.agent, id));
      expect(after).toEqual(before);
      expect(after.map((proposal) => proposal.status)).toEqual(['taken-up', 'declined', 'draft']);
      expect(after[1]?.declineReason).toBe('Not for now.');
      expect(await inTurn(after, (proposal) => pictures(again.agent, proposal))).toEqual(served);
    });

    it('stands a Proposal whose author has no Account there without one', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent);
      const handedOver = await aHandedOver(author.agent);
      const into = await anExportDirectory();
      await exportProposals({ db: app.db, fileStore: fileStore() }, into);

      await app.reset();
      await fileStore().remove('proposal-screenshots');
      await importProposals({ db: app.db, fileStore: fileStore() }, into);

      const elsewhere = await givenAnAdministrator(app);
      const reader = await aProposer(elsewhere.agent);
      expect(await read(reader.agent, handedOver)).toMatchObject({
        id: handedOver,
        status: 'new',
        mine: false,
      });
    });

    it('makes the directory it is told to export into', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent);
      const draft = await aDraft(author.agent);
      const into = join(await anExportDirectory(), 'not-made-yet');

      expect(await exportProposals({ db: app.db, fileStore: fileStore() }, into)).toEqual({
        proposals: 1,
        turns: 0,
        screenshots: 0,
      });

      await app.reset();
      await importProposals({ db: app.db, fileStore: fileStore() }, into);
      const [imported] = await app.db.select({ id: proposals.id }).from(proposals);
      expect(imported?.id).toBe(draft);
    });

    it('refuses to import over Proposals already there, and writes nothing', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent);
      await aHandedOver(author.agent);
      const into = await anExportDirectory();
      await exportProposals({ db: app.db, fileStore: fileStore() }, into);
      const held = await counts();

      await expect(importProposals({ db: app.db, fileStore: fileStore() }, into)).rejects.toThrow(
        ProposalMoveError,
      );
      expect(await counts()).toEqual(held);

      // Nor is an export written over.
      await expect(exportProposals({ db: app.db, fileStore: fileStore() }, into)).rejects.toThrow(
        ProposalMoveError,
      );
    });
  });

  describe('fetching, for the developer’s agent', () => {
    it('lists the New Proposals and no others', async () => {
      const administrator = await givenAnAdministrator(app);
      await letPropose(administrator.agent, administrator);
      const author = await aProposer(administrator.agent);
      const fix = await aHandedOver(author.agent, 'fix');
      const idea = await aHandedOver(author.agent, 'idea');
      const takenUp = await aHandedOver(author.agent);
      await administrator.agent
        .patch(`/api/proposals/${takenUp}`)
        .send({ status: 'taken-up' })
        .expect(200);
      const draft = await aDraft(author.agent);

      const listed = await listNewProposals(app.db);
      const lines = listed.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines.join('\n')).toContain(`${fix}  Fix  2026-`);
      expect(lines.join('\n')).toContain('A practice Fix');
      expect(lines.join('\n')).toContain(`${idea}  Idea  `);
      expect(listed).not.toContain(takenUp);
      expect(listed).not.toContain(draft);

      await app.reset();
      expect(await listNewProposals(app.db)).toBe('No New Proposals.\n');
    });

    it('prints one with its summary, the author’s words and where its screenshots are', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent);
      const id = await aHandedOver(author.agent);
      const [shot] = (await read(author.agent, id)).turns[0]?.screenshots ?? [];

      const printed = await describeProposal({ db: app.db, storagePath: app.filesPath }, id);
      if (printed === null) {
        throw new Error('A handed-over Proposal was not printed.');
      }

      expect(printed).toContain('# A practice Fix');
      expect(printed).toContain('- Status: New');
      expect(printed).toContain(
        '## What happened\n\nSomething on the page did not work as it should.',
      );
      expect(printed).toContain('1. Open the page the Proposal was started on.');
      expect(printed).toContain(
        '## The author’s words\n\n> The washer at 12 is missing.\n> It was there yesterday.',
      );

      const location = printed.match(/^1\. (\/.*proposal-screenshots\/.*)$/m)?.[1];
      expect(location).toContain(shot?.id);
      expect((await stat(location ?? '')).isFile()).toBe(true);
      expect(printed).toContain('   Note: Circle 12, top left');

      // A Draft is its author's alone, here as on every screen.
      const draft = await aDraft(author.agent);
      expect(await describeProposal({ db: app.db, storagePath: app.filesPath }, draft)).toBeNull();
      expect(
        await describeProposal({ db: app.db, storagePath: app.filesPath }, 'not-a-proposal'),
      ).toBeNull();
    });
  });

  describe('an author’s erasure', () => {
    it('takes their Drafts and their screenshots, and leaves what they handed over', async () => {
      const administrator = await givenAnAdministrator(app);
      const author = await aProposer(administrator.agent);
      const handedOver = await aHandedOver(author.agent);
      const draft = await aDraft(author.agent);
      const shot = await aScreenshot(author.agent, draft);

      await administrator.agent.delete(`/api/roster/${author.entry.id}`).expect(200);

      const left = await app.db.select({ id: proposals.id }).from(proposals);
      expect(left.map((row) => row.id)).toEqual([handedOver]);
      await expect(stat(join(app.filesPath, 'proposal-screenshots', shot.id))).rejects.toThrow();
    });
  });
});

/**
 * **Each command refuses Production** (ADR 0012): it is started here as an operator would start
 * it, in an environment that says it is Production, and refuses before it reaches a database.
 */
describe('the commands, in Production', () => {
  const production = {
    PATH: process.env.PATH ?? '',
    ENVIRONMENT_MODE: 'production',
    ENVIRONMENT_NAME: 'archive',
    PUBLIC_URL: 'https://ricambi.example',
    DATABASE_URL: 'postgres://nowhere.invalid/never-reached',
    SESSION_SECRET: 'a-session-secret-long-enough-for-the-schema',
    // Each command reads the repository's `.env` and keeps only what is not already set here.
    // A developer's file may turn on dev sign-in, a logged inbox or a Proposals key, and
    // production refuses each of those before it reaches the refusal these tests are about. So
    // all three are set here to what a properly configured production has.
    DEV_SIGN_IN_AS: '',
    EMAIL_TRANSPORT: 'none',
    PROPOSALS_ANTHROPIC_API_KEY: '',
  };

  it.each([
    ['export-proposals.ts', ['--to', join(tmpdir(), 'never-written')]],
    ['import-proposals.ts', ['--from', join(tmpdir(), 'never-read')]],
    ['fetch-proposals.ts', []],
  ])('%s refuses', async (command, args) => {
    const run = execute(
      process.execPath,
      ['--import', 'tsx', join(import.meta.dirname, '..', 'src', 'cli', command), ...args],
      { env: production, timeout: 30_000 },
    );
    await expect(run).rejects.toMatchObject({
      stderr: expect.stringContaining('Proposals belong to practice systems'),
    });
  });
});
