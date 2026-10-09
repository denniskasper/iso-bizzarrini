import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Contribution } from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accounts } from '../src/db/schema.js';
import {
  givenModel,
  givenPhotographImage,
  givenPublished,
  givenTavola,
} from './support/fixtures.js';
import { givenAMember, givenAnAdministrator, type RecruitedMember } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Contributions — **what a member knows, in their words, waiting to be checked** (stories 83–91).
 *
 * The rule the whole file turns on is the one the spec names at this seam: *a Contribution is
 * invisible to other members until published and shows its byline afterwards.* Members write on
 * the understanding that nothing of theirs appears under the Club's name unchecked, and the
 * archive is only worth reading while that holds — so "nobody else sees it" is asserted of the
 * text, of the photographs, and of every address either can be asked for at.
 *
 * Publishing is an Editor's and arrives with issue #6. Where a test needs a Contribution that
 * has been published, it is arranged rather than driven, like every other starting state here.
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

describe('Contributions', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let clara: RecruitedMember;
  let partId: string;
  let tavolaId: string;
  /** The number the caliper sits at. */
  let positionId: string;

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

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id, { number: '2' });
    tavolaId = tavola.id;

    const sheet = await editor
      .post(`/api/tavole/${tavola.id}/positions`)
      .send({ number: '1' })
      .expect(201);
    positionId = sheet.body.positions[0].id;

    const recorded = await editor
      .post(`/api/tavole/${tavola.id}/listings`)
      .send({ positionId, drawn: true, part: aPart() })
      .expect(201);
    partId = recorded.body.listing.part.id;
  });

  /** What somebody reading the caliper's number is shown, which is the only place these are read. */
  async function readAs(agent: TestAgent, at = positionId): Promise<Contribution[]> {
    const response = await agent.get(`/api/positions/${at}/contributions`).expect(200);
    return response.body.contributions;
  }

  describe('writing one', () => {
    it('arrives, carries who wrote it and when, and is waiting to be checked', async () => {
      app.clock.setTo(new Date('2026-03-04T18:30:00.000Z'));

      const sent = await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: 'The early caliper has the bleed nipple on the inboard side.' })
        .expect(201);

      const expected = {
        id: sent.body.contribution.id,
        target: { kind: 'part', partId },
        text: 'The early caliper has the bleed nipple on the inboard side.',
        correction: false,
        authorName: 'Clara Conti',
        writtenAt: '2026-03-04T18:30:00.000Z',
        state: 'waiting',
        mine: true,
        photographs: [],
      };
      expect(sent.body.contribution).toEqual(expected);

      // And it is there when she comes back to the number, which is how she knows it arrived.
      expect(await readAs(clara.agent)).toEqual([expected]);
    });

    /**
     * **The gap a member can fill** (story 84). The archive shows which numbers have nothing
     * recorded at them, and that would be a taunt if the only thing that could be written about
     * were a Part somebody had already recorded.
     */
    it('can be about a number nothing is recorded at yet', async () => {
      const sheet = await editor
        .post(`/api/tavole/${tavolaId}/positions`)
        .send({ number: '14' })
        .expect(201);
      const empty = sheet.body.positions.find(
        (position: { number: string }) => position.number === '14',
      ).id;

      const sent = await clara.agent
        .post(`/api/positions/${empty}/contributions`)
        .send({ text: 'This is the dust shield. Mine is stamped 7.02.114 on the back.' })
        .expect(201);

      expect(sent.body.contribution).toMatchObject({
        target: { kind: 'position', positionId: empty },
        state: 'waiting',
        mine: true,
      });
      expect(await readAs(clara.agent, empty)).toEqual([sent.body.contribution]);
    });

    it('is refused about a Part or a number the archive does not hold', async () => {
      const nothing = '00000000-0000-4000-8000-000000000000';
      const written = { text: 'Something I know.' };

      await clara.agent.post(`/api/parts/${nothing}/contributions`).send(written).expect(404);
      await clara.agent.post(`/api/positions/${nothing}/contributions`).send(written).expect(404);
      await clara.agent.get(`/api/positions/${nothing}/contributions`).expect(404);
    });

    it('is refused with nothing in it, and at a length nobody writes by hand', async () => {
      const blank = await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: '   \n  ' })
        .expect(400);
      expect(blank.body.error.message).toBe('Write what you know before sending it.');

      await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: 'x'.repeat(10_001) })
        .expect(400);

      expect(await readAs(clara.agent)).toEqual([]);
    });

    /**
     * **Reporting that the record is wrong is the same thing, said with one more word**
     * (story 90). No field is named and nothing is proposed: the member says what is wrong and
     * an Editor's hand is what changes the Part.
     */
    it('can say that the Part’s record is wrong', async () => {
      const sent = await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: 'The catalog number here is the late caliper’s.', correction: true })
        .expect(201);

      expect(sent.body.contribution).toMatchObject({ correction: true, state: 'waiting' });
    });

    /** There is no record at a bare number to be wrong. What a member has there is knowledge. */
    it('cannot say that about a number, which has no record to be wrong', async () => {
      const refused = await clara.agent
        .post(`/api/positions/${positionId}/contributions`)
        .send({ text: 'This is wrong.', correction: true })
        .expect(400);

      expect(refused.body.error.code).toBe('validation_failed');
    });
  });

  describe('who is shown one', () => {
    let dario: RecruitedMember;
    let contributionId: string;

    beforeEach(async () => {
      dario = await givenAMember(app, administrator, { name: 'Dario Esposito' });

      app.clock.setTo(new Date('2026-03-04T18:30:00.000Z'));
      const sent = await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: 'Bleed nipple inboard on the early caliper — zinc, not cadmium.' })
        .expect(201);
      contributionId = sent.body.contribution.id;
    });

    /**
     * **The promise members write under.** Not another member, not the Editor reading the same
     * number, and not the search box — which does not look at Contributions at all, and is asked
     * here so that the day it does, this is what fails.
     */
    it('is nobody but its author while it waits to be checked', async () => {
      expect(await readAs(dario.agent)).toEqual([]);
      expect(await readAs(editor)).toEqual([]);

      const found = await dario.agent.get('/api/search?q=cadmium').expect(200);
      expect(found.body.matches).toEqual([]);

      expect(await readAs(clara.agent)).toHaveLength(1);
    });

    it('is every member once it is published, with who wrote it and when', async () => {
      await givenPublished(app.db, contributionId);

      expect(await readAs(dario.agent)).toEqual([
        {
          id: contributionId,
          target: { kind: 'part', partId },
          text: 'Bleed nipple inboard on the early caliper — zinc, not cadmium.',
          correction: false,
          authorName: 'Clara Conti',
          writtenAt: '2026-03-04T18:30:00.000Z',
          state: 'published',
          mine: false,
          photographs: [],
        },
      ]);

      // Its author reads the same thing, told it is theirs and that it is no longer waiting.
      expect(await readAs(clara.agent)).toMatchObject([{ state: 'published', mine: true }]);
    });

    /**
     * **A Part is one thing wherever it is listed** (ADR 0001), so what is known about it is
     * known at every number it sits at — including on a sheet its author never opened.
     */
    it('is read at every number the Part sits at, and oldest first', async () => {
      await givenPublished(app.db, contributionId);

      const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
      const other = await givenTavola(app.db, model.id, { number: '9' });
      const sheet = await editor
        .post(`/api/tavole/${other.id}/positions`)
        .send({ number: '40' })
        .expect(201);
      const elsewhere = sheet.body.positions[0].id;
      await editor
        .post(`/api/tavole/${other.id}/listings`)
        .send({ positionId: elsewhere, drawn: true, partId })
        .expect(201);

      app.clock.setTo(new Date('2026-03-09T08:00:00.000Z'));
      const later = await dario.agent
        .post(`/api/positions/${elsewhere}/contributions`)
        .send({ text: 'On the Rivolta this number is the caliper too.' })
        .expect(201);

      const read = await readAs(dario.agent, elsewhere);
      expect(read.map((contribution) => contribution.id)).toEqual([
        contributionId,
        later.body.contribution.id,
      ]);
    });

    /**
     * **The knowledge stays; the identification does not** (ADR 0007). Deleting an Account is
     * issue #7's to do. What is proved here is only that when it happens, what the member said
     * is still in the archive and no longer says who said it.
     */
    it('outlives the Account that wrote it, with nobody’s name on it', async () => {
      await givenPublished(app.db, contributionId);
      await app.db.delete(accounts).where(eq(accounts.id, clara.entry.id));

      expect(await readAs(dario.agent)).toMatchObject([
        { id: contributionId, authorName: null, mine: false, state: 'published' },
      ]);
    });
  });

  /**
   * Everything else hung off a Part or a number goes when it does, because everything else is
   * the archive's own record. This is a member's — so the Editor is refused, and told why,
   * rather than taking somebody's words out with a row they were tidying.
   */
  describe('what it was written about', () => {
    it('cannot be removed from under it — neither the Part nor the number', async () => {
      await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: 'Mine has a different casting number.' })
        .expect(201);
      await clara.agent
        .post(`/api/positions/${positionId}/contributions`)
        .send({ text: 'This number is printed twice on my copy of the sheet.' })
        .expect(201);

      // The Part is listed nowhere now, which is otherwise all removing one waits for.
      const listings = await editor.get(`/api/positions/${positionId}/listings`).expect(200);
      await editor.delete(`/api/listings/${listings.body.listings[0].id}`).expect(204);

      const part = await editor.delete(`/api/parts/${partId}`).expect(409);
      expect(part.body.error.code).toBe('conflict');
      expect(part.body.error.message).toMatch(/Contribution/);

      const position = await editor.delete(`/api/positions/${positionId}`).expect(409);
      expect(position.body.error.code).toBe('conflict');
      expect(position.body.error.message).toMatch(/Contribution/);

      await editor.get(`/api/parts/${partId}`).expect(200);
      expect(await readAs(clara.agent)).toHaveLength(1);
    });
  });

  /**
   * **Showing rather than describing** (story 85), on the upload path a Part's own photographs
   * use: the picture is the request body, ingest decides what it is, and it is stored where
   * nothing serves it (ADR 0006).
   *
   * What is new is who may see it. A Part's photograph is the record; one of these is a
   * member's, and is exactly as private as the words it came with for exactly as long.
   */
  describe('photographs with one', () => {
    let dario: RecruitedMember;
    let contributionId: string;

    beforeEach(async () => {
      dario = await givenAMember(app, administrator, { name: 'Dario Esposito' });

      const sent = await clara.agent
        .post(`/api/parts/${partId}/contributions`)
        .send({ text: 'Here is the casting mark on mine.' })
        .expect(201);
      contributionId = sent.body.contribution.id;
    });

    function attach(agent: TestAgent, image: Buffer, to = contributionId) {
      return agent
        .post(`/api/contributions/${to}/photographs`)
        .set('Content-Type', 'image/jpeg')
        .send(image);
    }

    it('are attached by its author, prepared at ingest, and shown to them', async () => {
      const attached = await attach(
        clara.agent,
        await givenPhotographImage({ width: 4032, height: 3024, format: 'jpeg' }),
      ).expect(201);

      const [photograph] = attached.body.contribution.photographs;
      // Brought down to what a phone in a garage will receive, as a Part's own are.
      expect(photograph).toMatchObject({ width: 2400, height: 1800 });
      expect(attached.body.contribution).toMatchObject({ id: contributionId, state: 'waiting' });

      const display = await clara.agent.get(photograph.displayUrl).expect(200);
      expect(display.headers['content-type']).toBe('image/webp');
      const preview = await clara.agent.get(photograph.previewUrl).expect(200);
      expect((await sharp(preview.body as Buffer).metadata()).width).toBe(480);

      // And they come back with the Contribution, in the order they were attached.
      const second = await attach(clara.agent, await givenPhotographImage()).expect(201);
      const [read] = await readAs(clara.agent);
      expect(read?.photographs).toEqual(second.body.contribution.photographs);
      expect(read?.photographs.map((each) => each.id)[0]).toBe(photograph.id);
      expect(read?.photographs).toHaveLength(2);
    });

    /**
     * **A picture is asked for by address, with nobody pressing anything**, so the rule about the
     * words has to be the rule about the image too — or a waiting Contribution is one guessed
     * link away from being seen. Refused as *not there*, which says nothing about whether it is.
     */
    it('are served to nobody else while the Contribution waits, and to members once it is published', async () => {
      const attached = await attach(clara.agent, await givenPhotographImage()).expect(201);
      const { displayUrl, previewUrl } = attached.body.contribution.photographs[0];

      for (const url of [displayUrl, previewUrl]) {
        for (const somebodyElse of [dario.agent, editor]) {
          const refused = await somebodyElse.get(url).expect(404);
          expect(refused.body.error.code).toBe('not_found');
        }
        await app.request().get(url).expect(401);
      }

      await givenPublished(app.db, contributionId);

      await dario.agent.get(displayUrl).expect(200);
      await dario.agent.get(previewUrl).expect(200);
      expect((await readAs(dario.agent))[0]?.photographs).toHaveLength(1);
      // Published is published to the Club. It is still on no public path.
      await app.request().get(displayUrl).expect(401);
    });

    it('are only its author’s to attach, and only while it waits', async () => {
      const image = await givenPhotographImage();

      // Dario cannot see that there is such a Contribution, and is told there is not.
      await attach(dario.agent, image).expect(404);

      await givenPublished(app.db, contributionId);

      // Now he can see it, and it is still not his.
      const notHis = await attach(dario.agent, image).expect(403);
      expect(notHis.body.error.code).toBe('forbidden');

      // And it is no longer hers to add to: what was checked is what was published.
      const checked = await attach(clara.agent, image).expect(409);
      expect(checked.body.error.code).toBe('conflict');

      expect((await readAs(clara.agent))[0]?.photographs).toEqual([]);
    });

    it('stop at eight, which is more than anybody needs to show one part', async () => {
      const image = await givenPhotographImage({ width: 320, height: 240 });
      for (let sent = 0; sent < 8; sent += 1) {
        await attach(clara.agent, image).expect(201);
      }

      const ninth = await attach(clara.agent, image).expect(409);
      expect(ninth.body.error.message).toMatch(/eight/);
      expect((await readAs(clara.agent))[0]?.photographs).toHaveLength(8);
    });

    it('are refused when what arrived is not a picture, and nothing is kept of it', async () => {
      // The store is this file's for as long as it runs, so what is compared is before and after.
      const stored = () => readdir(join(app.filesPath, 'photographs')).catch(() => []);
      const before = await stored();

      await attach(clara.agent, Buffer.from('not a photograph at all')).expect(415);

      expect((await readAs(clara.agent))[0]?.photographs).toEqual([]);
      expect(await stored()).toEqual(before);
    });
  });
});
