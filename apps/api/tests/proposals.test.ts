import type {
  Proposal,
  ProposalAnswerEvent,
  ProposalKind,
  ProposalScreenshot,
  ProposalsResponse,
  RosterEntry,
  SessionResponse,
} from '@ricambi/contracts';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureConversation } from '../src/composition/conversation.js';
import { findMachineLogin } from '../src/composition/machine-login.js';
import { loadConfig } from '../src/config/config.js';
import {
  ConversationPausedError,
  ConversationUnavailableError,
  type Conversation,
  type ConversationMethod,
  type ConversationUsage,
} from '../src/proposals/conversation-method.js';
import { FAKE_ANSWER, FAKE_SUMMARY } from '../src/proposals/fake-conversation-method.js';
import { givenModel, givenPhotographImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Proposing a Fix or an Idea on a practice system** (issue #152): an Administrator lets an
 * Account propose; that Account starts a Draft with what is on screen attached, writes, and the
 * answer arrives as it is written. The conversation is the fake method, which answers fixed text,
 * so no test here talks to a model (ADR 0017).
 */

const BUILD = { version: '9.8.7', commit: null };

/** Every line the answer to a turn was written as. */
async function converse(
  agent: TestAgent,
  proposalId: string,
  text: string,
  screenshots: { id: string; note?: string | null }[] = [],
): Promise<ProposalAnswerEvent[]> {
  const response = await agent
    .post(`/api/proposals/${proposalId}/turns`)
    .send({ text, screenshots })
    .buffer(true)
    .parse((res, callback) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => callback(null, body));
    })
    .expect(200)
    .expect('content-type', /application\/x-ndjson/);

  return (response.body as string)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as ProposalAnswerEvent);
}

/** A screenshot pasted or picked: the picture is the body, as a Photograph's is. */
function show(agent: TestAgent, proposalId: string, image: Buffer, contentType = 'image/png') {
  return agent
    .post(`/api/proposals/${proposalId}/screenshots`)
    .set('Content-Type', contentType)
    .send(image);
}

async function aScreenshot(agent: TestAgent, proposalId: string): Promise<ProposalScreenshot> {
  const shown = await show(agent, proposalId, await givenPhotographImage({ format: 'png' }));
  expect(shown.status).toBe(201);
  return shown.body.screenshot as ProposalScreenshot;
}

function written(events: ProposalAnswerEvent[]): string {
  return events.map((event) => (event.type === 'text' ? event.text : '')).join('');
}

async function letPropose(
  administrator: TestAgent,
  member: RecruitedMember,
  mayPropose = true,
): Promise<RosterEntry> {
  const response = await administrator
    .patch(`/api/roster/${member.entry.id}`)
    .send({ mayPropose })
    .expect(200);
  return response.body.member as RosterEntry;
}

async function aDraft(agent: TestAgent, kind: ProposalKind = 'fix'): Promise<string> {
  const started = await agent.post('/api/proposals').send({ kind, pageAddress: '/' }).expect(201);
  return (started.body.proposal as Proposal).id;
}

async function summarise(agent: TestAgent, proposalId: string, change?: string): Promise<Proposal> {
  const response = await agent
    .post(`/api/proposals/${proposalId}/summary`)
    .send(change === undefined ? {} : { change })
    .expect(200);
  return response.body.proposal as Proposal;
}

/** A Proposal talked through, finished and handed over: New, and seen by all who may propose. */
async function aHandedOver(agent: TestAgent, kind: ProposalKind = 'fix'): Promise<string> {
  const id = await aDraft(agent, kind);
  await converse(agent, id, `Something about a ${kind}.`);
  await summarise(agent, id);
  await agent.post(`/api/proposals/${id}/hand-over`).expect(200);
  return id;
}

async function readProposal(agent: TestAgent, proposalId: string): Promise<Proposal> {
  return (await agent.get(`/api/proposals/${proposalId}`).expect(200)).body.proposal as Proposal;
}

async function listed(agent: TestAgent, query = ''): Promise<ProposalsResponse> {
  return (await agent.get(`/api/proposals${query}`).expect(200)).body as ProposalsResponse;
}

describe('proposing, on a practice system', () => {
  let app: TestApp;
  /** The suite's Administrator, until the database is emptied under it. */
  let administrator: RecruitedMember | undefined;

  beforeAll(async () => {
    app = await startTestApp({ env: { PROPOSALS_METHOD: 'fake' }, build: BUILD });
  });
  afterEach(async () => {
    administrator = undefined;
    await app.reset();
  });
  afterAll(() => app.close());

  async function anAdministrator(): Promise<RecruitedMember> {
    administrator ??= await givenAnAdministrator(app);
    return administrator;
  }

  async function aProposer(name = 'A Proposer'): Promise<RecruitedMember> {
    const { agent } = await anAdministrator();
    const member = await givenAMember(app, agent, { name });
    await letPropose(agent, member);
    return member;
  }

  describe('the permission', () => {
    it('is granted and withdrawn by an Administrator, and the roster says which', async () => {
      const { agent: administrator } = await anAdministrator();
      const member = await givenAMember(app, administrator);
      expect(member.entry.mayPropose).toBe(false);

      expect((await letPropose(administrator, member)).mayPropose).toBe(true);
      const session = await member.agent.get('/api/session').expect(200);
      expect((session.body as SessionResponse).account?.mayPropose).toBe(true);

      expect((await letPropose(administrator, member, false)).mayPropose).toBe(false);
      const after = await member.agent.get('/api/session').expect(200);
      expect((after.body as SessionResponse).account?.mayPropose).toBe(false);
    });

    it('cannot be granted by anybody but an Administrator', async () => {
      const { agent: administrator } = await anAdministrator();
      const editor = await givenAMember(app, administrator, { role: 'editor' });
      const member = await givenAMember(app, administrator);

      await editor.agent
        .patch(`/api/roster/${member.entry.id}`)
        .send({ mayPropose: true })
        .expect(403);
      await member.agent
        .patch(`/api/roster/${member.entry.id}`)
        .send({ mayPropose: true })
        .expect(403);
    });

    it('is what lets somebody reach the Proposals', async () => {
      const { agent: administrator } = await anAdministrator();
      const member = await givenAMember(app, administrator);

      await app.request().get('/api/proposals').expect(401);
      await member.agent.get('/api/proposals').expect(403);
      await member.agent.post('/api/proposals').send({ kind: 'fix', pageAddress: '/' }).expect(403);
      // An Administrator is not let in by the role: the permission is a thing of its own.
      await administrator.get('/api/proposals').expect(403);

      await letPropose(administrator, member);
      await member.agent.get('/api/proposals').expect(200);

      await letPropose(administrator, member, false);
      await member.agent.get('/api/proposals').expect(403);
    });
  });

  describe('a Draft', () => {
    it('records its kind, its author and what was on screen', async () => {
      const proposer = await aProposer();
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo', series: 'GL' });
      const tavola = await givenTavola(app.db, model.id, { number: '51', nameEn: 'Brake system' });
      const pageAddress = `/tavole/${tavola.id}?position=3`;

      const started = await proposer.agent
        .post('/api/proposals')
        .send({ kind: 'fix', pageAddress, tavolaId: tavola.id })
        .expect(201);

      const proposal = started.body.proposal as Proposal;
      expect(proposal).toMatchObject({
        kind: 'fix',
        status: 'draft',
        opening: null,
        turns: [],
        context: {
          pageAddress,
          version: '9.8.7',
          model: { id: model.id, name: 'Iso Grifo GL' },
          tavola: { id: tavola.id, number: '51', name: 'Brake system' },
        },
      });
    });

    it('records a Model on its own, and a page about neither', async () => {
      const proposer = await aProposer();
      const model = await givenModel(app.db, { brand: 'Bizzarrini', name: 'Strada' });

      const onAModel = await proposer.agent
        .post('/api/proposals')
        .send({ kind: 'idea', pageAddress: `/models/${model.id}`, modelId: model.id })
        .expect(201);
      expect((onAModel.body.proposal as Proposal).context).toMatchObject({
        model: { id: model.id, name: 'Bizzarrini Strada' },
        tavola: null,
      });

      const onSearch = await proposer.agent
        .post('/api/proposals')
        .send({ kind: 'idea', pageAddress: '/search?q=washer' })
        .expect(201);
      expect((onSearch.body.proposal as Proposal).context).toMatchObject({
        pageAddress: '/search?q=washer',
        model: null,
        tavola: null,
      });
    });

    it('names an Unchecked Tavola only for somebody who may see it', async () => {
      const { agent: administrator } = await anAdministrator();
      const member = await givenAMember(app, administrator);
      await letPropose(administrator, member);
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const tavola = await givenTavola(app.db, model.id, { number: '7', state: 'unchecked' });
      const start = { kind: 'fix', pageAddress: `/tavole/${tavola.id}`, tavolaId: tavola.id };

      const asMember = await member.agent.post('/api/proposals').send(start).expect(201);
      expect((asMember.body.proposal as Proposal).context).toMatchObject({
        model: null,
        tavola: null,
      });

      const editor = await givenAMember(app, administrator, { role: 'editor' });
      await letPropose(administrator, editor);
      const asEditor = await editor.agent.post('/api/proposals').send(start).expect(201);
      expect((asEditor.body.proposal as Proposal).context.tavola).toMatchObject({
        id: tavola.id,
        number: '7',
      });
    });

    it('is either a Fix or an Idea', async () => {
      const proposer = await aProposer();
      await proposer.agent
        .post('/api/proposals')
        .send({ kind: 'complaint', pageAddress: '/' })
        .expect(400);
      await proposer.agent.post('/api/proposals').send({ kind: 'fix' }).expect(400);
    });

    it('is its author’s alone: listed among their Drafts, and nobody else’s', async () => {
      const author = await aProposer('The Author');
      const somebodyElse = await aProposer('Somebody Else');

      const started = await author.agent
        .post('/api/proposals')
        .send({ kind: 'idea', pageAddress: '/' })
        .expect(201);
      const { id } = started.body.proposal as Proposal;

      const mine = (await author.agent.get('/api/proposals').expect(200)).body as ProposalsResponse;
      expect(mine.drafts.map((draft) => draft.id)).toEqual([id]);

      const theirs = (await somebodyElse.agent.get('/api/proposals').expect(200))
        .body as ProposalsResponse;
      expect(theirs.drafts).toEqual([]);

      await somebodyElse.agent.get(`/api/proposals/${id}`).expect(404);
      await somebodyElse.agent
        .post(`/api/proposals/${id}/turns`)
        .send({ text: 'Mine?' })
        .expect(404);
      await (await anAdministrator()).agent.get(`/api/proposals/${id}`).expect(403);
    });

    it('is listed the latest first', async () => {
      const author = await aProposer();
      const first = await author.agent
        .post('/api/proposals')
        .send({ kind: 'fix', pageAddress: '/a' })
        .expect(201);
      app.clock.advanceBy(5 * 60_000);
      const second = await author.agent
        .post('/api/proposals')
        .send({ kind: 'idea', pageAddress: '/b' })
        .expect(201);

      const { drafts } = (await author.agent.get('/api/proposals').expect(200))
        .body as ProposalsResponse;
      expect(drafts.map((draft) => draft.id)).toEqual([
        (second.body.proposal as Proposal).id,
        (first.body.proposal as Proposal).id,
      ]);
    });
  });

  describe('a turn', () => {
    it('is answered as a stream, and both are kept in order', async () => {
      const author = await aProposer();
      const started = await author.agent
        .post('/api/proposals')
        .send({ kind: 'fix', pageAddress: '/' })
        .expect(201);
      const { id } = started.body.proposal as Proposal;

      const events = await converse(author.agent, id, 'The drawing does not open.');
      expect(events.filter((event) => event.type === 'text').length).toBeGreaterThan(1);
      expect(written(events)).toBe(FAKE_ANSWER);
      expect(events.at(-1)).toMatchObject({
        type: 'answered',
        turns: [
          { sequence: 0, speaker: 'author', text: 'The drawing does not open.' },
          { sequence: 1, speaker: 'conversation', text: FAKE_ANSWER },
        ],
      });

      app.clock.advanceBy(60_000);
      await converse(author.agent, id, 'On a phone, every time.');

      const read = (await author.agent.get(`/api/proposals/${id}`).expect(200)).body
        .proposal as Proposal;
      expect(read.opening).toBe('The drawing does not open.');
      // The Drafts list names it by the same words, read beside each Draft in one query.
      const listed = (await author.agent.get('/api/proposals').expect(200))
        .body as ProposalsResponse;
      expect(listed.drafts.find((draft) => draft.id === id)?.opening).toBe(
        'The drawing does not open.',
      );
      expect(read.turns.map((turn) => [turn.sequence, turn.speaker, turn.text])).toEqual([
        [0, 'author', 'The drawing does not open.'],
        [1, 'conversation', FAKE_ANSWER],
        [2, 'author', 'On a phone, every time.'],
        [3, 'conversation', FAKE_ANSWER],
      ]);
    });

    it('needs something written', async () => {
      const author = await aProposer();
      const started = await author.agent
        .post('/api/proposals')
        .send({ kind: 'fix', pageAddress: '/' })
        .expect(201);
      const { id } = started.body.proposal as Proposal;

      await author.agent.post(`/api/proposals/${id}/turns`).send({ text: '   ' }).expect(400);
    });
  });

  describe('the finished Proposal', () => {
    it('is written in the fixed shape for its kind, with the author’s words verbatim', async () => {
      const author = await aProposer();
      const fix = await aDraft(author.agent, 'fix');
      await converse(author.agent, fix, 'The drawing does not open.');
      await converse(author.agent, fix, '  On a phone, every time.  ');

      const finished = await summarise(author.agent, fix);
      expect(finished.summary).toEqual({
        ...FAKE_SUMMARY.fix,
        authorsWords: ['The drawing does not open.', 'On a phone, every time.'],
      });
      expect(finished.title).toBe(FAKE_SUMMARY.fix.title);
      expect(finished.summary?.model).toBe('The fake conversation');
      expect((await readProposal(author.agent, fix)).summary).toEqual(finished.summary);

      const idea = await aDraft(author.agent, 'idea');
      await converse(author.agent, idea, 'Members could note their own car.');
      expect((await summarise(author.agent, idea)).summary).toEqual({
        ...FAKE_SUMMARY.idea,
        authorsWords: ['Members could note their own car.'],
      });
    });

    it('is written again when the author asks for a change, and the ask is kept', async () => {
      const author = await aProposer();
      const id = await aDraft(author.agent);
      await converse(author.agent, id, 'The drawing does not open.');
      await summarise(author.agent, id);

      const revised = await summarise(author.agent, id, 'Say that it happens on a phone.');
      expect(revised.turns.at(-1)).toMatchObject({
        sequence: 2,
        speaker: 'author',
        text: 'Say that it happens on a phone.',
      });
      expect(revised.summary?.authorsWords).toEqual([
        'The drawing does not open.',
        'Say that it happens on a phone.',
      ]);
    });

    it('is set aside when the conversation carries on after it', async () => {
      const author = await aProposer();
      const id = await aDraft(author.agent);
      await converse(author.agent, id, 'The drawing does not open.');
      await summarise(author.agent, id);

      await converse(author.agent, id, 'One more thing.');
      expect((await readProposal(author.agent, id)).summary).toBeNull();
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(409);
    });

    it('needs something said first, and is the author’s alone to ask for', async () => {
      const author = await aProposer();
      const somebodyElse = await aProposer('Somebody Else');
      const id = await aDraft(author.agent);

      await author.agent.post(`/api/proposals/${id}/summary`).send({}).expect(409);
      await converse(author.agent, id, 'The drawing does not open.');
      await somebodyElse.agent.post(`/api/proposals/${id}/summary`).send({}).expect(404);
      await author.agent.post(`/api/proposals/${id}/summary`).send({ change: '   ' }).expect(400);
    });
  });

  describe('handing over', () => {
    it('makes a Draft New, and shows it whole to everybody with the permission', async () => {
      const author = await aProposer('The Author');
      const somebodyElse = await aProposer('Somebody Else');
      const id = await aDraft(author.agent);
      await converse(author.agent, id, 'The drawing does not open.');
      await summarise(author.agent, id);

      app.clock.advanceBy(60_000);
      const handedOver = await author.agent.post(`/api/proposals/${id}/hand-over`).expect(200);
      expect(handedOver.body.proposal).toMatchObject({
        status: 'new',
        handedOverAt: app.clock.now().toISOString(),
      });

      expect((await listed(author.agent)).drafts).toEqual([]);
      const theirs = await listed(somebodyElse.agent);
      expect(theirs.handedOver).toMatchObject([
        { id, status: 'new', title: FAKE_SUMMARY.fix.title, mine: false },
      ]);
      expect((await listed(author.agent)).handedOver).toMatchObject([{ id, mine: true }]);

      const read = await readProposal(somebodyElse.agent, id);
      expect(read.summary?.authorsWords).toEqual(['The drawing does not open.']);
      expect(read.turns.map((turn) => turn.speaker)).toEqual(['author', 'conversation']);

      const { agent: administrator } = await anAdministrator();
      await administrator.get(`/api/proposals/${id}`).expect(403);
    });

    it('needs the finished Proposal, happens once, and ends the conversation', async () => {
      const author = await aProposer();
      const id = await aDraft(author.agent);
      await converse(author.agent, id, 'The drawing does not open.');
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(409);

      await summarise(author.agent, id);
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(200);
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(409);
      await author.agent.post(`/api/proposals/${id}/turns`).send({ text: 'More.' }).expect(409);
      await author.agent.post(`/api/proposals/${id}/summary`).send({}).expect(409);
    });

    it('is the author’s alone to do', async () => {
      const author = await aProposer('The Author');
      const somebodyElse = await aProposer('Somebody Else');
      const id = await aDraft(author.agent);
      await converse(author.agent, id, 'The drawing does not open.');
      await summarise(author.agent, id);

      await somebodyElse.agent.post(`/api/proposals/${id}/hand-over`).expect(404);
    });
  });

  describe('discarding', () => {
    it('takes away a Draft its author no longer wants', async () => {
      const author = await aProposer('The Author');
      const somebodyElse = await aProposer('Somebody Else');
      const id = await aDraft(author.agent);
      await converse(author.agent, id, 'A false start.');

      await somebodyElse.agent.delete(`/api/proposals/${id}`).expect(404);
      await author.agent.delete(`/api/proposals/${id}`).expect(204);
      await author.agent.get(`/api/proposals/${id}`).expect(404);
      expect((await listed(author.agent)).drafts).toEqual([]);
    });

    it('never takes away a handed-over Proposal, not even for its author', async () => {
      const author = await aProposer('The Author');
      const somebodyElse = await aProposer('Somebody Else');
      const id = await aHandedOver(author.agent);

      await author.agent.delete(`/api/proposals/${id}`).expect(409);
      await somebodyElse.agent.delete(`/api/proposals/${id}`).expect(409);
      await readProposal(author.agent, id);
    });
  });

  describe('what becomes of it', () => {
    async function anAdministratorWhoProposes(): Promise<RecruitedMember> {
      const administrator = await anAdministrator();
      const entry = await letPropose(administrator.agent, administrator);
      return { ...administrator, entry };
    }

    function moveOn(agent: TestAgent, proposalId: string, status: string, reason?: string) {
      return agent
        .patch(`/api/proposals/${proposalId}`)
        .send(reason === undefined ? { status } : { status, reason });
    }

    it('runs New, Taken up, Done, by an Administrator, and its author sees it', async () => {
      const { agent: administrator } = await anAdministratorWhoProposes();
      const author = await aProposer();
      const id = await aHandedOver(author.agent);

      const takenUp = await moveOn(administrator, id, 'taken-up').expect(200);
      expect((takenUp.body.proposal as Proposal).status).toBe('taken-up');
      expect((await readProposal(author.agent, id)).status).toBe('taken-up');

      await moveOn(administrator, id, 'done').expect(200);
      expect(await readProposal(author.agent, id)).toMatchObject({
        status: 'done',
        declineReason: null,
      });
    });

    it('is Declined from New or Taken up, with a reason its author reads', async () => {
      const { agent: administrator } = await anAdministratorWhoProposes();
      const author = await aProposer();
      const fromNew = await aHandedOver(author.agent);
      const fromTakenUp = await aHandedOver(author.agent);

      await moveOn(administrator, fromNew, 'declined').expect(400);
      await moveOn(administrator, fromNew, 'declined', '  ').expect(400);
      await moveOn(administrator, fromNew, 'declined', 'Already on the plan.').expect(200);
      expect(await readProposal(author.agent, fromNew)).toMatchObject({
        status: 'declined',
        declineReason: 'Already on the plan.',
      });

      await moveOn(administrator, fromTakenUp, 'taken-up').expect(200);
      await moveOn(administrator, fromTakenUp, 'declined', 'Not for now.').expect(200);
    });

    it('refuses anything else as a conflict', async () => {
      const { agent: administrator } = await anAdministratorWhoProposes();
      const author = await aProposer();
      const id = await aHandedOver(author.agent);

      await moveOn(administrator, id, 'done').expect(409);
      await moveOn(administrator, id, 'taken-up').expect(200);
      await moveOn(administrator, id, 'taken-up').expect(409);
      await moveOn(administrator, id, 'done').expect(200);
      await moveOn(administrator, id, 'declined', 'Too late.').expect(409);
      await moveOn(administrator, id, 'taken-up').expect(409);
      await moveOn(administrator, id, 'new').expect(400);
      await moveOn(administrator, id, 'draft').expect(400);

      // A Draft has not been handed over, and nobody moves it on, its own author included.
      const draft = await aDraft(administrator);
      await moveOn(administrator, draft, 'taken-up').expect(409);
    });

    it('is decided by Administrators alone', async () => {
      const author = await aProposer();
      const { agent: administrator } = await anAdministrator();
      const editor = await givenAMember(app, administrator, { role: 'editor' });
      await letPropose(administrator, editor);
      const id = await aHandedOver(author.agent);

      await moveOn(author.agent, id, 'taken-up').expect(403);
      await moveOn(editor.agent, id, 'taken-up').expect(403);
      // The role alone does not reach the Proposals: the permission is a thing of its own.
      await moveOn(administrator, id, 'taken-up').expect(403);
      expect((await readProposal(author.agent, id)).status).toBe('new');
    });
  });

  describe('the Proposals list', () => {
    it('lists the handed-over New first, the latest first within each, and filters by status', async () => {
      const administrator = await anAdministrator();
      await letPropose(administrator.agent, administrator);
      const author = await aProposer();

      const done = await aHandedOver(author.agent);
      app.clock.advanceBy(60_000);
      const olderNew = await aHandedOver(author.agent, 'idea');
      app.clock.advanceBy(60_000);
      const takenUp = await aHandedOver(author.agent);
      app.clock.advanceBy(60_000);
      const declined = await aHandedOver(author.agent);
      app.clock.advanceBy(60_000);
      const newerNew = await aHandedOver(author.agent);
      const draft = await aDraft(author.agent);

      const move = (id: string, status: string, reason?: string) =>
        administrator.agent.patch(`/api/proposals/${id}`).send({ status, reason }).expect(200);
      await move(done, 'taken-up');
      await move(done, 'done');
      await move(takenUp, 'taken-up');
      await move(declined, 'declined', 'No.');

      const all = await listed(author.agent);
      expect(all.handedOver.map((proposal) => proposal.id)).toEqual([
        newerNew,
        olderNew,
        takenUp,
        done,
        declined,
      ]);
      expect(all.drafts.map((proposal) => proposal.id)).toEqual([draft]);

      const onlyNew = await listed(author.agent, '?status=new');
      expect(onlyNew.handedOver.map((proposal) => proposal.id)).toEqual([newerNew, olderNew]);
      expect(onlyNew.drafts.map((proposal) => proposal.id)).toEqual([draft]);
      const onlyDeclined = await listed(administrator.agent, '?status=declined');
      expect(onlyDeclined.handedOver.map((proposal) => proposal.id)).toEqual([declined]);

      await author.agent.get('/api/proposals?status=draft').expect(400);
      await author.agent.get('/api/proposals?status=lost').expect(400);
    });
  });

  describe('a screenshot', () => {
    it('waits on the Draft once shown, and is sent with a turn and its note', async () => {
      const author = await aProposer();
      const id = await aDraft(author.agent);

      const first = await aScreenshot(author.agent, id);
      expect(first).toMatchObject({ note: null, width: 1600, height: 1200 });
      const second = await aScreenshot(author.agent, id);

      const waiting = (await author.agent.get(`/api/proposals/${id}`).expect(200)).body
        .proposal as Proposal;
      expect(waiting.unsent.map((shot) => shot.id)).toEqual([first.id, second.id]);

      const events = await converse(author.agent, id, 'The washer is missing here.', [
        { id: first.id, note: 'Circle 12, top left' },
        { id: second.id },
      ]);
      expect(events.at(-1)).toMatchObject({
        type: 'answered',
        turns: [
          {
            speaker: 'author',
            screenshots: [
              { id: first.id, note: 'Circle 12, top left' },
              { id: second.id, note: null },
            ],
          },
          { speaker: 'conversation', screenshots: [] },
        ],
      });

      const read = (await author.agent.get(`/api/proposals/${id}`).expect(200)).body
        .proposal as Proposal;
      expect(read.unsent).toEqual([]);
      expect(read.turns[0]?.screenshots.map((shot) => [shot.id, shot.note])).toEqual([
        [first.id, 'Circle 12, top left'],
        [second.id, null],
      ]);

      const display = await author.agent.get(first.displayUrl).expect(200);
      expect(display.headers['content-type']).toBe('image/webp');
      const preview = await author.agent.get(first.previewUrl).expect(200);
      expect((await sharp(preview.body as Buffer).metadata()).width).toBe(480);
    });

    it('is refused when it is not a picture, and a turn may send only what waits on its Draft', async () => {
      const author = await aProposer();
      const id = await aDraft(author.agent);

      await show(author.agent, id, Buffer.from('not a screenshot at all')).expect(415);
      await show(author.agent, id, Buffer.alloc(0)).expect(400);

      const shot = await aScreenshot(author.agent, id);
      const elsewhere = await aDraft(author.agent);
      await author.agent
        .post(`/api/proposals/${elsewhere}/turns`)
        .send({ text: 'This one.', screenshots: [{ id: shot.id }] })
        .expect(400);

      await converse(author.agent, id, 'This one.', [{ id: shot.id }]);
      // Sent once, it is the turn's: it cannot be sent again.
      await author.agent
        .post(`/api/proposals/${id}/turns`)
        .send({ text: 'Again.', screenshots: [{ id: shot.id }] })
        .expect(400);
      await author.agent
        .post(`/api/proposals/${id}/turns`)
        .send({ text: 'A long note.', screenshots: [{ id: shot.id, note: 'x'.repeat(2001) }] })
        .expect(400);
    });

    it('can be removed from a Draft, sent or not, and not from a handed-over Proposal', async () => {
      const author = await aProposer();
      const id = await aDraft(author.agent);
      const mistaken = await aScreenshot(author.agent, id);
      const sent = await aScreenshot(author.agent, id);
      const kept = await aScreenshot(author.agent, id);
      await converse(author.agent, id, 'Look.', [{ id: sent.id }, { id: kept.id }]);

      const afterUnsent = await author.agent
        .delete(`/api/proposals/${id}/screenshots/${mistaken.id}`)
        .expect(200);
      expect((afterUnsent.body.proposal as Proposal).unsent).toEqual([]);
      await author.agent.get(mistaken.displayUrl).expect(404);

      const afterSent = await author.agent
        .delete(`/api/proposals/${id}/screenshots/${sent.id}`)
        .expect(200);
      expect(
        (afterSent.body.proposal as Proposal).turns[0]?.screenshots.map((shot) => shot.id),
      ).toEqual([kept.id]);
      await author.agent.get(sent.previewUrl).expect(404);

      await author.agent.delete(`/api/proposals/${id}/screenshots/${sent.id}`).expect(404);

      await summarise(author.agent, id);
      // One shown and never sent is not handed over with it.
      const waiting = await aScreenshot(author.agent, id);
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(409);
      await author.agent.delete(`/api/proposals/${id}/screenshots/${waiting.id}`).expect(200);
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(200);
      await author.agent.delete(`/api/proposals/${id}/screenshots/${kept.id}`).expect(409);
      await show(author.agent, id, await givenPhotographImage()).expect(409);
      await author.agent.get(kept.displayUrl).expect(200);
    });

    it('is served only to those with the permission, and a Draft’s only to its author', async () => {
      const { agent: administrator } = await anAdministrator();
      const author = await aProposer('The Author');
      const somebodyElse = await aProposer('Somebody Else');
      const member = await givenAMember(app, administrator, { name: 'Not Let In' });
      const id = await aDraft(author.agent);
      const shot = await aScreenshot(author.agent, id);

      await app.request().get(shot.displayUrl).expect(401);
      await member.agent.get(shot.displayUrl).expect(403);
      await administrator.get(shot.displayUrl).expect(403);
      await somebodyElse.agent.get(shot.displayUrl).expect(404);
      await somebodyElse.agent.get(shot.previewUrl).expect(404);

      // Nor can anybody else add to the Draft, or take from it.
      await show(somebodyElse.agent, id, await givenPhotographImage()).expect(404);
      await somebodyElse.agent.delete(`/api/proposals/${id}/screenshots/${shot.id}`).expect(404);
      await app
        .request()
        .post(`/api/proposals/${id}/screenshots`)
        .set('Content-Type', 'image/png')
        .send(await givenPhotographImage())
        .expect(401);

      await converse(author.agent, id, 'See this.', [{ id: shot.id, note: 'The empty box' }]);
      await summarise(author.agent, id);
      await author.agent.post(`/api/proposals/${id}/hand-over`).expect(200);

      const read = await readProposal(somebodyElse.agent, id);
      expect(read.turns[0]?.screenshots).toMatchObject([{ id: shot.id, note: 'The empty box' }]);

      await somebodyElse.agent.get(shot.displayUrl).expect(200);
      await app.request().get(shot.displayUrl).expect(401);
      await member.agent.get(shot.displayUrl).expect(403);
      await letPropose(administrator, somebodyElse, false);
      await somebodyElse.agent.get(shot.displayUrl).expect(403);
    });
  });
});

describe('what the conversation is given', () => {
  const heard: Conversation[] = [];
  const listening: ConversationMethod = {
    name: 'A conversation that writes down what it was given',
    priced: false,
    async *answer(conversation) {
      heard.push(structuredClone(conversation));
      yield 'Noted.';
    },
    async summarise(conversation) {
      heard.push(structuredClone(conversation));
      return {
        ...FAKE_SUMMARY[conversation.kind],
        title: `Heard ${conversation.turns.length} turns`,
      };
    },
  };

  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp({
      build: BUILD,
      conversation: { method: listening, unavailable: null },
    });
  });
  afterEach(async () => {
    heard.length = 0;
    await app.reset();
  });
  afterAll(() => app.close());

  it('is the kind, the starting context and the turns so far', async () => {
    const administrator = await givenAnAdministrator(app);
    const author = await givenAMember(app, administrator.agent);
    await letPropose(administrator.agent, author);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });

    const started = await author.agent
      .post('/api/proposals')
      .send({ kind: 'idea', pageAddress: `/models/${model.id}`, modelId: model.id })
      .expect(201);
    const { id } = started.body.proposal as Proposal;

    await converse(author.agent, id, 'Members could note their own car.');
    await converse(author.agent, id, 'For every Member.');

    expect(heard).toHaveLength(2);
    expect(heard[1]).toEqual({
      kind: 'idea',
      context: {
        pageAddress: `/models/${model.id}`,
        version: '9.8.7',
        model: { id: model.id, name: 'Iso Rivolta' },
        tavola: null,
      },
      earlier: [],
      turns: [
        { speaker: 'author', text: 'Members could note their own car.', screenshots: [] },
        { speaker: 'conversation', text: 'Noted.', screenshots: [] },
        { speaker: 'author', text: 'For every Member.', screenshots: [] },
      ],
    });
  });

  it('is the same when the Proposal is finished, with any change asked for last', async () => {
    const administrator = await givenAnAdministrator(app);
    const author = await givenAMember(app, administrator.agent);
    await letPropose(administrator.agent, author);
    const id = await aDraft(author.agent, 'fix');
    await converse(author.agent, id, 'The drawing does not open.');

    const finished = await summarise(author.agent, id, 'Say it is on a phone.');
    expect(finished.title).toBe('Heard 3 turns');
    expect(heard.at(-1)).toMatchObject({
      kind: 'fix',
      context: { pageAddress: '/' },
      turns: [
        { speaker: 'author', text: 'The drawing does not open.' },
        { speaker: 'conversation', text: 'Noted.' },
        { speaker: 'author', text: 'Say it is on a phone.' },
      ],
    });
  });

  it('includes the titles and statuses of the Proposals handed over before, and no Drafts', async () => {
    const administrator = await givenAnAdministrator(app);
    const entry = await letPropose(administrator.agent, administrator);
    const author = await givenAMember(app, administrator.agent);
    await letPropose(administrator.agent, author);
    expect(entry.mayPropose).toBe(true);

    const first = await aHandedOver(author.agent, 'fix');
    app.clock.advanceBy(60_000);
    await aHandedOver(administrator.agent, 'idea');
    await administrator.agent
      .patch(`/api/proposals/${first}`)
      .send({ status: 'declined', reason: 'Works as meant.' })
      .expect(200);
    const someoneElsesDraft = await aDraft(administrator.agent);
    await converse(administrator.agent, someoneElsesDraft, 'Half a thought.');

    const id = await aDraft(author.agent, 'idea');
    heard.length = 0;
    await converse(author.agent, id, 'Members could note their own car.');
    await summarise(author.agent, id);

    const earlier = [
      { kind: 'fix', title: 'Heard 2 turns', status: 'declined' },
      { kind: 'idea', title: 'Heard 2 turns', status: 'new' },
    ];
    expect(heard).toHaveLength(2);
    expect(heard[0]?.earlier).toEqual(earlier);
    expect(heard[1]?.earlier).toEqual(earlier);
  });

  it('is each turn’s screenshots, as pictures, with their notes', async () => {
    heard.length = 0;
    const administrator = await givenAnAdministrator(app);
    const author = await givenAMember(app, administrator.agent);
    await letPropose(administrator.agent, author);
    const id = await aDraft(author.agent);
    const shot = await aScreenshot(author.agent, id);
    const removed = await aScreenshot(author.agent, id);

    await converse(author.agent, id, 'This page.', [
      { id: shot.id, note: 'The empty box' },
      { id: removed.id },
    ]);
    expect(heard[0]?.turns[0]?.screenshots).toHaveLength(2);

    await author.agent.delete(`/api/proposals/${id}/screenshots/${removed.id}`).expect(200);
    await converse(author.agent, id, 'Only that one.');

    const [shown, ...rest] = heard[1]?.turns[0]?.screenshots ?? [];
    expect(rest).toEqual([]);
    expect(shown).toMatchObject({ note: 'The empty box', mediaType: 'image/webp' });
    const picture = await sharp(Buffer.from(shown?.data ?? [])).metadata();
    expect(picture).toMatchObject({ format: 'webp', width: 1600, height: 1200 });
  });
});

describe('a screenshot larger than Proposals accept', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp({ env: { PROPOSALS_METHOD: 'fake', MAX_SCREENSHOT_BYTES: '2048' } });
  });
  afterAll(() => app.close());

  it('is refused rather than read into memory', async () => {
    const administrator = await givenAnAdministrator(app);
    const author = await givenAMember(app, administrator.agent);
    await letPropose(administrator.agent, author);
    const id = await aDraft(author.agent);

    const refused = await show(author.agent, id, await givenPhotographImage()).expect(413);
    expect(refused.body.error).toMatchObject({ code: 'payload_too_large' });
  });
});

describe('a conversation that cannot answer', () => {
  /** What the method fails with, and how much it writes first. */
  let failure: { error: Error; after: string[] } = { error: new Error('unset'), after: [] };
  const failing: ConversationMethod = {
    name: 'A conversation that fails as it is told to',
    priced: false,
    async *answer() {
      yield* failure.after;
      throw failure.error;
    },
    async summarise() {
      throw failure.error;
    },
  };

  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp({ conversation: { method: failing, unavailable: null } });
  });
  afterEach(() => app.reset());
  afterAll(() => app.close());

  async function aTalkedDraft(): Promise<{ agent: TestAgent; id: string }> {
    const administrator = await givenAnAdministrator(app);
    const author = await givenAMember(app, administrator.agent);
    await letPropose(administrator.agent, author);
    const id = await aDraft(author.agent);
    return { agent: author.agent, id };
  }

  it('says Proposals are paused until next month when the month’s limit is spent', async () => {
    failure = { error: new ConversationPausedError(), after: [] };
    const { agent, id } = await aTalkedDraft();

    const answered = await agent
      .post(`/api/proposals/${id}/turns`)
      .send({ text: 'The drawing does not open.', screenshots: [] })
      .expect(503);
    expect(answered.body.error).toMatchObject({
      code: 'proposals_paused',
      message: expect.stringMatching(/paused until next month/),
    });

    const finished = await agent.post(`/api/proposals/${id}/summary`).send({}).expect(503);
    expect(finished.body.error.code).toBe('proposals_paused');

    // What the author wrote is kept, to carry on with next month.
    expect((await readProposal(agent, id)).turns.map((turn) => turn.text)).toEqual([
      'The drawing does not open.',
    ]);
  });

  it('says so on the stream when the limit is reached mid-answer', async () => {
    failure = { error: new ConversationPausedError(), after: ['Which '] };
    const { agent, id } = await aTalkedDraft();

    const events = await converse(agent, id, 'The drawing does not open.');
    expect(events.at(-1)).toEqual({
      type: 'failed',
      message: expect.stringMatching(/paused until next month/),
    });
  });

  it('says it is unavailable for anything else, which is not the same', async () => {
    failure = { error: new ConversationUnavailableError('The API answered 529.'), after: [] };
    const { agent, id } = await aTalkedDraft();

    const answered = await agent
      .post(`/api/proposals/${id}/turns`)
      .send({ text: 'The drawing does not open.', screenshots: [] })
      .expect(502);
    expect(answered.body.error.code).toBe('conversation_unavailable');
    expect(answered.body.error.message).not.toMatch(/paused|529/);

    const finished = await agent.post(`/api/proposals/${id}/summary`).send({}).expect(502);
    expect(finished.body.error.code).toBe('conversation_unavailable');
  });
});

describe('a conversation with the API key', () => {
  it('runs on the api-key method wherever the key is set on a practice system', () => {
    const configured = configureConversation(
      loadConfig({
        NODE_ENV: 'test',
        ENVIRONMENT_NAME: 'test',
        DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
        PROPOSALS_ANTHROPIC_API_KEY: 'sk-ant-test-not-a-real-key',
      }),
    );

    expect(configured.unavailable).toBeNull();
    expect(configured.method?.name).toBe('Claude (claude-sonnet-5-5) with an API key');
    expect(configured.method?.name).not.toContain('sk-ant');
  });
});

describe('a conversation on this machine’s Claude subscription', () => {
  const settings = (env: Record<string, string>) =>
    loadConfig({
      NODE_ENV: 'test',
      ENVIRONMENT_NAME: 'test',
      DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
      ...env,
    });

  it('runs on the subscription method where Claude Code is signed in and there is no key', () => {
    const configured = configureConversation(settings({}), { machineLogin: true });

    expect(configured.unavailable).toBeNull();
    expect(configured.method?.name).toBe(
      'Claude (claude-sonnet-5-5) with this machine’s Claude Code login',
    );
    expect(
      configureConversation(settings({ PROPOSALS_METHOD: 'subscription' }), { machineLogin: true })
        .unavailable,
    ).toBeNull();
  });

  it('is unavailable with both credentials, or neither, and says why', () => {
    const key = 'sk-ant-test-not-a-key';
    for (const method of [undefined, 'api-key', 'subscription']) {
      const configured = configureConversation(
        settings({
          PROPOSALS_ANTHROPIC_API_KEY: key,
          ...(method === undefined ? {} : { PROPOSALS_METHOD: method }),
        }),
        { machineLogin: true },
      );
      expect(configured.method).toBeNull();
      expect(configured.unavailable).toMatch(/both PROPOSALS_ANTHROPIC_API_KEY and a Claude Code/);
      expect(configured.unavailable).not.toContain(key);
    }

    const neither = configureConversation(settings({}), { machineLogin: false });
    expect(neither.method).toBeNull();
    expect(neither.unavailable).toMatch(/PROPOSALS_ANTHROPIC_API_KEY/);
    expect(neither.unavailable).toMatch(/claude auth login/);
    expect(
      configureConversation(settings({ PROPOSALS_METHOD: 'subscription' }), {
        machineLogin: false,
      }).unavailable,
    ).toMatch(/not signed in on this machine/);
  });

  it('hides the Propose button where it is unavailable', async () => {
    const app = await startTestApp({
      conversation: configureConversation(settings({ PROPOSALS_ANTHROPIC_API_KEY: 'sk-ant-x' }), {
        machineLogin: true,
      }),
    });
    try {
      const administrator = await givenAnAdministrator(app);
      const member = await givenAMember(app, administrator.agent);
      await letPropose(administrator.agent, member);

      const session = (await member.agent.get('/api/session').expect(200)).body as SessionResponse;
      expect(session.account?.mayPropose).toBe(false);
      await member.agent.get('/api/proposals').expect(403);
    } finally {
      await app.close();
    }
  });

  it('is never looked for in Production, nor where the fake conversation is named', async () => {
    const asked: string[] = [];
    const lookup = async () => {
      asked.push('asked');
      return true;
    };
    expect(
      await findMachineLogin(
        settings({ ENVIRONMENT_MODE: 'production', PUBLIC_URL: 'https://ricambi.example' }),
        lookup,
      ),
    ).toBe(false);
    expect(await findMachineLogin(settings({ PROPOSALS_METHOD: 'fake' }), lookup)).toBe(false);
    expect(asked).toEqual([]);
  });

  it('is looked for where catalog reading runs on it, even with the fake conversation', async () => {
    expect(
      await findMachineLogin(
        settings({ PROPOSALS_METHOD: 'fake', READING_METHOD: 'subscription' }),
        async () => true,
      ),
    ).toBe(true);
  });
});

describe('a conversation that is not there', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(() => app.close());

  it('hides the Propose button and keeps the Proposals closed, even to somebody let in', async () => {
    const administrator = await givenAnAdministrator(app);
    const member = await givenAMember(app, administrator.agent);
    expect((await letPropose(administrator.agent, member)).mayPropose).toBe(true);

    const session = (await member.agent.get('/api/session').expect(200)).body as SessionResponse;
    expect(session.account?.mayPropose).toBe(false);
    await member.agent.get('/api/proposals').expect(403);
  });

  it('says why', () => {
    const settings = (env: Record<string, string>) =>
      loadConfig({
        NODE_ENV: 'test',
        ENVIRONMENT_NAME: 'test',
        DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
        ...env,
      });

    expect(configureConversation(settings({})).unavailable).toMatch(/PROPOSALS_METHOD/);
    expect(configureConversation(settings({ PROPOSALS_METHOD: 'fake' })).unavailable).toBeNull();
    expect(configureConversation(settings({ PROPOSALS_METHOD: 'api-key' })).unavailable).toMatch(
      /PROPOSALS_ANTHROPIC_API_KEY/,
    );
    expect(
      configureConversation(settings({ PROPOSALS_ANTHROPIC_API_KEY: 'sk-ant-test-not-a-key' }), {
        documents: () => {
          throw new Error('ENOENT');
        },
      }).unavailable,
    ).toMatch(/built without them/);
    expect(
      configureConversation(
        settings({
          PROPOSALS_METHOD: 'fake',
          ENVIRONMENT_MODE: 'production',
          PUBLIC_URL: 'https://ricambi.example',
        }),
      ),
    ).toMatchObject({ method: null, unavailable: expect.stringMatching(/Production/) });
  });
});

describe('proposing, in Production', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp({
      env: {
        ENVIRONMENT_MODE: 'production',
        PUBLIC_URL: 'https://ricambi.example',
        PROPOSALS_METHOD: 'fake',
      },
    });
  });
  afterAll(() => app.close());

  it('cannot be granted, so nobody there ever proposes', async () => {
    const administrator = await givenAnAdministrator(app);
    const member = await givenAMember(app, administrator.agent);

    const refused = await administrator.agent
      .patch(`/api/roster/${member.entry.id}`)
      .send({ mayPropose: true })
      .expect(409);
    expect(refused.body.error.message).toMatch(/Production/);

    const session = (await member.agent.get('/api/session').expect(200)).body as SessionResponse;
    expect(session.account?.mayPropose).toBe(false);
    await member.agent.get('/api/proposals').expect(403);

    // Withdrawing stays allowed, so nothing granted elsewhere can be left standing here.
    await administrator.agent
      .patch(`/api/roster/${member.entry.id}`)
      .send({ mayPropose: false })
      .expect(200);
  });
});

describe('what the conversations cost', () => {
  /** A priced conversation whose every answer costs a dime and every summary a nickel. */
  const priced: ConversationMethod = {
    name: 'A conversation that says what it cost',
    priced: true,
    async *answer(_conversation, used) {
      used?.(usage('answer', 0.1));
      yield 'Noted.';
    },
    async summarise(conversation, used) {
      used?.(usage('summary', 0.05));
      return FAKE_SUMMARY[conversation.kind];
    },
  };

  function usage(request: ConversationUsage['request'], estimatedUsd: number): ConversationUsage {
    return {
      request,
      model: 'claude-sonnet-5-5',
      inputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      estimatedUsd,
    };
  }

  async function startedWith(method: ConversationMethod): Promise<TestApp> {
    return startTestApp({
      build: BUILD,
      env: { PROPOSALS_MONTHLY_LIMIT_USD: '25' },
      conversation: { method, unavailable: null },
    });
  }

  it('is told to an Administrator: this month, last month, the limit, and each Proposal’s', async () => {
    const app = await startedWith(priced);
    try {
      const administrator = await givenAnAdministrator(app);
      await letPropose(administrator.agent, administrator);
      const editor = await givenAMember(app, administrator.agent);
      await letPropose(administrator.agent, editor);

      // Two answers and a summary: $0.25, handed over.
      const id = await aDraft(editor.agent);
      await converse(editor.agent, id, 'The numbers are hard to read.');
      await converse(editor.agent, id, 'On a phone.');
      await summarise(editor.agent, id);
      await editor.agent.post(`/api/proposals/${id}/hand-over`).expect(200);

      // One answer last month: $0.10, on a Draft of the Administrator's.
      const now = app.clock.now();
      app.clock.setTo(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)));
      const earlier = await aDraft(administrator.agent, 'idea');
      await converse(administrator.agent, earlier, 'Members could note their own car.');
      // And one this month on a Draft discarded afterwards: $0.10, still paid for.
      app.clock.setTo(now);
      const discarded = await aDraft(administrator.agent);
      await converse(administrator.agent, discarded, 'Never mind.');
      await administrator.agent.delete(`/api/proposals/${discarded}`).expect(204);

      const seen = await listed(administrator.agent);
      expect(seen.costs).toEqual({
        thisMonthUsd: 0.35,
        lastMonthUsd: 0.1,
        conversationsThisMonth: 1,
        monthlyLimitUsd: 25,
      });
      expect(seen.handedOver.map((proposal) => proposal.estimatedCostUsd)).toEqual([0.25]);
      expect(seen.drafts.map((proposal) => proposal.estimatedCostUsd)).toEqual([0.1]);
      expect((await readProposal(administrator.agent, id)).estimatedCostUsd).toBe(0.25);

      // Somebody else let propose reads the Proposals, and none of the money.
      const theirs = await listed(editor.agent);
      expect(theirs.costs).toBeNull();
      expect(theirs.handedOver.map((proposal) => proposal.estimatedCostUsd)).toEqual([null]);
      expect((await readProposal(editor.agent, id)).estimatedCostUsd).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('is nothing where the conversation is not billed by the request', async () => {
    const app = await startedWith({
      name: 'A conversation on somebody’s subscription',
      priced: false,
      async *answer() {
        yield 'Noted.';
      },
      async summarise(conversation) {
        return FAKE_SUMMARY[conversation.kind];
      },
    });
    try {
      const administrator = await givenAnAdministrator(app);
      await letPropose(administrator.agent, administrator);
      const id = await aDraft(administrator.agent);
      await converse(administrator.agent, id, 'The numbers are hard to read.');

      const seen = await listed(administrator.agent);
      expect(seen.costs).toBeNull();
      expect(seen.drafts.map((proposal) => proposal.estimatedCostUsd)).toEqual([null]);
    } finally {
      await app.close();
    }
  });
});
