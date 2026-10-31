import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  givenModel,
  givenPhotographImage,
  givenPublished,
  givenScanImage,
  givenTavola,
} from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Sample, as a Visitor reads it** (issue #132, ADR 0019): the public copy of the drawing,
 * every number on it, and at the one open number the Parts as the factory printed them.
 *
 * The promise to members is the load-bearing part, so the Tavola here carries everything the club
 * adds — a Note, a Photograph, a Specification, a Contribution, a Fitment, an Equivalent, a
 * Sub-assembly and a Related Position — and the Visitor's read is asserted whole, so anything more
 * than the factory's fields fails it.
 */
describe('a Sample a Visitor reads', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let member: TestAgent;
  let modelId: string;
  let tavolaId: string;
  let seven: string;
  let nine: string;

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

    modelId = (
      await givenModel(app.db, {
        brand: 'Iso',
        name: 'Grifo',
        series: 'GL 365',
        modelYears: '1965–68',
      })
    ).id;
    tavolaId = await givenScanned('12');
    seven = await givenPosition('7', 0.4, 0.6);
    nine = await givenPosition('9', 0.2, 0.3);
  });

  async function givenScanned(number: string): Promise<string> {
    const id = (
      await givenTavola(app.db, modelId, {
        number,
        nameIt: 'Impianto freni',
        nameEn: 'Brake system',
        catalogSection: 'Sezione B',
      })
    ).id;
    await administrator
      .put(`/api/tavole/${id}/scan`)
      .set('Content-Type', 'image/png')
      .send(await givenScanImage({ width: 3000, height: 2000 }))
      .expect(201);
    return id;
  }

  async function givenPosition(number: string, x: number, y: number, on = tavolaId) {
    const response = await administrator
      .post(`/api/tavole/${on}/marks`)
      .send({ number, x, y })
      .expect(201);
    return (response.body.positions as { id: string; number: string }[]).find(
      (position) => position.number === number,
    )!.id;
  }

  async function givenListed(
    positionId: string,
    part: Record<string, string>,
    quantityPerCar: number | null = 2,
    drawn = true,
  ): Promise<string> {
    const response = await administrator
      .post(`/api/tavole/${tavolaId}/listings`)
      .send({
        positionId,
        quantityPerCar,
        drawn,
        part: {
          nameEn: '',
          nameIt: '',
          catalogNumber: '',
          disegnoOrigine: '',
          description: '',
          dimensions: '',
          materialFinish: '',
          catalogNote: '',
          note: '',
          ...part,
        },
      })
      .expect(201);
    return response.body.listing.part.id;
  }

  function show(positionId: string, on = tavolaId) {
    return administrator.put(`/api/tavole/${on}/sample`).send({ positionId }).expect(200);
  }

  function read(id = tavolaId) {
    return app.request().get(`/api/landing/samples/${id}`);
  }

  /** Everything the club adds, on the open Part, the number it is at, and the sheet. */
  async function givenTheClubsKnowledge(partId: string) {
    const nameId = (
      await administrator
        .post('/api/specification-names')
        .send({ name: 'Material', unitId: null })
        .expect(201)
    ).body.specificationName.id;
    await administrator
      .post(`/api/parts/${partId}/specifications`)
      .send({ nameId, value: 'CLUB-SPECIFICATION' })
      .expect(201);
    await administrator
      .post(`/api/parts/${partId}/fitments`)
      .send({ modelId, qualifier: 'CLUB-FITMENT' })
      .expect(201);
    await administrator
      .post(`/api/parts/${partId}/equivalents`)
      .send({ kind: 'oem', maker: 'CLUB-EQUIVALENT', reference: '6203', note: '' })
      .expect(201);
    await administrator
      .post(`/api/parts/${partId}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(201);
    const aboutPart = await member
      .post(`/api/parts/${partId}/contributions`)
      .send({ text: 'CLUB-CONTRIBUTION about the part' })
      .expect(201);
    await givenPublished(app.db, aboutPart.body.contribution.id);
    const aboutPosition = await member
      .post(`/api/positions/${seven}/contributions`)
      .send({ text: 'CLUB-CONTRIBUTION about the number' })
      .expect(201);
    await givenPublished(app.db, aboutPosition.body.contribution.id);
    await administrator
      .post(`/api/tavole/${tavolaId}/sub-assemblies`)
      .send({ name: 'CLUB-SUB-ASSEMBLY', positionIds: [seven, nine] })
      .expect(201);
    await administrator
      .post(`/api/tavole/${tavolaId}/related-positions`)
      .send({ positionId: seven, otherPositionId: nine })
      .expect(201);
  }

  describe('on the landing', () => {
    it('lists none until an Administrator shows one', async () => {
      const response = await app.request().get('/api/landing').expect(200);
      expect(response.body.landing.samples).toEqual([]);
    });

    it('lists each Sample in the order it was marked, with its public drawing', async () => {
      const other = await givenScanned('3');
      const one = await givenPosition('1', 0.5, 0.5, other);
      await show(one, other);
      app.clock.advanceBy(60_000);
      await show(seven);

      const response = await app.request().get('/api/landing').expect(200);

      expect(response.body.landing.samples).toEqual([
        {
          tavola: {
            id: other,
            number: '3',
            nameIt: 'Impianto freni',
            nameEn: 'Brake system',
            model: { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
          },
          drawing: {
            url: expect.stringMatching(/^\/api\/sample-drawings\//),
            width: expect.any(Number),
            height: expect.any(Number),
          },
        },
        expect.objectContaining({ tavola: expect.objectContaining({ id: tavolaId }) }),
      ]);
    });

    it('stops listing a Sample once it is no longer shown', async () => {
      await show(seven);
      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(204);

      const response = await app.request().get('/api/landing').expect(200);
      expect(response.body.landing.samples).toEqual([]);
    });
  });

  describe('at its Tavola', () => {
    it('is every number drawn, and the factory’s Parts at the open one', async () => {
      await givenListed(seven, {
        catalogNumber: '260 03 150',
        nameIt: 'PINZA FRENO',
        nameEn: 'Brake caliper',
        catalogNote: 'Fino al telaio 310',
      });
      await givenListed(seven, { nameIt: 'VITE', nameEn: 'Screw' }, 4, false);
      await givenListed(nine, { catalogNumber: '999', nameIt: 'DISCO', nameEn: 'Disc' });
      await show(seven);

      const response = await read().expect(200);

      expect(response.body).toEqual({
        sample: {
          tavola: {
            id: tavolaId,
            number: '12',
            nameIt: 'Impianto freni',
            nameEn: 'Brake system',
            model: { brand: 'Iso', name: 'Grifo', series: 'GL 365', modelYears: '1965–68' },
          },
          drawing: {
            url: expect.stringMatching(/^\/api\/sample-drawings\//),
            width: expect.any(Number),
            height: expect.any(Number),
          },
          positions: [
            { number: '7', marks: [{ x: 0.4, y: 0.6 }], open: true },
            { number: '9', marks: [{ x: 0.2, y: 0.3 }], open: false },
          ],
          open: {
            number: '7',
            listings: [
              {
                catalogNumber: '260 03 150',
                nameIt: 'PINZA FRENO',
                nameEn: 'Brake caliper',
                quantityPerCar: 2,
                catalogNote: 'Fino al telaio 310',
              },
              {
                catalogNumber: null,
                nameIt: 'VITE',
                nameEn: 'Screw',
                quantityPerCar: 4,
                catalogNote: null,
              },
            ],
          },
        },
      });
    });

    it('shows its public drawing, which a Visitor may be served', async () => {
      await show(seven);
      const response = await read().expect(200);

      await app.request().get(response.body.sample.drawing.url).expect(200);
    });

    it('shows a number another Administrator opens instead', async () => {
      await show(seven);
      await show(nine);

      const response = await read().expect(200);

      expect(response.body.sample.open).toEqual({ number: '9', listings: [] });
      expect(
        response.body.sample.positions.map((position: { open: boolean }) => position.open),
      ).toEqual([false, true]);
    });

    it('carries nothing the club added, on the Tavola or its open Parts', async () => {
      const partId = await givenListed(seven, {
        catalogNumber: '260 03 150',
        nameIt: 'PINZA FRENO',
        nameEn: 'Brake caliper',
        disegnoOrigine: 'CLUB-DISEGNO',
        description: 'CLUB-DESCRIPTION',
        dimensions: 'CLUB-DIMENSIONS',
        materialFinish: 'CLUB-FINISH',
        catalogNote: 'Fino al telaio 310',
        note: 'CLUB-NOTE',
      });
      await givenTheClubsKnowledge(partId);
      await show(seven);

      const response = await read().expect(200);

      expect(response.body.sample.positions).toEqual([
        { number: '7', marks: [{ x: 0.4, y: 0.6 }], open: true },
        { number: '9', marks: [{ x: 0.2, y: 0.3 }], open: false },
      ]);
      expect(response.body.sample.open.listings).toEqual([
        {
          catalogNumber: '260 03 150',
          nameIt: 'PINZA FRENO',
          nameEn: 'Brake caliper',
          quantityPerCar: 2,
          catalogNote: 'Fino al telaio 310',
        },
      ]);
      expect(Object.keys(response.body.sample).sort()).toEqual([
        'drawing',
        'open',
        'positions',
        'tavola',
      ]);
      // Nothing the club wrote is anywhere in the answer, nor the factory's heading beyond its
      // number and names.
      expect(JSON.stringify(response.body)).not.toMatch(/CLUB-|Sezione/);
      expect(JSON.stringify(response.body)).not.toContain(partId);
    });

    it('is the whole Tavola to a Member at the same address', async () => {
      const partId = await givenListed(seven, { nameEn: 'Brake caliper', note: 'CLUB-NOTE' });
      await givenTheClubsKnowledge(partId);
      await givenListed(nine, { nameEn: 'Disc', note: 'At a locked number' });
      await show(seven);

      const tavola = await member.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(tavola.body.positions).toEqual([
        expect.objectContaining({ id: seven, related: [expect.anything()] }),
        expect.objectContaining({ id: nine, related: [expect.anything()] }),
      ]);
      expect(tavola.body.subAssemblies).toHaveLength(1);

      const atSeven = await member.get(`/api/positions/${seven}/listings`).expect(200);
      expect(atSeven.body.listings[0].part).toEqual(
        expect.objectContaining({
          note: 'CLUB-NOTE',
          specifications: [expect.anything()],
          fitments: [expect.anything()],
          equivalents: [expect.anything()],
          photographs: [expect.anything()],
        }),
      );
      const atNine = await member.get(`/api/positions/${nine}/listings`).expect(200);
      expect(atNine.body.listings[0].part.note).toBe('At a locked number');
    });

    it('leaves the member read, the Scan and the open Parts behind sign-in', async () => {
      await givenListed(seven, { nameEn: 'Brake caliper' });
      await show(seven);
      const scan = (await administrator.get(`/api/tavole/${tavolaId}`).expect(200)).body.tavola
        .scan;

      await app.request().get(`/api/tavole/${tavolaId}`).expect(401);
      await app.request().get(`/api/positions/${seven}/listings`).expect(401);
      await app.request().get(`/api/tavole/${tavolaId}/listings`).expect(401);
      await app.request().get(scan.displayUrl).expect(401);
    });
  });

  describe('for a Tavola that is not a Sample', () => {
    it('says nothing of it, in the words it uses for one that does not exist', async () => {
      const nowhere = await read('00000000-0000-4000-8000-000000000000').expect(404);
      const notShown = await read().expect(404);

      expect(notShown.body).toEqual(nowhere.body);
      expect(JSON.stringify(notShown.body)).not.toMatch(/Brake|freni|12/);
    });

    it('says nothing of one that has stopped being shown', async () => {
      await show(seven);
      await administrator.delete(`/api/tavole/${tavolaId}/sample`).expect(204);

      await read().expect(404);
    });

    it('still refuses its member read and its Scan', async () => {
      const scan = (await administrator.get(`/api/tavole/${tavolaId}`).expect(200)).body.tavola
        .scan;

      await app.request().get(`/api/tavole/${tavolaId}`).expect(401);
      await app.request().get(scan.displayUrl).expect(401);
    });

    it('is refused for an address that is not a Tavola id', async () => {
      await read('not-a-tavola').expect(400);
    });
  });
});
