import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Sample** (ADR 0019): a Published Tavola an Administrator shows to Visitors, with one of its
 * Positions open, and a smaller public copy of its drawing made for it.
 *
 * What a Visitor then reads of it is another ticket's; this is the marking, and the one promise
 * about the drawing that has to hold from the first Sample on — the copy is public and the Scan
 * never is.
 */
describe('a Sample', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let tavolaId: string;
  /** Large enough that the public copy is made smaller than it, as a real sheet would be. */
  const SCAN = { width: 3000, height: 2000 };

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12' })).id;
    await administrator
      .put(`/api/tavole/${tavolaId}/scan`)
      .set('Content-Type', 'image/png')
      .send(await givenScanImage(SCAN))
      .expect(201);
  });

  /** A number on the drawing, put there the way an Editor puts it: by clicking it. */
  async function givenPosition(number: string, on = tavolaId): Promise<string> {
    const response = await administrator
      .post(`/api/tavole/${on}/marks`)
      .send({ number, x: 0.4, y: 0.6 })
      .expect(201);
    const position = (response.body.positions as { id: string; number: string }[]).find(
      (candidate) => candidate.number === number,
    );
    if (!position) {
      throw new Error(`No Position ${number} came back.`);
    }
    return position.id;
  }

  function show(positionId: string, agent = administrator, on = tavolaId) {
    return agent.put(`/api/tavole/${on}/sample`).send({ positionId });
  }

  describe('marking one', () => {
    it('opens the number an Administrator picked, and says who marked it and when', async () => {
      const seven = await givenPosition('7');

      const response = await show(seven).expect(200);

      expect(response.body.sample).toEqual({
        open: { positionId: seven, number: '7' },
        markedAt: app.clock.now().toISOString(),
        markedBy: 'An Administrator',
        drawing: {
          url: expect.stringMatching(/^\/api\/sample-drawings\//),
          width: expect.any(Number),
          height: expect.any(Number),
        },
      });

      const read = await administrator.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(read.body.tavola.sample).toEqual(response.body.sample);
    });

    it('opens another number without being marked again', async () => {
      const seven = await givenPosition('7');
      const nine = await givenPosition('9');
      const marked = await show(seven).expect(200);

      app.clock.advanceBy(60_000);
      const changed = await show(nine).expect(200);

      expect(changed.body.sample).toEqual({
        ...marked.body.sample,
        open: { positionId: nine, number: '9' },
      });
    });

    it('stops in one press, and says so on the Tavola', async () => {
      await show(await givenPosition('7')).expect(200);

      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(204);

      const read = await administrator.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(read.body.tavola.sample).toBeNull();
    });

    it('is a 404 to stop showing a Tavola that is not shown', async () => {
      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(404);
    });

    it('has no limit on how many Tavole are shown', async () => {
      const model = await givenModel(app.db, { brand: 'Bizzarrini', name: 'Strada' });
      for (const number of ['1', '2', '3', '4', '5', '6']) {
        const other = (await givenTavola(app.db, model.id, { number })).id;
        await administrator
          .put(`/api/tavole/${other}/scan`)
          .set('Content-Type', 'image/png')
          .send(await givenScanImage())
          .expect(201);
        await show(await givenPosition('1', other), administrator, other).expect(200);
      }

      const listed = await administrator.get('/api/samples').expect(200);
      expect(listed.body.samples).toHaveLength(6);
    });
  });

  describe('is refused', () => {
    it('for an Unchecked Tavola', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
      const unchecked = (await givenTavola(app.db, model.id, { state: 'unchecked' })).id;
      await administrator
        .put(`/api/tavole/${unchecked}/scan`)
        .set('Content-Type', 'image/png')
        .send(await givenScanImage())
        .expect(201);

      const response = await show(
        await givenPosition('3', unchecked),
        administrator,
        unchecked,
      ).expect(409);

      expect(response.body.error).toMatchObject({ code: 'conflict' });
    });

    it('for a Position of another Tavola', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
      const other = (await givenTavola(app.db, model.id, { number: '30' })).id;

      await show(await givenPosition('3', other)).expect(404);

      const read = await administrator.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(read.body.tavola.sample).toBeNull();
    });

    it('for a Tavola with no drawing to copy', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
      const undrawn = (await givenTavola(app.db, model.id, { number: '30' })).id;

      await show(await givenPosition('3', undrawn), administrator, undrawn).expect(409);
    });

    it('for an Editor and for a Member, who are not told whether it is one', async () => {
      const seven = await givenPosition('7');
      await show(seven).expect(200);

      for (const role of ['editor', 'member'] as const) {
        const { agent } = await givenAMember(app, administrator, { role });

        await show(seven, agent).expect(403);
        await agent.delete(`/api/tavole/${tavolaId}/sample`).expect(403);
        await agent.get('/api/samples').expect(403);

        const read = await agent.get(`/api/tavole/${tavolaId}`).expect(200);
        expect(read.body.tavola).not.toHaveProperty('sample');
      }

      const read = await administrator.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(read.body.tavola.sample.open.number).toBe('7');
    });

    it('for somebody who has not signed in', async () => {
      await show(await givenPosition('7'), app.request()).expect(401);
      await app.request().get('/api/samples').expect(401);
    });
  });

  describe('its drawing', () => {
    it('is a smaller public copy while it is shown, and gone once it is not', async () => {
      const marked = await show(await givenPosition('7')).expect(200);
      const { url, width, height } = marked.body.sample.drawing as {
        url: string;
        width: number;
        height: number;
      };
      const scan = (await administrator.get(`/api/tavole/${tavolaId}`).expect(200)).body.tavola
        .scan as { displayUrl: string; previewUrl: string };

      const copy = await app.request().get(url).expect(200);
      expect(copy.headers['content-type']).toBe('image/webp');
      expect(copy.headers['cache-control']).toMatch(/^public/);
      const measured = await sharp(copy.body as Buffer).metadata();
      expect({ width: measured.width, height: measured.height }).toEqual({ width, height });
      // Smaller in what makes a sheet printable: its pixels. Its bytes say nothing about a blank
      // fixture, which a lossless encoder shrinks to almost nothing.
      expect(width).toBeLessThan(SCAN.width);
      expect(width / height).toBeCloseTo(SCAN.width / SCAN.height, 2);

      await app.request().get(scan.displayUrl).expect(401);
      await app.request().get(scan.previewUrl).expect(401);

      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(204);

      await app.request().get(url).expect(404);
      expect(await readdir(join(app.filesPath, 'sample-drawings'))).not.toContain(
        url.split('/').at(-1),
      );
      await app.request().get(scan.displayUrl).expect(401);
    });

    it('stays the same copy when another number is opened', async () => {
      const marked = await show(await givenPosition('7')).expect(200);
      const changed = await show(await givenPosition('9')).expect(200);

      expect(changed.body.sample.drawing.url).toBe(marked.body.sample.drawing.url);
      await app.request().get(changed.body.sample.drawing.url).expect(200);
    });

    it('is made again when the Scan is turned, and the old copy goes', async () => {
      const marked = await show(await givenPosition('7')).expect(200);

      await administrator
        .post(`/api/tavole/${tavolaId}/scan/turns`)
        .send({ direction: 'clockwise' })
        .expect(200);

      const read = await administrator.get(`/api/tavole/${tavolaId}`).expect(200);
      const drawing = read.body.tavola.sample.drawing as { url: string; width: number };
      expect(drawing.url).not.toBe(marked.body.sample.drawing.url);
      expect(drawing.width).toBe(marked.body.sample.drawing.height);
      await app.request().get(drawing.url).expect(200);
      await app.request().get(marked.body.sample.drawing.url).expect(404);
    });

    it('is a 404 at an address that was never one', async () => {
      await app
        .request()
        .get('/api/sample-drawings/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });
  });

  describe('the list of them', () => {
    it('names each Tavola shown and the number it has open, in the order they were marked', async () => {
      const model = await givenModel(app.db, { brand: 'Bizzarrini', name: 'Strada' });
      const later = (await givenTavola(app.db, model.id, { number: '4', nameEn: 'Doors' })).id;
      await administrator
        .put(`/api/tavole/${later}/scan`)
        .set('Content-Type', 'image/png')
        .send(await givenScanImage())
        .expect(201);
      await givenTavola(app.db, model.id, { number: '5' });

      await show(await givenPosition('7')).expect(200);
      app.clock.advanceBy(60_000);
      await show(await givenPosition('2', later), administrator, later).expect(200);

      const listed = await administrator.get('/api/samples').expect(200);

      expect(
        (
          listed.body.samples as {
            tavola: { id: string; number: string; model: { name: string } };
            open: { number: string };
          }[]
        ).map((sample) => [sample.tavola.number, sample.tavola.model.name, sample.open.number]),
      ).toEqual([
        ['12', 'Grifo', '7'],
        ['4', 'Strada', '2'],
      ]);
    });
  });
});
