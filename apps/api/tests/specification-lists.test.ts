import { sql } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { specificationNameSlug, unitKey } from '../src/catalog/naming.js';
import {
  standingSpecificationNames,
  standingUnits,
} from '../src/catalog/standing-specifications.js';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { parts, specifications } from '../src/db/schema.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';
import { testDatabaseUrl, workerSchemaName } from './support/test-database.js';

/**
 * Units and Specification names (issue #109): the two lists an Administrator keeps so that a
 * Part's material, dimensions and weight are written one way only. Recording a Part's values is
 * the next ticket; where a test here needs a Part to have one, it puts it in the database.
 */
describe('the Units and Specification names', () => {
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

  async function addUnit(symbol: string): Promise<{ id: string; symbol: string }> {
    const added = await administrator.post('/api/units').send({ symbol }).expect(201);
    return added.body.unit;
  }

  async function addName(
    name: string,
    unitId: string | null = null,
  ): Promise<{ id: string; name: string }> {
    const added = await administrator
      .post('/api/specification-names')
      .send({ name, unitId })
      .expect(201);
    return added.body.specificationName;
  }

  /** A Part with a value for the name, as the next ticket will let an Editor record one. */
  async function givenAPartWithAValueFor(nameId: string): Promise<void> {
    const [part] = await app.db.insert(parts).values({ nameEn: 'Door handle' }).returning();
    await app.db.insert(specifications).values({ partId: part!.id, nameId, valueNumber: '412' });
  }

  describe('on the day an archive is made', () => {
    /** Every other test empties the archive, so this one migrates a schema of its own. */
    it('starts with the usual Units, and the names restorers record most, in order', async () => {
      const schema = `${workerSchemaName()}_new_lists`;
      const maintenance = createDatabase(testDatabaseUrl(), { maxConnections: 1 });
      await maintenance.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
      await maintenance.db.execute(sql.raw(`CREATE SCHEMA ${schema}`));

      const fresh = createDatabase(testDatabaseUrl(), {
        searchPath: `${schema},public`,
        maxConnections: 1,
      });
      try {
        await runMigrations(fresh.db, { migrationsSchema: schema });

        const units = await fresh.db.execute<{ symbol: string; key: string }>(
          sql`SELECT symbol, key FROM units`,
        );
        expect(units.rows.map((row) => row.symbol).sort()).toEqual([...standingUnits].sort());
        for (const row of units.rows) {
          expect(row.key).toBe(unitKey(row.symbol));
        }

        const names = await fresh.db.execute<{ name: string; slug: string; unit: string | null }>(
          sql`SELECT n.name, n.slug, u.symbol AS unit
                FROM specification_names n LEFT JOIN units u ON u.id = n.unit_id
               ORDER BY n.sequence`,
        );
        expect(names.rows.map(({ name, unit }) => ({ name, unit }))).toEqual(
          standingSpecificationNames,
        );
        for (const row of names.rows) {
          expect(row.slug).toBe(specificationNameSlug(row.name));
        }
      } finally {
        await fresh.close();
        await maintenance.db.execute(sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
        await maintenance.close();
      }
    });
  });

  describe('the Units', () => {
    it('are added, spelt as they are printed, and read by any member', async () => {
      const added = await administrator.post('/api/units').send({ symbol: '  Nm ' }).expect(201);
      expect(added.body.unit).toEqual({ id: expect.any(String), symbol: 'Nm' });

      const mm = await addUnit('mm');
      await addName('Length', mm.id);

      const listed = await member.get('/api/units').expect(200);
      expect(listed.body.units).toEqual([
        { id: mm.id, symbol: 'mm', names: 1 },
        { id: added.body.unit.id, symbol: 'Nm', names: 0 },
      ]);
    });

    // Case is the meaning: a millimetre and a megametre are not one Unit spelt two ways.
    it('tell case apart, so mm and Mm are both on the list', async () => {
      await addUnit('mm');
      await addUnit('Mm');

      const listed = await member.get('/api/units').expect(200);
      expect(listed.body.units.map((unit: { symbol: string }) => unit.symbol).sort()).toEqual([
        'Mm',
        'mm',
      ]);
    });

    it('refuse a Unit that is already on the list once spacing is ignored', async () => {
      await addUnit('Nm');

      const refused = await administrator.post('/api/units').send({ symbol: 'N m' }).expect(409);
      expect(refused.body.error).toMatchObject({ code: 'conflict' });

      // The Ohm sign a keyboard offers and the omega already on the list are one Unit.
      await addUnit('\u03a9');
      await administrator.post('/api/units').send({ symbol: '\u2126' }).expect(409);
    });

    it('refuse a Unit with nothing in it', async () => {
      await administrator.post('/api/units').send({ symbol: '   ' }).expect(400);
    });

    it('are renamed, and every name counted in one follows', async () => {
      const kg = await addUnit('KG');
      const weight = await addName('Weight', kg.id);

      const renamed = await administrator
        .patch(`/api/units/${kg.id}`)
        .send({ symbol: 'kg' })
        .expect(200);
      expect(renamed.body.unit).toEqual({ id: kg.id, symbol: 'kg' });

      const names = await member.get('/api/specification-names').expect(200);
      expect(names.body.specificationNames).toMatchObject([
        { id: weight.id, unit: { id: kg.id, symbol: 'kg' } },
      ]);
    });

    it('refuse a rename onto another Unit', async () => {
      await addUnit('g');
      const kg = await addUnit('kg');

      await administrator.patch(`/api/units/${kg.id}`).send({ symbol: ' g' }).expect(409);
    });

    it('are removed while no name is counted in one', async () => {
      const bar = await addUnit('bar');

      await administrator.delete(`/api/units/${bar.id}`).expect(204);

      const listed = await member.get('/api/units').expect(200);
      expect(listed.body.units).toEqual([]);
      await administrator.delete(`/api/units/${bar.id}`).expect(404);
    });

    // A name counted in nothing would leave every value recorded under it meaning nothing.
    it('refuse removing a Unit a name is counted in', async () => {
      const mm = await addUnit('mm');
      await addName('Diameter', mm.id);

      const refused = await administrator.delete(`/api/units/${mm.id}`).expect(409);
      expect(refused.body.error.message).toContain('Diameter');
    });
  });

  describe('the Specification names', () => {
    it('are added at the end of the list, each with a Unit or none', async () => {
      const mm = await addUnit('mm');

      const material = await administrator
        .post('/api/specification-names')
        .send({ name: ' Material ', unitId: null })
        .expect(201);
      expect(material.body.specificationName).toEqual({
        id: expect.any(String),
        name: 'Material',
        slug: 'material',
        unit: null,
      });
      await addName('Length', mm.id);

      const listed = await member.get('/api/specification-names').expect(200);
      expect(listed.body.specificationNames).toEqual([
        { id: expect.any(String), name: 'Material', slug: 'material', unit: null, parts: 0 },
        {
          id: expect.any(String),
          name: 'Length',
          slug: 'length',
          unit: { id: mm.id, symbol: 'mm' },
          parts: 0,
        },
      ]);
    });

    it('refuse a name already on the list under another case, spacing or punctuation', async () => {
      await addName('Colour/finish');

      const refused = await administrator
        .post('/api/specification-names')
        .send({ name: 'colour  finish.', unitId: null })
        .expect(409);
      expect(refused.body.error).toMatchObject({ code: 'conflict' });
    });

    it('refuse a name with nothing in it, or a Unit that is not on the list', async () => {
      await administrator
        .post('/api/specification-names')
        .send({ name: ' — ', unitId: null })
        .expect(400);
      await administrator
        .post('/api/specification-names')
        .send({ name: 'Weight', unitId: '00000000-0000-4000-8000-000000000000' })
        .expect(400);
    });

    it('are renamed, and may be respelt without colliding with themselves', async () => {
      const thread = await addName('thread');

      const renamed = await administrator
        .patch(`/api/specification-names/${thread.id}`)
        .send({ name: 'Thread' })
        .expect(200);
      expect(renamed.body.specificationName).toMatchObject({ name: 'Thread', slug: 'thread' });

      await addName('Pitch');
      await administrator
        .patch(`/api/specification-names/${thread.id}`)
        .send({ name: 'PITCH' })
        .expect(409);
    });

    it('change their Unit while no Part has a value for them', async () => {
      const g = await addUnit('g');
      const kg = await addUnit('kg');
      const weight = await addName('Weight', g.id);

      const changed = await administrator
        .patch(`/api/specification-names/${weight.id}`)
        .send({ unitId: kg.id })
        .expect(200);
      expect(changed.body.specificationName).toMatchObject({ name: 'Weight', unit: { id: kg.id } });

      const unitless = await administrator
        .patch(`/api/specification-names/${weight.id}`)
        .send({ unitId: null })
        .expect(200);
      expect(unitless.body.specificationName.unit).toBeNull();
    });

    // A number recorded in grams must not silently become a number of kilograms.
    it('refuse changing the Unit once a Part has a value, but may still be renamed', async () => {
      const g = await addUnit('g');
      const kg = await addUnit('kg');
      const weight = await addName('Weight', g.id);
      await givenAPartWithAValueFor(weight.id);

      const refused = await administrator
        .patch(`/api/specification-names/${weight.id}`)
        .send({ unitId: kg.id })
        .expect(409);
      expect(refused.body.error).toMatchObject({ code: 'conflict' });

      await administrator
        .patch(`/api/specification-names/${weight.id}`)
        .send({ name: 'Mass', unitId: g.id })
        .expect(200);

      const listed = await member.get('/api/specification-names').expect(200);
      expect(listed.body.specificationNames).toMatchObject([
        { name: 'Mass', unit: { symbol: 'g' }, parts: 1 },
      ]);
    });

    it('are removed while no Part has a value for them, and refused once one does', async () => {
      const material = await addName('Material');
      const finish = await addName('Finish');
      await givenAPartWithAValueFor(finish.id);

      await administrator.delete(`/api/specification-names/${material.id}`).expect(204);
      await administrator.delete(`/api/specification-names/${material.id}`).expect(404);
      await administrator.delete(`/api/specification-names/${finish.id}`).expect(409);

      const listed = await member.get('/api/specification-names').expect(200);
      expect(listed.body.specificationNames).toMatchObject([{ name: 'Finish' }]);
    });

    it('are put in the order a Part’s Specifications read in', async () => {
      const weight = await addName('Weight');
      const material = await addName('Material');
      const length = await addName('Length');

      const ordered = await administrator
        .put('/api/specification-names/order')
        .send({ nameIds: [material.id, length.id, weight.id] })
        .expect(200);
      const inOrder = (body: { specificationNames: { name: string }[] }) =>
        body.specificationNames.map((entry) => entry.name);
      expect(inOrder(ordered.body)).toEqual(['Material', 'Length', 'Weight']);

      const listed = await member.get('/api/specification-names').expect(200);
      expect(inOrder(listed.body)).toEqual(['Material', 'Length', 'Weight']);

      // A name added afterwards goes at the end of the order that was chosen.
      await addName('Colour');
      const after = await member.get('/api/specification-names').expect(200);
      expect(inOrder(after.body)).toEqual(['Material', 'Length', 'Weight', 'Colour']);
    });

    // Half an order applied is an order nobody chose.
    it('refuse an order that is not the whole list, each name once', async () => {
      const weight = await addName('Weight');
      const material = await addName('Material');

      await administrator
        .put('/api/specification-names/order')
        .send({ nameIds: [material.id] })
        .expect(409);
      await administrator
        .put('/api/specification-names/order')
        .send({ nameIds: [material.id, material.id] })
        .expect(409);

      const listed = await member.get('/api/specification-names').expect(200);
      expect(listed.body.specificationNames.map((entry: { id: string }) => entry.id)).toEqual([
        weight.id,
        material.id,
      ]);
    });

    it('are told when the name does not exist', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await administrator
        .patch(`/api/specification-names/${missing}`)
        .send({ name: 'Weight' })
        .expect(404);
      await administrator.patch(`/api/units/${missing}`).send({ symbol: 'g' }).expect(404);
    });
  });

  describe('who keeps them', () => {
    it('is an Administrator only: an Editor and a Member read both lists and change neither', async () => {
      const mm = await addUnit('mm');
      const length = await addName('Length', mm.id);
      const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;

      for (const someone of [editor, member]) {
        await someone.get('/api/units').expect(200);
        await someone.get('/api/specification-names').expect(200);

        await someone.post('/api/units').send({ symbol: 'cm' }).expect(403);
        await someone.patch(`/api/units/${mm.id}`).send({ symbol: 'MM' }).expect(403);
        await someone.delete(`/api/units/${mm.id}`).expect(403);

        await someone
          .post('/api/specification-names')
          .send({ name: 'Width', unitId: mm.id })
          .expect(403);
        await someone
          .patch(`/api/specification-names/${length.id}`)
          .send({ name: 'Span' })
          .expect(403);
        await someone
          .put('/api/specification-names/order')
          .send({ nameIds: [length.id] })
          .expect(403);
        await someone.delete(`/api/specification-names/${length.id}`).expect(403);
      }

      const units = await member.get('/api/units').expect(200);
      expect(units.body.units).toMatchObject([{ symbol: 'mm' }]);
      const names = await member.get('/api/specification-names').expect(200);
      expect(names.body.specificationNames).toMatchObject([{ name: 'Length' }]);
    });

    it('is nobody who is not signed in', async () => {
      await app.request().get('/api/units').expect(401);
      await app.request().get('/api/specification-names').expect(401);
    });
  });
});
