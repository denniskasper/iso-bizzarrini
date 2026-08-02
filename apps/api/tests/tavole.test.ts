import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Models and Tavole: what an Editor records before there is a scan, a Position or a Part.
 */
describe('recording a Model and its Tavole', () => {
  let app: TestApp;
  let editor: TestAgent;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await app.editor();
  });

  describe('a Model', () => {
    it('is created with its brand, model, series and model years', async () => {
      const created = await editor
        .post('/api/models')
        .send({ brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' })
        .expect(201);

      expect(created.body.model).toEqual({
        id: expect.any(String),
        brand: 'Iso',
        name: 'Grifo',
        series: 'GL 365',
        modelYears: '1965–68',
      });

      const listed = await editor.get('/api/models').expect(200);
      expect(listed.body.models).toEqual([created.body.model]);
    });

    // The factory did not distinguish every Model down to a series, and a Model carrying ""
    // would print an empty column where it should print nothing at all.
    it('records an unsupplied series and years as absent rather than blank', async () => {
      const created = await editor
        .post('/api/models')
        .send({ brand: 'Bizzarrini', name: '5300 GT Strada', series: '   ' })
        .expect(201);

      expect(created.body.model).toMatchObject({ series: null, modelYears: null });
    });

    it('is refused without a brand', async () => {
      const response = await editor.post('/api/models').send({ name: 'Grifo' }).expect(400);

      expect(response.body.error).toMatchObject({ code: 'validation_failed' });
    });

    it('cannot be created by someone who has not signed in', async () => {
      await app.request().post('/api/models').send({ brand: 'Iso', name: 'Grifo' }).expect(401);
    });
  });

  describe('a Tavola', () => {
    it('carries its number, both names, its Category and the factory’s own header', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });

      const created = await editor
        .post(`/api/models/${model.id}/tavole`)
        .send({
          number: '12',
          nameIt: 'Impianto freni',
          nameEn: 'Brake system',
          category: 'Brakes',
          catalogSection: '260',
          catalogGroup: '03',
          catalogSubgroup: '150',
        })
        .expect(201);

      expect(created.body.tavola).toMatchObject({
        number: '12',
        nameIt: 'Impianto freni',
        nameEn: 'Brake system',
        category: { name: 'Brakes', slug: 'brakes' },
        scan: null,
      });

      const read = await editor.get(`/api/tavole/${created.body.tavola.id}`).expect(200);
      expect(read.body.tavola).toMatchObject({
        model: { brand: 'Iso', name: 'Grifo' },
        provenance: { section: '260', group: '03', subgroup: '150' },
      });
    });

    // Sezione, Gruppo and Sottogruppo are evidence. They are reported for a member matching the
    // screen against a paper catalog, and nothing navigates by them — that is the Category's job.
    it('records the factory’s header verbatim, spacing and all', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });

      const created = await editor
        .post(`/api/models/${model.id}/tavole`)
        .send({
          number: '12',
          nameIt: 'Impianto freni',
          nameEn: 'Brake system',
          category: 'Brakes',
          catalogSection: 'SEZ.  26 / a',
        })
        .expect(201);

      const read = await editor.get(`/api/tavole/${created.body.tavola.id}`).expect(200);
      expect(read.body.tavola.provenance).toEqual({
        section: 'SEZ.  26 / a',
        group: null,
        subgroup: null,
      });
    });

    it('belongs to one Model, and its number is unique only within that Model', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const fidia = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });
      const sheet = {
        number: '12',
        nameIt: 'Impianto freni',
        nameEn: 'Brake system',
        category: 'Brakes',
      };

      await editor.post(`/api/models/${grifo.id}/tavole`).send(sheet).expect(201);

      // The same number on another car is a different drawing and perfectly ordinary.
      await editor.post(`/api/models/${fidia.id}/tavole`).send(sheet).expect(201);

      const clash = await editor.post(`/api/models/${grifo.id}/tavole`).send(sheet).expect(409);
      expect(clash.body.error).toMatchObject({ code: 'conflict' });
      expect(clash.body.error.message).toContain('12');
    });

    it('is refused for a Model that does not exist', async () => {
      await editor
        .post('/api/models/00000000-0000-4000-8000-000000000000/tavole')
        .send({ number: '12', nameIt: 'Freni', nameEn: 'Brakes', category: 'Brakes' })
        .expect(404);
    });

    it('cannot be created by someone who has not signed in', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });

      await app
        .request()
        .post(`/api/models/${model.id}/tavole`)
        .send({ number: '12', nameIt: 'Freni', nameEn: 'Brakes', category: 'Brakes' })
        .expect(401);
    });
  });

  describe('a Category', () => {
    // "Fuel System" and "fuel system" are the same system of the car. The reference sites this
    // replaces are inconsistent because nothing in them enforced that.
    it('is the same Category however an Editor capitalised it', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const fidia = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });

      await editor
        .post(`/api/models/${grifo.id}/tavole`)
        .send({ number: '3', nameIt: 'Alimentazione', nameEn: 'Fuel', category: 'Fuel System' })
        .expect(201);
      await editor
        .post(`/api/models/${fidia.id}/tavole`)
        .send({ number: '4', nameIt: 'Alimentazione', nameEn: 'Fuel', category: 'fuel  system' })
        .expect(201);

      const response = await editor.get('/api/categories').expect(200);
      expect(response.body.categories).toEqual([
        { id: expect.any(String), name: 'Fuel System', slug: 'fuel-system' },
      ]);
    });
  });

  describe('a Model’s Tavole', () => {
    it('are listed in the order the catalog prints them, not in the order of their digits', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      for (const number of ['10', '2', '12 bis', '1']) {
        await givenTavola(app.db, model.id, { number });
      }

      const response = await editor.get(`/api/models/${model.id}`).expect(200);

      expect(response.body.tavole.map((tavola: { number: string }) => tavola.number)).toEqual([
        '1',
        '2',
        '10',
        '12 bis',
      ]);
    });

    it('are reported with the Model, and with no scan until one is uploaded', async () => {
      const model = await givenModel(app.db, {
        brand: 'Iso',
        name: 'Grifo',
        series: 'GL 365',
        modelYears: '1965–68',
      });
      await givenTavola(app.db, model.id, { number: '12', category: 'Brakes' });

      const response = await editor.get(`/api/models/${model.id}`).expect(200);

      expect(response.body.model).toMatchObject({ name: 'Grifo', series: 'GL 365' });
      expect(response.body.tavole).toHaveLength(1);
      expect(response.body.tavole[0]).toMatchObject({
        number: '12',
        category: { name: 'Brakes' },
        scan: null,
      });
    });

    it('are empty for a Model nobody has drawn yet', async () => {
      const model = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });

      const response = await editor.get(`/api/models/${model.id}`).expect(200);

      expect(response.body.tavole).toEqual([]);
    });

    it('are a 404 for a Model that does not exist', async () => {
      await editor.get('/api/models/00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('are a 400 for something that is not an id at all', async () => {
      const response = await editor.get('/api/models/not-an-id').expect(400);

      expect(response.body.error).toMatchObject({ code: 'validation_failed' });
    });
  });
});
