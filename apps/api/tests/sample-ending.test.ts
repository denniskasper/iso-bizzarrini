import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator, givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Sample ends when its open number goes** (issue #130). A Sample shows the current Tavola, so
 * an Editor's corrections reach Visitors at once; the one correction that breaks it is removing
 * the number Visitors may read. Then it stops being a Sample, its public copy is deleted, and
 * Administrators are told, so they can show it again with another number.
 */
describe('a Sample ending', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let tavolaId: string;
  let seven: string;
  let nine: string;
  /** The public copy's address while it is shown. */
  let drawingUrl: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    editor = await givenAnEditor(app);

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12', nameEn: 'Brakes' })).id;
    await administrator
      .put(`/api/tavole/${tavolaId}/scan`)
      .set('Content-Type', 'image/png')
      .send(await givenScanImage())
      .expect(201);
    seven = await givenPosition('7');
    nine = await givenPosition('9');
    const shown = await show(seven).expect(200);
    drawingUrl = shown.body.sample.drawing.url;
  });

  async function givenPosition(number: string): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${tavolaId}/marks`)
      .send({ number, x: 0.4, y: 0.6 })
      .expect(201);
    return (response.body.positions as { id: string; number: string }[]).find(
      (position) => position.number === number,
    )!.id;
  }

  function show(positionId: string) {
    return administrator.put(`/api/tavole/${tavolaId}/sample`).send({ positionId });
  }

  async function asAdministratorsRead() {
    return (await administrator.get(`/api/tavole/${tavolaId}`).expect(200)).body.tavola as {
      sample: { open: { number: string }; drawing: { url: string } } | null;
      endedSample: { openNumber: string; endedAt: string; reason: string } | null;
    };
  }

  async function storedCopies(): Promise<string[]> {
    return readdir(join(app.filesPath, 'sample-drawings')).catch(() => []);
  }

  describe('when its open number is removed', () => {
    it('stops being a Sample, and its public copy is deleted', async () => {
      await editor.delete(`/api/positions/${seven}`).expect(200);

      expect((await asAdministratorsRead()).sample).toBeNull();
      await app.request().get(drawingUrl).expect(404);
      expect(await storedCopies()).not.toContain(drawingUrl.split('/').at(-1));
      await app.request().get(`/api/landing/samples/${tavolaId}`).expect(404);
      const landing = await app.request().get('/api/landing').expect(200);
      expect(landing.body.landing.samples).toEqual([]);
    });

    it('tells Administrators that it ended, when and why, on the Tavola and in the list', async () => {
      app.clock.advanceBy(60_000);
      await editor.delete(`/api/positions/${seven}`).expect(200);

      const ended = { openNumber: '7', endedAt: app.clock.now().toISOString(), reason: 'removed' };
      expect((await asAdministratorsRead()).endedSample).toEqual(ended);

      const listed = await administrator.get('/api/samples').expect(200);
      expect(listed.body.samples).toEqual([]);
      expect(listed.body.ended).toEqual([
        {
          ...ended,
          tavola: expect.objectContaining({
            id: tavolaId,
            number: '12',
            nameEn: 'Brakes',
            model: expect.objectContaining({ name: 'Grifo' }),
          }),
        },
      ]);
    });

    it('tells nobody but Administrators', async () => {
      await editor.delete(`/api/positions/${seven}`).expect(200);

      const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
      for (const agent of [editor, member]) {
        const read = await agent.get(`/api/tavole/${tavolaId}`).expect(200);
        expect(read.body.tavola).not.toHaveProperty('endedSample');
      }
    });

    it('can be shown again with another number, which is no longer an ending', async () => {
      await editor.delete(`/api/positions/${seven}`).expect(200);

      const again = await show(nine).expect(200);

      expect(again.body.sample.open.number).toBe('9');
      expect(again.body.sample.drawing.url).not.toBe(drawingUrl);
      await app.request().get(again.body.sample.drawing.url).expect(200);
      expect((await asAdministratorsRead()).endedSample).toBeNull();
      const listed = await administrator.get('/api/samples').expect(200);
      expect(listed.body.ended).toEqual([]);
    });

    it('can be set aside by stopping it, after which it is not shown or told about', async () => {
      await editor.delete(`/api/positions/${seven}`).expect(200);

      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(204);

      expect(await asAdministratorsRead()).toMatchObject({ sample: null, endedSample: null });
      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(404);
    });

    it('does not end while members have written about the number, and it stays', async () => {
      const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
      await member
        .post(`/api/positions/${seven}/contributions`)
        .send({ text: 'About the number' })
        .expect(201);

      await editor.delete(`/api/positions/${seven}`).expect(409);

      expect(await asAdministratorsRead()).toMatchObject({
        sample: { open: { number: '7' } },
        endedSample: null,
      });
      await app.request().get(drawingUrl).expect(200);
    });
  });

  describe('other corrections to the Tavola', () => {
    it('leave it a Sample with the same number open and the same public copy', async () => {
      const markOfSeven = (
        (await editor.get(`/api/tavole/${tavolaId}`).expect(200)).body.positions as {
          number: string;
          marks: { id: string }[];
        }[]
      ).find((position) => position.number === '7')!.marks[0]!.id;

      await editor.delete(`/api/positions/${nine}`).expect(200);
      await editor.patch(`/api/marks/${markOfSeven}`).send({ x: 0.5, y: 0.5 }).expect(200);
      await editor.delete(`/api/marks/${markOfSeven}`).expect(200);
      await editor.post(`/api/tavole/${tavolaId}/positions`).send({ number: '11' }).expect(201);
      await editor
        .put(`/api/tavole/${tavolaId}/english-name`)
        .send({ nameEn: 'Front brakes' })
        .expect(200);

      const read = await asAdministratorsRead();
      expect(read.sample).toMatchObject({ open: { number: '7' }, drawing: { url: drawingUrl } });
      expect(read.endedSample).toBeNull();
      await app.request().get(drawingUrl).expect(200);
      await app.request().get(`/api/landing/samples/${tavolaId}`).expect(200);
    });
  });
});
