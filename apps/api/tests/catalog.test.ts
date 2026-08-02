import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModels } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The route that travels the whole path: browser → API → database → browser.
 *
 * Every request here is signed in, because **the archive is members-only and all of it is
 * behind the gate** — not only the images. What happens to a request that is not signed in is
 * one test, at the bottom.
 */
describe('the catalog of covered cars', () => {
  let app: TestApp;
  let member: TestAgent;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    member = await app.editor();
  });

  it('is empty before any Model has been recorded', async () => {
    const response = await member.get('/api/models').expect(200);

    expect(response.body).toEqual({ models: [] });
  });

  it('lists every Model, grouped so that a member can find their car by brand', async () => {
    await givenModels(
      app.db,
      { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
      { brand: 'Bizzarrini', name: '5300 GT Strada', series: null, modelYears: '1965–68' },
      { brand: 'Iso', name: 'Fidia', series: 'S4', modelYears: '1967–74' },
    );

    const response = await member.get('/api/models').expect(200);

    expect(response.body.models.map((model: { name: string }) => model.name)).toEqual([
      '5300 GT Strada',
      'Fidia',
      'Grifo',
    ]);
  });

  it('reports a Model with its brand, model, series and model years', async () => {
    await givenModels(app.db, {
      brand: 'Iso',
      name: 'Grifo',
      series: 'GL 365',
      modelYears: '1965–68',
    });

    const response = await member.get('/api/models').expect(200);

    expect(response.body.models).toEqual([
      {
        id: expect.any(String),
        brand: 'Iso',
        name: 'Grifo',
        series: 'GL 365',
        modelYears: '1965–68',
      },
    ]);
  });

  it('narrows the list to one brand', async () => {
    await givenModels(
      app.db,
      { brand: 'Iso', name: 'Grifo' },
      { brand: 'Bizzarrini', name: '5300 GT Strada' },
    );

    const response = await member.get('/api/models').query({ brand: 'Bizzarrini' }).expect(200);

    expect(response.body.models).toHaveLength(1);
    expect(response.body.models[0]).toMatchObject({ brand: 'Bizzarrini', name: '5300 GT Strada' });
  });

  it('refuses a blank brand filter rather than quietly listing everything', async () => {
    const response = await member.get('/api/models?brand=%20%20').expect(400);

    expect(response.body.error).toMatchObject({ code: 'validation_failed' });
  });

  // A Tavola's number, its two names and the factory's own Sezione are the Club's archive just
  // as much as the drawing is, and an open catalog is a catalog a search engine indexes.
  it('is not readable at all by a browser that has not signed in', async () => {
    const response = await app.request().get('/api/models').expect(401);

    expect(response.body.error).toMatchObject({ code: 'not_signed_in' });
  });
});
