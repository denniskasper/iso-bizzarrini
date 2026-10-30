import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * A Part's Specifications (issue #112): its material, colour, dimensions and weight, each recorded
 * under a name from the Administrator's list.
 *
 * Two rules carry what is asserted here. **The name decides what a value is**: one with a Unit
 * takes a number and nothing else, and the Unit is read from the name rather than typed, so the
 * same weight is never written two ways. And a Specification **belongs to the Part** (ADR 0001),
 * so it reads the same on every Tavola the Part is listed on.
 */

function aPart(fields: Partial<Record<string, string>> = {}) {
  return {
    nameEn: '',
    nameIt: '',
    catalogNumber: '',
    disegnoOrigine: '',
    description: '',
    dimensions: '',
    materialFinish: '',
    catalogNote: '',
    note: '',
    ...fields,
  };
}

describe('a Part’s Specifications', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let tavolaId: string;
  let positionId: string;
  let partId: string;
  let material: string;
  let weight: string;
  let grams: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    editor = (await givenAMember(app, administrator, { name: 'An Editor', role: 'editor' })).agent;

    grams = (await administrator.post('/api/units').send({ symbol: 'g' }).expect(201)).body.unit.id;
    material = (
      await administrator
        .post('/api/specification-names')
        .send({ name: 'Material', unitId: null })
        .expect(201)
    ).body.specificationName.id;
    weight = (
      await administrator
        .post('/api/specification-names')
        .send({ name: 'Weight', unitId: grams })
        .expect(201)
    ).body.specificationName.id;

    const modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
    tavolaId = (await givenTavola(app.db, modelId, { number: '2' })).id;
    positionId = await givenPosition(tavolaId, '12');
    const recorded = await editor
      .post(`/api/tavole/${tavolaId}/listings`)
      .send({ positionId, drawn: true, part: aPart({ nameEn: 'Door handle' }) })
      .expect(201);
    partId = recorded.body.listing.part.id;
  });

  async function givenPosition(onTavola: string, number: string): Promise<string> {
    const sheet = await editor
      .post(`/api/tavole/${onTavola}/positions`)
      .send({ number })
      .expect(201);
    return sheet.body.positions.find((position: { number: string }) => position.number === number)
      .id;
  }

  function record(nameId: string, value: string, onPart = partId) {
    return editor.post(`/api/parts/${onPart}/specifications`).send({ nameId, value });
  }

  /** The Part a member reads at a number on a sheet. */
  async function readAt(atPosition: string, agent: TestAgent = editor) {
    const read = await agent.get(`/api/positions/${atPosition}/listings`).expect(200);
    return read.body.listings[0].part;
  }

  describe('under a name with a Unit', () => {
    it('takes a number with a point, and reads its Unit from the name', async () => {
      const response = await record(weight, '412.5').expect(201);

      expect(response.body.part.specifications).toEqual([
        { id: expect.any(String), nameId: weight, name: 'Weight', value: '412.5', unit: 'g' },
      ]);
    });

    it('takes a number with a comma, read as the decimal separator', async () => {
      const response = await record(weight, ' 412,5 ').expect(201);
      expect(response.body.part.specifications[0].value).toBe('412.5');
    });

    // A weight of "about 40" is not a weight anybody can compare.
    it('refuses words, a number with its Unit typed after it, and nothing at all', async () => {
      for (const value of ['about 40', '412 g', '1.000,5', '']) {
        const refused = await record(weight, value).expect(400);
        expect(refused.body.error.code).toBe('validation_failed');
      }
      expect((await readAt(positionId)).specifications).toEqual([]);
    });
  });

  describe('under a name without a Unit', () => {
    it('takes words, trimmed and kept as written', async () => {
      const response = await record(material, '  Chromed brass ').expect(201);

      expect(response.body.part.specifications).toEqual([
        {
          id: expect.any(String),
          nameId: material,
          name: 'Material',
          value: 'Chromed brass',
          unit: null,
        },
      ]);
    });

    it('refuses nothing at all', async () => {
      await record(material, '   ').expect(400);
    });
  });

  // A Part never has two weights.
  it('is refused a second value under the same name on the same Part', async () => {
    await record(weight, '412').expect(201);

    const refused = await record(weight, '415').expect(409);
    expect(refused.body.error.code).toBe('conflict');
  });

  it('is refused under a name that is not on the list, and on a Part that is not there', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await record(missing, '412').expect(404);
    await record(weight, '412', missing).expect(404);
  });

  it('is corrected and removed', async () => {
    const recorded = await record(weight, '412').expect(201);
    const id = recorded.body.part.specifications[0].id;

    const corrected = await editor
      .patch(`/api/specifications/${id}`)
      .send({ value: '415,25' })
      .expect(200);
    expect(corrected.body.part.specifications[0].value).toBe('415.25');

    await editor.patch(`/api/specifications/${id}`).send({ value: 'heavy' }).expect(400);

    const removed = await editor.delete(`/api/specifications/${id}`).expect(200);
    expect(removed.body.part.specifications).toEqual([]);

    await editor.delete(`/api/specifications/${id}`).expect(404);
    await editor.patch(`/api/specifications/${id}`).send({ value: '1' }).expect(404);
  });

  it('cannot be recorded by a Member who is not an Editor', async () => {
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    await member
      .post(`/api/parts/${partId}/specifications`)
      .send({ nameId: weight, value: '412' })
      .expect(403);
  });

  describe('the Part a member reads', () => {
    it('carries them in the names’ order, the same on two Tavole', async () => {
      // Recorded weight first, and read material first, because that is the list's order.
      await record(weight, '412').expect(201);
      await record(material, 'Chromed brass').expect(201);

      const elsewhere = (
        await givenTavola(app.db, (await givenModel(app.db, { brand: 'Iso', name: 'Lele' })).id, {
          number: '7',
        })
      ).id;
      const there = await givenPosition(elsewhere, '3');
      await editor
        .post(`/api/tavole/${elsewhere}/listings`)
        .send({ positionId: there, drawn: true, partId })
        .expect(201);

      const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
      const here = (await readAt(positionId, member)).specifications;
      const onTheOther = (await readAt(there, member)).specifications;

      expect(
        here.map(({ name, value, unit }: Record<string, unknown>) => ({ name, value, unit })),
      ).toEqual([
        { name: 'Material', value: 'Chromed brass', unit: null },
        { name: 'Weight', value: '412', unit: 'g' },
      ]);
      expect(onTheOther).toEqual(here);
    });

    it('carries none for a Part that has none', async () => {
      expect((await readAt(positionId)).specifications).toEqual([]);
    });

    it('is refused a lapsed Account', async () => {
      await record(weight, '412').expect(201);
      const lapsed = (await givenAMember(app, administrator, { paidThrough: '2025-12-31' })).agent;

      const refused = await lapsed.get(`/api/positions/${positionId}/listings`).expect(403);
      expect(refused.body.error.code).toBe('membership_lapsed');
      expect(JSON.stringify(refused.body)).not.toContain('412');
    });
  });

  describe('the values suggested as an Editor types', () => {
    async function givenParts(count: number): Promise<string[]> {
      const ids: string[] = [];
      for (let index = 0; index < count; index++) {
        const at = await givenPosition(tavolaId, String(100 + index));
        const recorded = await editor
          .post(`/api/tavole/${tavolaId}/listings`)
          .send({ positionId: at, drawn: true, part: aPart({ nameEn: `Bracket ${index}` }) })
          .expect(201);
        ids.push(recorded.body.listing.part.id);
      }
      return ids;
    }

    function suggest(nameId: string, typed: string) {
      return editor.get(`/api/specification-names/${nameId}/suggestions`).query({ q: typed });
    }

    it('are the values already used under the name, ignoring case, most used first', async () => {
      const [one, two, three, four] = await givenParts(4);
      await record(material, 'Brass', one).expect(201);
      await record(material, 'Steel', two).expect(201);
      await record(material, 'Steel', three).expect(201);
      await record(material, 'Stainless steel', four).expect(201);
      await record(material, 'Aluminium').expect(201);

      const response = await suggest(material, 'STE').expect(200);
      expect(response.body.suggestions).toEqual(['Steel', 'Stainless steel']);

      const everything = await suggest(material, '').expect(200);
      expect(everything.body.suggestions).toEqual([
        'Steel',
        'Aluminium',
        'Brass',
        'Stainless steel',
      ]);
    });

    it('are only the name’s own', async () => {
      const colour = (
        await administrator
          .post('/api/specification-names')
          .send({ name: 'Colour', unitId: null })
          .expect(201)
      ).body.specificationName.id;
      await record(colour, 'Steel grey').expect(201);

      expect((await suggest(material, 'st').expect(200)).body.suggestions).toEqual([]);
      expect((await suggest(colour, 'st').expect(200)).body.suggestions).toEqual(['Steel grey']);
    });

    it('read the wildcards of a pattern as ordinary characters', async () => {
      await record(material, 'Brass').expect(201);
      expect((await suggest(material, '%').expect(200)).body.suggestions).toEqual([]);
    });
  });

  // The previous ticket's refusals, now that an Editor can put a value under a name.
  describe('a name with recorded values', () => {
    it('cannot change its Unit', async () => {
      await record(weight, '412').expect(201);
      const kilograms = (await administrator.post('/api/units').send({ symbol: 'kg' }).expect(201))
        .body.unit.id;

      await administrator
        .patch(`/api/specification-names/${weight}`)
        .send({ unitId: kilograms })
        .expect(409);
      await administrator
        .patch(`/api/specification-names/${material}`)
        .send({ unitId: kilograms })
        .expect(200);
    });

    it('cannot be removed', async () => {
      await record(material, 'Brass').expect(201);
      await administrator.delete(`/api/specification-names/${material}`).expect(409);
    });
  });
});
