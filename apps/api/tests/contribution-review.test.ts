import type { Contribution, WaitingContribution } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenPhotographImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Deciding Contributions — **what an Editor does with what members have sent** (stories 115–120).
 *
 * The other half of `contributions.test.ts`, and the half that makes its promise worth anything:
 * nothing of a member's appears unchecked, so somebody has to check it, and nothing sent may be
 * left to sit. What is asserted here is what the Club would recognise — that the oldest is first,
 * that publishing shows a Contribution to everybody and discarding shows it to nobody, and that
 * a good one changes the archive itself rather than hanging beside it as a comment.
 */

/** What a form sends about a Part: every field a plain string, blank meaning "not recorded". */
function aPart(fields: Record<string, string> = {}) {
  return {
    nameEn: 'Front brake caliper',
    nameIt: '',
    catalogNumber: '',
    disegnoOrigine: '',
    description: '',
    dimensions: '',
    materialFinish: '',
    catalogNote: '',
    note: '',
    ...fields,
  };
}

describe('Deciding Contributions', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let clara: RecruitedMember;
  let dario: RecruitedMember;
  let partId: string;
  let tavolaId: string;
  /** The number the caliper sits at. */
  let positionId: string;
  /** A number on the same sheet with nothing recorded at it. */
  let emptyPositionId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();

    administrator = (await givenAnAdministrator(app)).agent;
    editor = (await givenAMember(app, administrator, { name: 'An Editor', role: 'editor' })).agent;
    clara = await givenAMember(app, administrator, { name: 'Clara Conti' });
    dario = await givenAMember(app, administrator, { name: 'Dario Esposito' });

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id, { number: '2' });
    tavolaId = tavola.id;

    await editor.post(`/api/tavole/${tavolaId}/positions`).send({ number: '1' }).expect(201);
    const sheet = await editor
      .post(`/api/tavole/${tavolaId}/positions`)
      .send({ number: '14' })
      .expect(201);
    const numbered = (number: string): string =>
      sheet.body.positions.find((position: { number: string }) => position.number === number).id;
    positionId = numbered('1');
    emptyPositionId = numbered('14');

    const recorded = await editor
      .post(`/api/tavole/${tavolaId}/listings`)
      .send({ positionId, drawn: true, part: aPart({ catalogNumber: '7.02.100' }) })
      .expect(201);
    partId = recorded.body.listing.part.id;
  });

  async function writeAboutPart(
    member: RecruitedMember,
    text: string,
    correction = false,
  ): Promise<string> {
    const sent = await member.agent
      .post(`/api/parts/${partId}/contributions`)
      .send({ text, correction })
      .expect(201);
    return sent.body.contribution.id;
  }

  async function writeAboutEmptyNumber(member: RecruitedMember, text: string): Promise<string> {
    const sent = await member.agent
      .post(`/api/positions/${emptyPositionId}/contributions`)
      .send({ text })
      .expect(201);
    return sent.body.contribution.id;
  }

  async function waiting(agent: TestAgent = editor): Promise<WaitingContribution[]> {
    const response = await agent.get('/api/contributions/waiting').expect(200);
    return response.body.contributions;
  }

  async function howManyWait(agent: TestAgent = editor): Promise<number> {
    const response = await agent.get('/api/contributions/waiting/count').expect(200);
    return response.body.waiting;
  }

  /** What a member reading a number is shown there. */
  async function readAs(agent: TestAgent, at = positionId): Promise<Contribution[]> {
    const response = await agent.get(`/api/positions/${at}/contributions`).expect(200);
    return response.body.contributions;
  }

  function decide(id: string, decision: 'publish' | 'discard', agent: TestAgent = editor) {
    return agent.put(`/api/contributions/${id}/decision`).send({ decision });
  }

  function attach(member: RecruitedMember, contributionId: string, image: Buffer) {
    return member.agent
      .post(`/api/contributions/${contributionId}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(image);
  }

  describe('what is waiting', () => {
    /**
     * **Oldest first, so nobody's is forgotten** (story 115). The order is by when it was
     * written and not by what it is about: the queue is the members' turn, not the catalog's.
     */
    it('is everything nobody has decided, oldest first, with how many there are', async () => {
      app.clock.setTo(new Date('2026-03-09T08:00:00.000Z'));
      const later = await writeAboutEmptyNumber(dario, 'This is the dust shield.');
      app.clock.setTo(new Date('2026-03-04T18:30:00.000Z'));
      const earlier = await writeAboutPart(clara, 'Bleed nipple inboard on the early caliper.');

      const queue = await waiting();
      expect(queue.map((each) => each.contribution.id)).toEqual([earlier, later]);
      expect(queue[0]?.contribution).toMatchObject({
        text: 'Bleed nipple inboard on the early caliper.',
        authorName: 'Clara Conti',
        writtenAt: '2026-03-04T18:30:00.000Z',
        state: 'waiting',
        mine: false,
      });
      expect(await howManyWait()).toBe(2);
    });

    /**
     * **Beside what the archive already says** (story 116): the whole Part and every sheet a
     * correction to it would reach, or the number and whatever sits at it — which for a gap is
     * nothing, and that is the point of the Contribution.
     */
    it('comes with the record it is about, as the archive has it now', async () => {
      await writeAboutPart(clara, 'The catalog number here is the late caliper’s.', true);
      app.clock.advanceBy(60_000);
      await writeAboutEmptyNumber(dario, 'This is the dust shield.');

      const [aboutPart, aboutNumber] = await waiting();

      expect(aboutPart?.subject).toMatchObject({
        kind: 'part',
        part: { id: partId, nameEn: 'Front brake caliper', catalogNumber: '7.02.100' },
        listedOn: [{ tavolaId, tavolaNumber: '2', model: { brand: 'Iso', name: 'Grifo' } }],
      });
      expect(aboutNumber?.subject).toMatchObject({
        kind: 'position',
        position: { id: emptyPositionId, number: '14' },
        tavola: { id: tavolaId, number: '2', model: { brand: 'Iso', name: 'Grifo' } },
        listings: [],
      });
    });

    it('is an Editor’s to read, and no other member’s', async () => {
      await writeAboutPart(clara, 'Something only an Editor should be reading yet.');

      for (const address of ['/api/contributions/waiting', '/api/contributions/waiting/count']) {
        const refused = await dario.agent.get(address).expect(403);
        expect(refused.body.error.code).toBe('forbidden');
        // Not even to the member who wrote the one thing in it.
        await clara.agent.get(address).expect(403);
        await administrator.get(address).expect(200);
      }
    });

    /**
     * **An Editor has edit rights and simply makes the change.** Nothing they do to the catalog
     * is anybody's to check, so nothing they do to it waits.
     */
    it('never holds an Editor’s own changes to the catalog', async () => {
      await editor
        .patch(`/api/parts/${partId}`)
        .send(aPart({ note: 'Bleed nipple inboard on early cars.' }))
        .expect(200);
      await editor
        .post(`/api/tavole/${tavolaId}/listings`)
        .send({ positionId: emptyPositionId, drawn: true, part: aPart({ nameEn: 'Dust shield' }) })
        .expect(201);

      expect(await waiting()).toEqual([]);
      expect(await howManyWait()).toBe(0);
    });
  });

  describe('deciding one', () => {
    /**
     * **Only checked knowledge appears** (story 117), and what appears says who knew it and when
     * they said so — the date it was written, not the date somebody got round to reading it.
     */
    it('publishes it to every member under its author’s name and date', async () => {
      app.clock.setTo(new Date('2026-03-04T18:30:00.000Z'));
      const id = await writeAboutPart(clara, 'Bleed nipple inboard on the early caliper.');
      app.clock.setTo(new Date('2026-04-01T09:00:00.000Z'));

      const decided = await decide(id, 'publish').expect(200);
      // Answered with what is still waiting, which no longer includes it.
      expect(decided.body.contributions).toEqual([]);
      expect(await howManyWait()).toBe(0);

      expect(await readAs(dario.agent)).toMatchObject([
        {
          id,
          text: 'Bleed nipple inboard on the early caliper.',
          authorName: 'Clara Conti',
          writtenAt: '2026-03-04T18:30:00.000Z',
          state: 'published',
          mine: false,
        },
      ]);
    });

    it('discards it, and then nobody is shown it — its author included', async () => {
      const id = await writeAboutPart(clara, 'Buy cheap calipers at my shop.');
      const picture = await attach(clara, id, await givenPhotographImage()).expect(201);
      const { displayUrl } = picture.body.contribution.photographs[0];

      await decide(id, 'discard').expect(200);

      expect(await waiting()).toEqual([]);
      expect(await readAs(dario.agent)).toEqual([]);
      expect(await readAs(clara.agent)).toEqual([]);
      expect(await readAs(editor)).toEqual([]);
      for (const anybody of [clara.agent, dario.agent, editor]) {
        await anybody.get(displayUrl).expect(404);
      }
    });

    it('is done once: what has been decided cannot be decided again', async () => {
      const id = await writeAboutPart(clara, 'Bleed nipple inboard on the early caliper.');
      await decide(id, 'discard').expect(200);

      const again = await decide(id, 'publish').expect(409);
      expect(again.body.error.code).toBe('conflict');
      expect(await readAs(dario.agent)).toEqual([]);

      await decide('00000000-0000-4000-8000-000000000000', 'publish').expect(404);
      await editor.put(`/api/contributions/${id}/decision`).send({ decision: 'maybe' }).expect(400);
    });

    it('is not a member’s to do, even about what they wrote themselves', async () => {
      const id = await writeAboutPart(clara, 'Bleed nipple inboard on the early caliper.');

      await decide(id, 'publish', clara.agent).expect(403);

      expect(await readAs(dario.agent)).toEqual([]);
      expect(await howManyWait()).toBe(1);
    });
  });

  /**
   * **A good correction changes the archive and not just the comments** (story 118). There is
   * no diff to apply: the Editor reads what the member said and edits the Part with the tools
   * the archive already has, and the queue shows the record as it stands after.
   */
  describe('correcting the record while reviewing', () => {
    it('shows the Part as the Editor has just left it, beside what the member said', async () => {
      const id = await writeAboutPart(
        clara,
        'The number is 7.02.101 — .100 is the late one.',
        true,
      );

      await editor
        .patch(`/api/parts/${partId}`)
        .send(aPart({ catalogNumber: '7.02.101' }))
        .expect(200);

      const [reviewing] = await waiting();
      expect(reviewing).toMatchObject({
        contribution: { id, correction: true, state: 'waiting' },
        subject: { kind: 'part', part: { catalogNumber: '7.02.101' } },
      });

      // And once it is folded in, the report itself need not be published beside the fix.
      await decide(id, 'discard').expect(200);
      const listings = await dario.agent.get(`/api/positions/${positionId}/listings`).expect(200);
      expect(listings.body.listings[0].part.catalogNumber).toBe('7.02.101');
      expect(await readAs(dario.agent)).toEqual([]);
    });
  });

  /**
   * **Good pictures become part of the record** (story 119). The photograph is *moved*: it is
   * the Part's from then on, in the Part's own order, served to every member like any other —
   * whatever is then decided about the words it arrived with.
   */
  describe('a photograph with one', () => {
    let contributionId: string;
    let photograph: { id: string; displayUrl: string; previewUrl: string };

    beforeEach(async () => {
      contributionId = await writeAboutPart(clara, 'Here is the casting mark on mine.');
      const attached = await attach(clara, contributionId, await givenPhotographImage());
      [photograph] = attached.body.contribution.photographs;
    });

    function promote(id: string, agent: TestAgent = editor) {
      return agent.post(`/api/contribution-photographs/${id}/promotion`);
    }

    /** An Editor cannot judge a picture they are not shown. Everybody else still is not. */
    it('is shown to the Editor checking it, and still to no other member', async () => {
      const [reviewing] = await waiting();
      expect(reviewing?.contribution.photographs).toMatchObject([{ id: photograph.id }]);

      await editor.get(photograph.displayUrl).expect(200);
      await administrator.get(photograph.previewUrl).expect(200);
      await dario.agent.get(photograph.displayUrl).expect(404);
    });

    it('can be moved onto the Part, where every member then sees it', async () => {
      const promoted = await promote(photograph.id).expect(200);

      // It has left the Contribution, which is still waiting to be decided…
      expect(promoted.body.contributions).toMatchObject([
        { contribution: { id: contributionId, photographs: [] } },
      ]);
      // …and it is the Part's.
      const [onPart] = promoted.body.contributions[0].subject.part.photographs;
      expect(onPart).toMatchObject({ id: photograph.id });

      const listings = await dario.agent.get(`/api/positions/${positionId}/listings`).expect(200);
      expect(listings.body.listings[0].part.photographs).toEqual([onPart]);
      await dario.agent.get(onPart.displayUrl).expect(200);
      // Its old address is nobody's any more.
      await clara.agent.get(photograph.displayUrl).expect(404);

      // Discarding the words afterwards takes nothing off the Part.
      await decide(contributionId, 'discard').expect(200);
      await dario.agent.get(onPart.previewUrl).expect(200);
    });

    it('goes after the photographs the Part already has', async () => {
      const first = await editor
        .post(`/api/parts/${partId}/photographs`)
        .set('Content-Type', 'image/jpeg')
        .send(await givenPhotographImage())
        .expect(201);

      await promote(photograph.id).expect(200);

      const part = await editor.get(`/api/parts/${partId}`).expect(200);
      expect(part.body.part.photographs.map((each: { id: string }) => each.id)).toEqual([
        first.body.part.photographs[0].id,
        photograph.id,
      ]);
    });

    it('has no Part to go onto while the Contribution is about a bare number', async () => {
      const aboutNumber = await writeAboutEmptyNumber(dario, 'This is the dust shield.');
      const attached = await attach(dario, aboutNumber, await givenPhotographImage()).expect(201);

      const refused = await promote(attached.body.contribution.photographs[0].id).expect(409);
      expect(refused.body.error.message).toMatch(/Record the Part/);
    });

    it('is an Editor’s to move, and only while the Contribution waits', async () => {
      await promote(photograph.id, clara.agent).expect(403);
      await promote('00000000-0000-4000-8000-000000000000').expect(404);

      await decide(contributionId, 'publish').expect(200);
      await promote(photograph.id).expect(409);

      // Still with the published Contribution, where every member sees it.
      expect((await readAs(dario.agent))[0]?.photographs).toMatchObject([{ id: photograph.id }]);
    });
  });

  /**
   * **Gaps get filled by the people who know** (story 120). The Editor records the Part from
   * what the member wrote; the Contribution is that Part's from then on, so it is read wherever
   * the Part is listed and its photographs have somewhere to go.
   */
  describe('one about a number nothing is recorded at', () => {
    let contributionId: string;

    beforeEach(async () => {
      contributionId = await writeAboutEmptyNumber(
        dario,
        'This is the dust shield. Mine is stamped 7.02.114 on the back.',
      );
    });

    function recordPart(body: object, id = contributionId, agent: TestAgent = editor) {
      return agent.post(`/api/contributions/${id}/part`).send(body);
    }

    it('becomes a real Part and Listing there, and is that Part’s from then on', async () => {
      const recorded = await recordPart({
        drawn: true,
        quantityPerCar: 2,
        part: aPart({ nameEn: 'Dust shield', catalogNumber: '7.02.114' }),
      }).expect(201);

      const [reviewing] = recorded.body.contributions;
      expect(reviewing).toMatchObject({
        contribution: { id: contributionId, state: 'waiting' },
        subject: {
          kind: 'part',
          part: { nameEn: 'Dust shield', catalogNumber: '7.02.114' },
          listedOn: [{ tavolaId }],
        },
      });
      const shieldId = reviewing.subject.part.id;
      expect(reviewing.contribution.target).toEqual({ kind: 'part', partId: shieldId });

      // The gap is filled for every member, whatever is decided about the words.
      const listings = await clara.agent
        .get(`/api/positions/${emptyPositionId}/listings`)
        .expect(200);
      expect(listings.body.listings).toMatchObject([
        { drawn: true, quantityPerCar: 2, part: { id: shieldId, nameEn: 'Dust shield' } },
      ]);

      await decide(contributionId, 'publish').expect(200);
      expect(await readAs(clara.agent, emptyPositionId)).toMatchObject([
        { id: contributionId, authorName: 'Dario Esposito', target: { kind: 'part' } },
      ]);
    });

    /** A Part used on six drawings stays one Part (ADR 0001), here as everywhere. */
    it('can be a Part the archive already has, listed at the number', async () => {
      const recorded = await recordPart({ drawn: true, partId }).expect(201);

      expect(recorded.body.contributions[0].contribution.target).toEqual({
        kind: 'part',
        partId,
      });
      const listings = await clara.agent
        .get(`/api/positions/${emptyPositionId}/listings`)
        .expect(200);
      expect(listings.body.listings).toMatchObject([{ part: { id: partId } }]);
    });

    it('is refused a Catalog Number the archive already holds, and shown the Part that has it', async () => {
      const refused = await recordPart({
        drawn: true,
        part: aPart({ nameEn: 'Dust shield', catalogNumber: '7.02.100' }),
      }).expect(409);

      expect(refused.body.error.details.part.id).toBe(partId);
      // Nothing was recorded, and the Contribution is still about the number.
      expect((await waiting())[0]?.subject).toMatchObject({ kind: 'position', listings: [] });
    });

    /**
     * Two Editors with the same Contribution open, pressing at the same moment. One Part is
     * recorded and one of them is told the other got there — not two copies of the same shield
     * at one number, which is the duplicate the archive exists to prevent (ADR 0001).
     */
    it('is recorded once when two Editors press at the same moment', async () => {
      const part = { drawn: true, part: aPart({ nameEn: 'Dust shield' }) };

      const answers = await Promise.all([
        recordPart(part),
        recordPart(part, contributionId, administrator),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      const refused = answers.find((answer) => answer.status === 409);
      expect(refused?.body.error.message).toMatch(/already about a Part/);

      const listings = await clara.agent
        .get(`/api/positions/${emptyPositionId}/listings`)
        .expect(200);
      expect(listings.body.listings).toHaveLength(1);
    });

    it('is only for a Contribution about a number, and only while it waits', async () => {
      const part = { drawn: true, part: aPart({ nameEn: 'Dust shield' }) };

      await recordPart(part, contributionId, dario.agent).expect(403);
      await recordPart(part, '00000000-0000-4000-8000-000000000000').expect(404);

      const aboutPart = await writeAboutPart(clara, 'Bleed nipple inboard.');
      const already = await recordPart(part, aboutPart).expect(409);
      expect(already.body.error.message).toMatch(/already about a Part/);

      await decide(contributionId, 'discard').expect(200);
      await recordPart(part).expect(409);

      const listings = await clara.agent
        .get(`/api/positions/${emptyPositionId}/listings`)
        .expect(200);
      expect(listings.body.listings).toEqual([]);
    });
  });
});
