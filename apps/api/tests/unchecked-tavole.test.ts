import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { DEFAULT_TEST_NOW, startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Tavola is Unchecked until an Editor publishes it** (ADR 0016, issue #30).
 *
 * A machine-read Tavola is shown to nobody but Editors, because a wrong Catalog Number looks
 * exactly like a right one and people order parts by it. So what is asserted here is mostly
 * absence: every way a Member reaches a drawing — its Model, its Category, its address, its
 * scan, its numbers, search and "also appears on" — has to behave as if it were not there yet.
 */

/** What a form sends: every field a plain string, blank meaning "not recorded". */
function aPart(fields: Partial<Record<string, string>> = {}) {
  return {
    nameEn: '',
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

describe('an Unchecked Tavola', () => {
  let app: TestApp;
  let editor: TestAgent;
  let member: TestAgent;
  let modelId: string;
  let publishedId: string;
  let uncheckedId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app);
    editor = (await givenAMember(app, administrator.agent, { name: 'An Editor', role: 'editor' }))
      .agent;
    member = (await givenAMember(app, administrator.agent)).agent;

    modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' })).id;
    publishedId = (await givenTavola(app.db, modelId, { number: '2', nameEn: 'Front brakes' })).id;
    uncheckedId = (
      await givenTavola(app.db, modelId, {
        number: '84',
        nameEn: 'Rear axle',
        state: 'unchecked',
      })
    ).id;
  });

  async function givenPosition(number: string, onTavola: string): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${onTavola}/positions`)
      .send({ number })
      .expect(201);
    return response.body.positions.find(
      (position: { number: string }) => position.number === number,
    ).id;
  }

  async function givenListed(
    onTavola: string,
    positionId: string,
    what: { part?: ReturnType<typeof aPart>; partId?: string },
  ): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${onTavola}/listings`)
      .send({ positionId, quantityPerCar: 1, drawn: true, ...what })
      .expect(201);
    return response.body.listing.part.id;
  }

  describe('is shown to an Editor', () => {
    it('on its Model, beside the Published ones and told apart from them', async () => {
      const response = await editor.get(`/api/models/${modelId}`).expect(200);

      expect(
        response.body.tavole.map((tavola: { number: string; state: string }) => [
          tavola.number,
          tavola.state,
        ]),
      ).toEqual([
        ['2', 'published'],
        ['84', 'unchecked'],
      ]);
    });

    it('when opened, with nothing yet to say who published it', async () => {
      const response = await editor.get(`/api/tavole/${uncheckedId}`).expect(200);

      expect(response.body.tavola).toMatchObject({ state: 'unchecked', publication: null });
    });
  });

  describe('is not there for a Member', () => {
    it('on its Model', async () => {
      const response = await member.get(`/api/models/${modelId}`).expect(200);

      expect(response.body.tavole.map((tavola: { id: string }) => tavola.id)).toEqual([
        publishedId,
      ]);
    });

    it('in its Model’s progress', async () => {
      const response = await member.get(`/api/models/${modelId}/progress`).expect(200);

      expect(response.body.tavole.map((row: { tavolaId: string }) => row.tavolaId)).toEqual([
        publishedId,
      ]);
    });

    it('under its Category, or in the Category’s count', async () => {
      const category = await member.get('/api/categories/brakes').expect(200);
      expect(category.body.models).toEqual([
        expect.objectContaining({
          tavole: [expect.objectContaining({ id: publishedId })],
        }),
      ]);

      const list = await member.get('/api/categories').expect(200);
      expect(list.body.categories).toEqual([
        expect.objectContaining({ slug: 'brakes', tavole: 1 }),
      ]);
    });

    it('at its own address, which answers as if there were no such Tavola', async () => {
      const response = await member.get(`/api/tavole/${uncheckedId}`).expect(404);
      expect(response.body.error).toMatchObject({ code: 'not_found' });

      await member.get(`/api/tavole/${uncheckedId}/listings`).expect(404);
      await member.get(`/api/tavole/${uncheckedId}/export.csv`).expect(404);
    });

    it('as its scan', async () => {
      const uploaded = await editor
        .put(`/api/tavole/${uncheckedId}/scan`)
        .set('Content-Type', 'application/octet-stream')
        .send(await givenScanImage())
        .expect(201);
      const scanId: string = uploaded.body.scan.id;

      await editor.get(`/api/scans/${scanId}/display`).expect(200);
      await member.get(`/api/scans/${scanId}/display`).expect(404);
      await member.get(`/api/scans/${scanId}/preview`).expect(404);
    });

    it('at any of its numbers', async () => {
      const positionId = await givenPosition('7', uncheckedId);

      await editor.get(`/api/positions/${positionId}/listings`).expect(200);
      await member.get(`/api/positions/${positionId}/listings`).expect(404);
      await member.get(`/api/positions/${positionId}/contributions`).expect(404);
      await member
        .post(`/api/positions/${positionId}/contributions`)
        .send({ text: 'This is the later axle.' })
        .expect(404);
    });

    it('in search, where a Part listed only there is not found', async () => {
      await givenListed(uncheckedId, await givenPosition('7', uncheckedId), {
        part: aPart({ nameEn: 'Half shaft', catalogNumber: '208505/01/D' }),
      });

      const response = await member.get('/api/search').query({ q: 'Half shaft' }).expect(200);
      expect(response.body.matches).toEqual([]);

      const editors = await editor.get('/api/search').query({ q: 'Half shaft' }).expect(200);
      expect(editors.body.matches).toHaveLength(1);
    });

    it('in search, where a Part listed on a Published Tavola too is found there alone', async () => {
      const partId = await givenListed(publishedId, await givenPosition('3', publishedId), {
        part: aPart({ nameEn: 'Spring washer' }),
      });
      await givenListed(uncheckedId, await givenPosition('7', uncheckedId), { partId });

      const response = await member.get('/api/search').query({ q: 'Spring washer' }).expect(200);
      expect(response.body.matches).toEqual([
        expect.objectContaining({
          listings: [expect.objectContaining({ tavolaId: publishedId })],
        }),
      ]);
    });

    it('in a Part’s other sheets', async () => {
      const partId = await givenListed(publishedId, await givenPosition('3', publishedId), {
        part: aPart({ nameEn: 'Spring washer', catalogNumber: '431 02 010' }),
      });
      await givenListed(uncheckedId, await givenPosition('7', uncheckedId), { partId });

      const part = await member.get(`/api/parts/${partId}`).expect(200);
      expect(part.body.listedOn).toEqual([expect.objectContaining({ tavolaId: publishedId })]);

      const lookedUp = await member.get('/api/parts').query({ q: '431 02 010' }).expect(200);
      expect(lookedUp.body.parts[0].listedOn).toEqual([
        expect.objectContaining({ tavolaId: publishedId }),
      ]);
    });
  });

  it('is left out of every Part’s “also appears on”, even for an Editor', async () => {
    const here = await givenPosition('3', publishedId);
    const partId = await givenListed(publishedId, here, {
      part: aPart({ nameEn: 'Spring washer' }),
    });
    await givenListed(uncheckedId, await givenPosition('7', uncheckedId), { partId });

    for (const reader of [member, editor]) {
      const response = await reader.get(`/api/positions/${here}/listings`).expect(200);
      expect(response.body.listings[0].elsewhere).toEqual([]);
    }
  });

  describe('publishing it', () => {
    it('is one action, and records who did it and when', async () => {
      const published = await editor.post(`/api/tavole/${uncheckedId}/publication`).expect(200);

      expect(published.body.tavola).toMatchObject({
        id: uncheckedId,
        state: 'published',
        publication: { at: DEFAULT_TEST_NOW.toISOString(), by: 'An Editor' },
      });

      const opened = await member.get(`/api/tavole/${uncheckedId}`).expect(200);
      expect(opened.body.tavola).toMatchObject({
        state: 'published',
        publication: { at: DEFAULT_TEST_NOW.toISOString(), by: 'An Editor' },
      });
    });

    it('is an Editor’s to do', async () => {
      await member.post(`/api/tavole/${uncheckedId}/publication`).expect(403);
      await editor.get(`/api/tavole/${uncheckedId}`).expect(200);
      expect((await editor.get(`/api/tavole/${uncheckedId}`)).body.tavola.state).toBe('unchecked');
    });

    it('is refused for a Tavola that is Published already, which keeps who vouched for it', async () => {
      await editor.post(`/api/tavole/${uncheckedId}/publication`).expect(200);

      const again = await editor.post(`/api/tavole/${uncheckedId}/publication`).expect(409);
      expect(again.body.error).toMatchObject({ code: 'conflict' });
    });

    it('answers no such Tavola for one that does not exist', async () => {
      await editor.post('/api/tavole/00000000-0000-4000-8000-000000000000/publication').expect(404);
    });
  });

  it('a Tavola an Editor records by hand is Published from the start', async () => {
    const created = await editor
      .post(`/api/models/${modelId}/tavole`)
      .send({ number: '10', nameIt: 'Impianto elettrico', nameEn: 'Electrical system' })
      .expect(201);

    expect(created.body.tavola.state).toBe('published');
    await member.get(`/api/tavole/${created.body.tavola.id}`).expect(200);
  });
});
