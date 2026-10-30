import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **What a Visitor is shown** (issue #128, ADR 0019): which Models the archive covers, how many
 * Published Tavole each has, and what membership costs. The depth of the archive, and none of
 * its content.
 *
 * Every request here is signed out, because that is who this read is for. The one signed-in
 * agent is an Administrator writing the Club's fee, the way the treasurer does.
 */
describe('the landing a Visitor reads', () => {
  let app: TestApp;
  let administrator: TestAgent;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
  });

  it('is open to a browser that has not signed in', async () => {
    const response = await app.request().get('/api/landing').expect(200);

    expect(response.body).toEqual({
      landing: {
        models: [],
        fee: '0.00',
        currency: 'EUR',
        officeEmail: null,
        requestForm: false,
      },
    });
  });

  it('lists each Model with how many Published Tavole it has, by brand', async () => {
    const grifo = await givenModel(app.db, {
      brand: 'Iso',
      name: 'Grifo',
      series: 'GL 365',
      modelYears: '1965–68',
    });
    const strada = await givenModel(app.db, { brand: 'Bizzarrini', name: '5300 GT Strada' });
    await givenTavola(app.db, grifo.id, { number: '1' });
    await givenTavola(app.db, grifo.id, { number: '2' });
    await givenTavola(app.db, strada.id, { number: '1' });

    const response = await app.request().get('/api/landing').expect(200);

    expect(response.body.landing.models).toEqual([
      {
        brand: 'Bizzarrini',
        name: '5300 GT Strada',
        series: null,
        modelYears: null,
        publishedTavole: 1,
      },
      { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68', publishedTavole: 2 },
    ]);
  });

  // An Unchecked Tavola is an Editor's until one publishes it (ADR 0017), and a Visitor is shown
  // less than a Member, never more.
  it('counts only Published Tavole, and leaves out a Model with none', async () => {
    const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const fidia = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });
    await givenModel(app.db, { brand: 'Iso', name: 'Lele' });
    await givenTavola(app.db, grifo.id, { number: '1' });
    await givenTavola(app.db, grifo.id, { number: '2', state: 'unchecked' });
    await givenTavola(app.db, fidia.id, { number: '1', state: 'unchecked' });

    const response = await app.request().get('/api/landing').expect(200);

    expect(response.body.landing.models).toEqual([
      expect.objectContaining({ name: 'Grifo', publishedTavole: 1 }),
    ]);
  });

  // Nothing of a Tavola, not even its name, and no address to ask the archive for a Model by.
  it('carries the Models and their counts and nothing else of the archive', async () => {
    const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    await givenTavola(app.db, grifo.id, { number: '7', nameEn: 'Front suspension' });

    const response = await app.request().get('/api/landing').expect(200);

    expect(Object.keys(response.body.landing).toSorted()).toEqual([
      'currency',
      'fee',
      'models',
      'officeEmail',
      'requestForm',
    ]);
    expect(Object.keys(response.body.landing.models[0]).toSorted()).toEqual([
      'brand',
      'modelYears',
      'name',
      'publishedTavole',
      'series',
    ]);
    expect(JSON.stringify(response.body)).not.toContain('Front suspension');
  });

  // The fee a Visitor is told is the one a member renewing is asked for.
  it('states the yearly fee from the Club record', async () => {
    await administrator.patch('/api/club').send({ fee: '45.00', currency: 'CHF' }).expect(200);

    const response = await app.request().get('/api/landing').expect(200);

    expect(response.body.landing).toMatchObject({ fee: '45.00', currency: 'CHF' });
  });

  it('leaves every other address in the archive refused to a Visitor', async () => {
    const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, grifo.id);
    const visitor = app.request();

    for (const address of [
      '/api/models',
      `/api/models/${grifo.id}`,
      `/api/tavole/${tavola.id}`,
      `/api/tavole/${tavola.id}/listings`,
      '/api/categories',
      '/api/search?q=brake',
      '/api/club',
      '/api/renewal',
    ]) {
      const response = await visitor.get(address);
      expect(response.status, address).toBe(401);
    }
  });
});
