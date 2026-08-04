import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Where the work stands across one car's drawings.
 *
 * **Marking hundreds of Tavole is volunteers' evenings**, and the thing that stops that work is
 * not knowing where it was left. What is asserted here is counting, which sounds trivial and is
 * the whole feature: the numbers have to be right on a sheet that is half done, on one that has
 * never been opened, and on a Model whose Tavole are in three different states at once.
 *
 * **Marked and listed are counted separately and neither is a stage of the other.** A number the
 * catalog prints that the drawing does not show is finished with no Mark on it, and a number
 * circled on the sheet with nothing recorded at it is an evening still to come. Most of what is
 * here exists to keep those two apart.
 */
describe('how much of a car is done', () => {
  let app: TestApp;
  let editor: TestAgent;
  let modelId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await app.editor();
    modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
  });

  /** A number the catalog lists, recorded without a circle on the drawing. */
  async function givenPosition(tavolaId: string, number: string): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${tavolaId}/positions`)
      .send({ number })
      .expect(201);

    const recorded = response.body.positions.find(
      (position: { number: string }) => position.number === number,
    );
    return recorded.id;
  }

  /** A number with a circle on it, recorded the way the marking tool records one. */
  async function givenMarkedPosition(tavolaId: string, number: string): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${tavolaId}/marks`)
      .send({ number, x: 0.5, y: 0.5 })
      .expect(201);

    const recorded = response.body.positions.find(
      (position: { number: string }) => position.number === number,
    );
    return recorded.id;
  }

  async function givenListing(tavolaId: string, positionId: string | null, nameEn: string) {
    await editor
      .post(`/api/tavole/${tavolaId}/listings`)
      .send({
        positionId,
        drawn: true,
        part: {
          nameEn,
          nameIt: '',
          catalogNumber: '',
          disegnoOrigine: '',
          description: '',
          dimensions: '',
          materialFinish: '',
          catalogNote: '',
          note: '',
        },
      })
      .expect(201);
  }

  async function progressOf(model = modelId) {
    const response = await editor.get(`/api/models/${model}/progress`).expect(200);
    return response.body.tavole;
  }

  it('reports nothing for a car that has no drawings at all', async () => {
    expect(await progressOf()).toEqual([]);
  });

  it('reports a Tavola nobody has marked up as empty rather than as done', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });

    expect(await progressOf()).toEqual([
      { tavolaId: tavola.id, positions: 0, marked: 0, listed: 0 },
    ]);
  });

  it('counts every number on the sheet, and how many of them carry a Mark', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });
    await givenMarkedPosition(tavola.id, '1');
    await givenMarkedPosition(tavola.id, '2');
    // The washer behind a bracket: the catalog lists it and the drawing does not show it.
    await givenPosition(tavola.id, '3');

    expect(await progressOf()).toEqual([
      { tavolaId: tavola.id, positions: 3, marked: 2, listed: 0 },
    ]);
  });

  // The factory printed one number wherever the part is used, so a Position may carry four
  // circles — and it is still one number that has been marked.
  it('counts a number printed in several places once', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });
    await givenMarkedPosition(tavola.id, '2');
    await givenMarkedPosition(tavola.id, '2');
    await givenMarkedPosition(tavola.id, '2');

    expect(await progressOf()).toEqual([
      { tavolaId: tavola.id, positions: 1, marked: 1, listed: 0 },
    ]);
  });

  it('counts how many numbers carry a Listing, whatever is listed at them', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });
    const caliper = await givenMarkedPosition(tavola.id, '1');
    await givenMarkedPosition(tavola.id, '2');

    await givenListing(tavola.id, caliper, 'Front brake caliper');
    // A second Part at the same number — an alternative, and still one number answered.
    await givenListing(tavola.id, caliper, 'Front brake caliper, late');

    expect(await progressOf()).toEqual([
      { tavolaId: tavola.id, positions: 2, marked: 2, listed: 1 },
    ]);
  });

  /**
   * A number the drawing does not print, carrying a Part all the same. It is *listed* and not
   * *marked*, and an Editor reading a sheet as two thirds done because of it would go looking
   * for a circle that was never printed.
   */
  it('counts a number that is listed but not drawn as listed, and not as marked', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });
    const washer = await givenPosition(tavola.id, '5');
    await givenListing(tavola.id, washer, 'Lock washer');

    expect(await progressOf()).toEqual([
      { tavolaId: tavola.id, positions: 1, marked: 0, listed: 1 },
    ]);
  });

  /**
   * A Part the catalog names on the sheet that nobody has given a number to. It is on the
   * Tavola and at no Position, so there is no number it can have answered.
   */
  it('does not let a Listing at no number at all count towards a sheet being done', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });
    await givenMarkedPosition(tavola.id, '1');
    await givenListing(tavola.id, null, 'Something the catalog names and does not place');

    expect(await progressOf()).toEqual([
      { tavolaId: tavola.id, positions: 1, marked: 1, listed: 0 },
    ]);
  });

  it('reports every Tavola of the car, in the catalog’s own order', async () => {
    const second = await givenTavola(app.db, modelId, { number: '10' });
    const first = await givenTavola(app.db, modelId, { number: '2' });
    const last = await givenTavola(app.db, modelId, { number: '12 bis' });

    expect((await progressOf()).map((tavola: { tavolaId: string }) => tavola.tavolaId)).toEqual([
      first.id,
      second.id,
      last.id,
    ]);
  });

  it('counts only the car that was asked about', async () => {
    const grifo = await givenTavola(app.db, modelId, { number: '2' });
    await givenMarkedPosition(grifo.id, '1');

    const otherModel = (await givenModel(app.db, { brand: 'Iso', name: 'Fidia' })).id;
    const fidia = await givenTavola(app.db, otherModel, { number: '2' });
    await givenMarkedPosition(fidia.id, '1');
    await givenMarkedPosition(fidia.id, '2');

    expect(await progressOf()).toEqual([
      { tavolaId: grifo.id, positions: 1, marked: 1, listed: 0 },
    ]);
    expect(await progressOf(otherModel)).toEqual([
      { tavolaId: fidia.id, positions: 2, marked: 2, listed: 0 },
    ]);
  });

  /**
   * **The one test that keeps two answers to one question honest.**
   *
   * A Tavola's own progress is worked out in the browser, from the sheet and the index it is
   * already showing — there is no third request, which is what makes the panel open instantly on
   * a drawing carrying two hundred numbers. This one is counted in SQL, because a Model's sixty
   * sheets are sixty drawings the browser does not hold.
   *
   * So the definition of *marked* and *listed* exists in two places, and this asserts that the
   * two agree by deriving the counts from the very responses the browser derives them from.
   */
  it('agrees with what the sheet and its own index say about the same Tavola', async () => {
    const tavola = await givenTavola(app.db, modelId, { number: '2' });
    const caliper = await givenMarkedPosition(tavola.id, '1');
    await givenMarkedPosition(tavola.id, '2');
    await givenMarkedPosition(tavola.id, '2');
    const washer = await givenPosition(tavola.id, '5');
    await givenPosition(tavola.id, '4');
    await givenListing(tavola.id, caliper, 'Front brake caliper');
    await givenListing(tavola.id, washer, 'Lock washer');
    await givenListing(tavola.id, null, 'Named on the sheet, placed nowhere');

    const sheet = (await editor.get(`/api/tavole/${tavola.id}`).expect(200)).body;
    const index = (await editor.get(`/api/tavole/${tavola.id}/listings`).expect(200)).body;

    const listedAt = new Set(
      index.listings
        .map((listing: { positionId: string | null }) => listing.positionId)
        .filter((positionId: string | null) => positionId !== null),
    );
    const asTheBrowserDerivesIt = {
      tavolaId: tavola.id,
      positions: sheet.positions.length,
      marked: sheet.positions.filter((position: { marks: unknown[] }) => position.marks.length > 0)
        .length,
      listed: sheet.positions.filter((position: { id: string }) => listedAt.has(position.id))
        .length,
    };

    expect(await progressOf()).toEqual([asTheBrowserDerivesIt]);
    // And the arrangement is the interesting one, rather than three zeroes agreeing.
    expect(asTheBrowserDerivesIt).toEqual({
      tavolaId: tavola.id,
      positions: 4,
      marked: 2,
      listed: 2,
    });
  });

  it('refuses a car that is not in the archive', async () => {
    const response = await editor
      .get('/api/models/6f2b6a9e-0f1d-4a3b-9c8e-2c5d1f7a4b60/progress')
      .expect(404);

    expect(response.body.error).toMatchObject({ code: 'not_found' });
  });

  it('refuses an id that is not a Model id at all', async () => {
    const response = await editor.get('/api/models/not-a-uuid/progress').expect(400);

    expect(response.body.error).toMatchObject({ code: 'validation_failed' });
  });

  // How much of the Club's archive has been transcribed is the Club's business too.
  it('is not readable by a browser that has not signed in', async () => {
    const response = await app.request().get(`/api/models/${modelId}/progress`).expect(401);

    expect(response.body.error).toMatchObject({ code: 'not_signed_in' });
  });
});
