import type {
  Proposal,
  ProposalAnswerEvent,
  ProposalsResponse,
  RosterEntry,
  SessionResponse,
} from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureConversation } from '../src/composition/conversation.js';
import { loadConfig } from '../src/config/config.js';
import type { Conversation, ConversationMethod } from '../src/proposals/conversation-method.js';
import { FAKE_ANSWER } from '../src/proposals/fake-conversation-method.js';
import { givenModel, givenTavola } from './support/fixtures.js';
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
): Promise<ProposalAnswerEvent[]> {
  const response = await agent
    .post(`/api/proposals/${proposalId}/turns`)
    .send({ text })
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
});

describe('what the conversation is given', () => {
  const heard: Conversation[] = [];
  const listening: ConversationMethod = {
    name: 'A conversation that writes down what it was given',
    async *answer(conversation) {
      heard.push(structuredClone(conversation));
      yield 'Noted.';
    },
  };

  let app: TestApp;
  beforeAll(async () => {
    app = await startTestApp({
      build: BUILD,
      conversation: { method: listening, unavailable: null },
    });
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
      turns: [
        { speaker: 'author', text: 'Members could note their own car.' },
        { speaker: 'conversation', text: 'Noted.' },
        { speaker: 'author', text: 'For every Member.' },
      ],
    });
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
