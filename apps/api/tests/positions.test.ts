import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Positions and the marking tool.
 *
 * **Nothing here knows what any of these numbers are, and that is the point.** A Position exists
 * because the factory printed a number, not because anybody has worked out what sits at it —
 * marking a sheet up and entering part data are separate evenings' work, and a Tavola may sit
 * half-built indefinitely without being in an invalid state.
 *
 * The tool's speed is the project's critical path, so what is asserted below is as much about
 * *how many requests a click costs* as about what comes back: one click, one request, whether or
 * not the archive has heard of that number before — and that request answers with the sheet, so
 * that no screen ever has to work out for itself where a new number goes in the order.
 */
describe('marking up a Tavola', () => {
  let app: TestApp;
  let editor: TestAgent;
  let tavolaId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await app.editor();
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '2' })).id;
  });

  /** One click on the drawing, as the browser sends it. */
  function place(number: string, x: number, y: number) {
    return editor.post(`/api/tavole/${tavolaId}/marks`).send({ number, x, y });
  }

  async function positionsOf(id = tavolaId) {
    const response = await editor.get(`/api/tavole/${id}`).expect(200);
    return response.body.positions;
  }

  function numbersOf(positions: { number: string }[]): string[] {
    return positions.map((position) => position.number);
  }

  describe('placing a Mark', () => {
    it('records the Position and the Mark together, from one click', async () => {
      const response = await place('12', 0.25, 0.5).expect(201);

      expect(response.body.positions).toEqual([
        {
          id: expect.any(String),
          number: '12',
          marks: [{ id: expect.any(String), x: 0.25, y: 0.5 }],
          // What belongs *with* the number, which nobody has said anything about yet — and which
          // a fresh Position is entitled to have nothing of.
          subAssemblyId: null,
          related: [],
        },
      ]);

      expect(await positionsOf()).toEqual(response.body.positions);
    });

    // The factory printed the same number wherever the part is used, and a member has to be
    // able to click it in all four places.
    it('adds another Mark to a Position the archive already knows', async () => {
      const first = await place('12', 0.2, 0.8).expect(201);
      const second = await place('12', 0.6, 0.3).expect(201);

      expect(second.body.positions).toHaveLength(1);
      expect(second.body.positions[0].id).toBe(first.body.positions[0].id);
      expect(second.body.positions[0].marks).toHaveLength(2);
    });

    // So that a Position printed more than once cycles through its circles in the order somebody
    // reading the sheet would come across them, rather than in whatever order they were clicked.
    it('reports a Position’s Marks in reading order down the sheet', async () => {
      await place('12', 0.5, 0.8);
      await place('12', 0.9, 0.2);
      await place('12', 0.1, 0.2);

      const [position] = await positionsOf();
      expect(position.marks.map((mark: { x: number }) => mark.x)).toEqual([0.1, 0.9, 0.5]);
    });

    it('refuses a point that is not on the drawing', async () => {
      const response = await place('12', 1.4, 0.5).expect(400);
      expect(response.body.error).toMatchObject({ code: 'validation_failed' });
    });

    it('refuses a Position with no number at all', async () => {
      await place('   ', 0.5, 0.5).expect(400);
    });

    it('is a 404 on a Tavola that is not in the archive', async () => {
      await editor
        .post('/api/tavole/00000000-0000-4000-8000-000000000000/marks')
        .send({ number: '12', x: 0.5, y: 0.5 })
        .expect(404);
    });

    it('cannot be done by someone who has not signed in', async () => {
      await app
        .request()
        .post(`/api/tavole/${tavolaId}/marks`)
        .send({ number: '12', x: 0.5, y: 0.5 })
        .expect(401);
    });
  });

  describe('a Position’s number', () => {
    // `210 S` and `211 D` are what is stamped on the bracket. A number in this archive is an
    // identifier a member compares character by character, and nothing may tidy it up.
    it('is kept as printed, letter suffix and all', async () => {
      const response = await place('210 S', 0.4, 0.4).expect(201);

      expect(numbersOf(response.body.positions)).toEqual(['210 S']);
    });

    // The whole reason a write answers with the sheet: this order is the archive's, and a
    // browser that worked it out for itself would be a second opinion about a catalog.
    it('orders the sheet the way the catalog prints it, not the way strings sort', async () => {
      for (const number of ['10', '210 S', '2', '12 bis', '1']) {
        await place(number, 0.5, 0.5).expect(201);
      }

      const placed = await place('3', 0.5, 0.5).expect(201);
      expect(numbersOf(placed.body.positions)).toEqual(['1', '2', '3', '10', '12 bis', '210 S']);
      expect(numbersOf(await positionsOf())).toEqual(numbersOf(placed.body.positions));
    });

    it('names one Position on a sheet, whichever Editor clicked it', async () => {
      const first = await place('12', 0.2, 0.2).expect(201);

      // 200 rather than 201: the archive already had that number, which is not a mistake.
      const second = await editor
        .post(`/api/tavole/${tavolaId}/positions`)
        .send({ number: '12' })
        .expect(200);

      expect(second.body.positions).toHaveLength(1);
      expect(second.body.positions[0].id).toBe(first.body.positions[0].id);
      // And the Mark that was already on it is untouched.
      expect(second.body.positions[0].marks).toHaveLength(1);
    });

    // The same number on another drawing is another Position, and perfectly ordinary.
    it('is meaningful only within its own Tavola', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });
      const other = await givenTavola(app.db, model.id, { number: '2' });

      await place('12', 0.2, 0.2).expect(201);
      await editor
        .post(`/api/tavole/${other.id}/marks`)
        .send({ number: '12', x: 0.2, y: 0.2 })
        .expect(201);

      expect(await positionsOf()).toHaveLength(1);
      expect(await positionsOf(other.id)).toHaveLength(1);
    });
  });

  describe('a Position with no Mark', () => {
    // "Listed but not drawn": the catalog names a number the sheet does not show. It is an
    // ordinary state, not an unfinished one.
    it('is recorded without touching the drawing', async () => {
      const response = await editor
        .post(`/api/tavole/${tavolaId}/positions`)
        .send({ number: '207' })
        .expect(201);

      expect(response.body.positions).toEqual([
        { id: expect.any(String), number: '207', marks: [], subAssemblyId: null, related: [] },
      ]);
    });

    it('is what a Position becomes when its last Mark is taken off', async () => {
      const placed = await place('12', 0.3, 0.3).expect(201);
      const [mark] = placed.body.positions[0].marks;

      const response = await editor.delete(`/api/marks/${mark.id}`).expect(200);

      expect(response.body.positions).toEqual([
        {
          id: placed.body.positions[0].id,
          number: '12',
          marks: [],
          subAssemblyId: null,
          related: [],
        },
      ]);
    });
  });

  describe('a Mark in the wrong place', () => {
    it('is moved without becoming a different Mark', async () => {
      const placed = await place('12', 0.3, 0.3).expect(201);
      const [mark] = placed.body.positions[0].marks;

      const response = await editor
        .patch(`/api/marks/${mark.id}`)
        .send({ x: 0.71, y: 0.62 })
        .expect(200);

      expect(response.body.positions[0].marks).toEqual([{ id: mark.id, x: 0.71, y: 0.62 }]);
    });

    it('cannot be moved off the drawing', async () => {
      const placed = await place('12', 0.3, 0.3).expect(201);
      const [mark] = placed.body.positions[0].marks;

      await editor.patch(`/api/marks/${mark.id}`).send({ x: -0.2, y: 0.5 }).expect(400);
    });

    it('is removed one circle at a time, leaving the others', async () => {
      await place('12', 0.2, 0.2).expect(201);
      const placed = await place('12', 0.8, 0.8).expect(201);
      const [, second] = placed.body.positions[0].marks;

      const response = await editor.delete(`/api/marks/${second.id}`).expect(200);

      expect(response.body.positions[0].marks).toEqual([
        { id: expect.any(String), x: 0.2, y: 0.2 },
      ]);
    });

    it('is a 404 once it is gone', async () => {
      const placed = await place('12', 0.3, 0.3).expect(201);
      const [mark] = placed.body.positions[0].marks;

      await editor.delete(`/api/marks/${mark.id}`).expect(200);
      await editor.delete(`/api/marks/${mark.id}`).expect(404);
    });

    it('cannot be moved or removed by someone who has not signed in', async () => {
      const placed = await place('12', 0.3, 0.3).expect(201);
      const [mark] = placed.body.positions[0].marks;

      await app.request().patch(`/api/marks/${mark.id}`).send({ x: 0.5, y: 0.5 }).expect(401);
      await app.request().delete(`/api/marks/${mark.id}`).expect(401);
    });
  });

  describe('a Position typed wrongly', () => {
    // The one-click tool records a Position the moment it is clicked, so a mistyped number
    // becomes a real Position. Mistakes have to be as cheap to undo as they were to make.
    it('is removed, and takes its Marks with it', async () => {
      await place('12', 0.2, 0.2).expect(201);
      const placed = await place('1200', 0.4, 0.4).expect(201);
      const mistake = placed.body.positions.find(
        (position: { number: string }) => position.number === '1200',
      );

      const response = await editor.delete(`/api/positions/${mistake.id}`).expect(200);

      expect(numbersOf(response.body.positions)).toEqual(['12']);
      expect(numbersOf(await positionsOf())).toEqual(['12']);
    });

    it('is a 404 once it is gone', async () => {
      const placed = await place('12', 0.2, 0.2).expect(201);
      const id = placed.body.positions[0].id;

      await editor.delete(`/api/positions/${id}`).expect(200);
      await editor.delete(`/api/positions/${id}`).expect(404);
    });

    it('cannot be removed by someone who has not signed in', async () => {
      const placed = await place('12', 0.2, 0.2).expect(201);

      await app.request().delete(`/api/positions/${placed.body.positions[0].id}`).expect(401);
    });
  });

  describe('a Tavola nobody has marked up', () => {
    it('reports no Positions rather than nothing at all', async () => {
      expect(await positionsOf()).toEqual([]);
    });
  });
});
