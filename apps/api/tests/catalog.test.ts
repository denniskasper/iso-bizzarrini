import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModels } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The skeleton's one route that travels the whole path: browser → API → database → browser.
 */
describe('the catalog of covered cars', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
  });

  it('is empty before any Model has been recorded', async () => {
    const response = await app.request().get('/api/models').expect(200);

    expect(response.body).toEqual({ models: [] });
  });

  it('lists every Model, grouped so that a member can find their car by brand', async () => {
    await givenModels(
      app.db,
      { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
      { brand: 'Bizzarrini', name: '5300 GT Strada', series: null, modelYears: '1965–68' },
      { brand: 'Iso', name: 'Fidia', series: 'S4', modelYears: '1967–74' },
    );

    const response = await app.request().get('/api/models').expect(200);

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

    const response = await app.request().get('/api/models').expect(200);

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

    const response = await app
      .request()
      .get('/api/models')
      .query({ brand: 'Bizzarrini' })
      .expect(200);

    expect(response.body.models).toHaveLength(1);
    expect(response.body.models[0]).toMatchObject({ brand: 'Bizzarrini', name: '5300 GT Strada' });
  });

  it('refuses a blank brand filter rather than quietly listing everything', async () => {
    const response = await app.request().get('/api/models?brand=%20%20').expect(400);

    expect(response.body.error).toMatchObject({ code: 'validation_failed' });
  });
});
