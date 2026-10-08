import { sql } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { categorySlug } from '../src/catalog/naming.js';
import { standingCategories } from '../src/catalog/standing-categories.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { givenCategories, givenCategory, givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';
import { testDatabaseUrl, workerSchemaName } from './support/test-database.js';

/**
 * Categories (issue #8): the systems of a car, kept as a list by an Administrator, and what a
 * member reads through them — one system on their own car, and the same system on every car.
 */
describe('the systems of a car', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let member: TestAgent;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
  });

  describe('the list', () => {
    /**
     * Every other test here starts from an emptied archive, so this one migrates a schema of
     * its own: what is being asked is what an archive holds on the day it is made.
     */
    it('starts as the Club’s thirteen in any archive, by name and with no numbers', async () => {
      const schema = `${workerSchemaName()}_new_archive`;
      const maintenance = createDatabase(testDatabaseUrl(), { maxConnections: 1 });
      await maintenance.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await maintenance.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));

      const fresh = createDatabase(testDatabaseUrl(), {
        searchPath: `${schema},public`,
        maxConnections: 1,
      });
      try {
        await runMigrations(fresh.db, { migrationsSchema: schema });

        const listed = await fresh.db.execute<{ name: string; slug: string }>(
          sql`SELECT name, slug FROM categories ORDER BY name`,
        );

        expect(listed.rows.map((row) => row.name)).toEqual([...standingCategories].sort());
        for (const row of listed.rows) {
          expect(row.slug).toBe(categorySlug(row.name));
          expect(row.name).not.toMatch(/\d/);
        }
      } finally {
        await fresh.close();
        await maintenance.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
        await maintenance.close();
      }
    });

    it('is read whole, with how much is filed under each entry and how much under none', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      await givenCategories(app.db, 'Steering', 'Brakes', 'Cooling');
      await givenTavola(app.db, grifo.id, { number: '1', category: 'Brakes' });
      await givenTavola(app.db, grifo.id, { number: '2', category: 'Brakes' });
      await givenTavola(app.db, grifo.id, { number: '3', category: 'Steering' });
      await givenTavola(app.db, grifo.id, { number: '4', category: null });

      const response = await member.get('/api/categories').expect(200);

      // Alphabetical, and Cooling is there with nothing under it: an Editor has to be able to
      // choose a system before anybody has drawn it.
      expect(response.body).toEqual({
        categories: [
          { id: expect.any(String), name: 'Brakes', slug: 'brakes', tavole: 2 },
          { id: expect.any(String), name: 'Cooling', slug: 'cooling', tavole: 0 },
          { id: expect.any(String), name: 'Steering', slug: 'steering', tavole: 1 },
        ],
        uncategorised: 1,
      });
    });
  });

  describe('an Administrator keeping the list', () => {
    it('adds an entry, which an Editor can then file a drawing under', async () => {
      const added = await administrator
        .post('/api/categories')
        .send({ name: '  Gearbox ' })
        .expect(201);
      expect(added.body.category).toEqual({
        id: expect.any(String),
        name: 'Gearbox',
        slug: 'gearbox',
      });

      const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const filed = await editor
        .post(`/api/models/${grifo.id}/tavole`)
        .send({ number: '7', nameIt: 'Cambio', nameEn: 'Gearbox', category: 'Gearbox' })
        .expect(201);
      expect(filed.body.tavola.category).toMatchObject({ name: 'Gearbox' });
    });

    // One system under two spellings is the fault this list exists to prevent.
    it('is refused an entry the list already has under another spelling', async () => {
      await givenCategory(app.db, 'Fuel System');

      const refused = await administrator
        .post('/api/categories')
        .send({ name: 'fuel  system' })
        .expect(409);
      expect(refused.body.error).toMatchObject({ code: 'conflict' });
    });

    it('is refused a name with nothing in it to tell it from another', async () => {
      await administrator.post('/api/categories').send({ name: '' }).expect(400);
      await administrator.post('/api/categories').send({ name: ' — ' }).expect(400);
    });

    // "Uncategorised" is the archive's own word for a drawing filed nowhere.
    it('is refused the one name the archive keeps for drawings with no Category', async () => {
      const refused = await administrator
        .post('/api/categories')
        .send({ name: 'Uncategorised' })
        .expect(400);
      expect(refused.body.error.message).toContain('Uncategorised');
    });

    it('renames an entry, and everything filed under it follows', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const body = await givenCategory(app.db, 'Body');
      const tavola = await givenTavola(app.db, grifo.id, { category: 'Body' });

      const renamed = await administrator
        .patch(`/api/categories/${body.id}`)
        .send({ name: 'Body/Exterior' })
        .expect(200);
      expect(renamed.body.category).toEqual({
        id: body.id,
        name: 'Body/Exterior',
        slug: 'body-exterior',
      });

      const read = await member.get(`/api/tavole/${tavola.id}`).expect(200);
      expect(read.body.tavola.category).toMatchObject({ name: 'Body/Exterior' });

      // The address follows the name, so the old word is free to mean something else again.
      await member.get('/api/categories/body-exterior').expect(200);
      await member.get('/api/categories/body').expect(404);
    });

    it('may respell an entry without it colliding with itself', async () => {
      const brakes = await givenCategory(app.db, 'brakes');

      const renamed = await administrator
        .patch(`/api/categories/${brakes.id}`)
        .send({ name: 'Brakes' })
        .expect(200);
      expect(renamed.body.category).toMatchObject({ name: 'Brakes', slug: 'brakes' });
    });

    it('is refused a rename onto another entry', async () => {
      const [, fuel] = await givenCategories(app.db, 'Brakes', 'Fuel');

      await administrator.patch(`/api/categories/${fuel!.id}`).send({ name: 'BRAKES' }).expect(409);
    });

    it('is told when the entry being renamed does not exist', async () => {
      await administrator
        .patch('/api/categories/00000000-0000-4000-8000-000000000000')
        .send({ name: 'Gearbox' })
        .expect(404);
    });

    it('is the only one who may: an Editor chooses from the list and does not add to it', async () => {
      const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
      const brakes = await givenCategory(app.db, 'Brakes');

      await editor.post('/api/categories').send({ name: 'Gearbox' }).expect(403);
      await editor.patch(`/api/categories/${brakes.id}`).send({ name: 'Braking' }).expect(403);

      const listed = await member.get('/api/categories').expect(200);
      expect(listed.body.categories).toMatchObject([{ name: 'Brakes' }]);
    });
  });

  describe('one system across every car', () => {
    it('lists each car that has it, with that car’s drawings in catalog order', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const strada = await givenModel(app.db, { brand: 'Bizzarrini', name: '5300 GT Strada' });
      const fidia = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });

      await givenTavola(app.db, grifo.id, { number: '10', category: 'Brakes' });
      await givenTavola(app.db, grifo.id, { number: '2', category: 'Brakes' });
      await givenTavola(app.db, strada.id, { number: '5', category: 'Brakes' });
      // Neither of these is a drawing of the brakes, on a car that has one and a car that has not.
      await givenTavola(app.db, grifo.id, { number: '3', category: 'Electrical' });
      await givenTavola(app.db, fidia.id, { number: '1', category: null });

      const response = await member.get('/api/categories/brakes').expect(200);

      expect(response.body.category).toMatchObject({ name: 'Brakes', slug: 'brakes' });
      // Brand, then Model — the order of the catalog index — and 2 before 10 within a car.
      expect(response.body.models).toMatchObject([
        { model: { brand: 'Bizzarrini', name: '5300 GT Strada' }, tavole: [{ number: '5' }] },
        { model: { brand: 'Iso', name: 'Grifo' }, tavole: [{ number: '2' }, { number: '10' }] },
      ]);
      // A car with no drawing of the system is not listed with an empty row.
      expect(response.body.models).toHaveLength(2);
    });

    it('is an entry with no cars under it yet, rather than a missing page', async () => {
      await givenCategory(app.db, 'Cooling');

      const response = await member.get('/api/categories/cooling').expect(200);
      expect(response.body).toMatchObject({ category: { name: 'Cooling' }, models: [] });
    });

    it('is a 404 for a system that is not on the list', async () => {
      await member.get('/api/categories/flux-capacitor').expect(404);
    });
  });
});
