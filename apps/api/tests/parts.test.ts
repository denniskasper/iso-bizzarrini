import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listings } from '../src/db/schema.js';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Parts, Listings, and reading a Part from a circle.
 *
 * **This is the sentence the whole product exists to complete** — *choose your car, open the
 * drawing, click the position, read the part* — and the last clause of it is what this file
 * covers. What is asserted is mostly about telling things apart, because that is what a member
 * ordering parts actually needs: evidence from interpretation, an alternative from an addition,
 * a Part that has no factory number from one whose number nobody has typed in yet.
 *
 * The identity rule (ADR 0001) is the load-bearing one. A Catalog Number entered twice is not an
 * error to route around; it is how the archive finds out that two Editors are describing the
 * same component, and it is the only thing keeping "which other Tavole does this Part appear on"
 * honest.
 */

/** What a form sends: every field a plain string, blank meaning "not recorded". */
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

describe('reading a Part from a Position', () => {
  let app: TestApp;
  let editor: TestAgent;
  let modelId: string;
  let tavolaId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await givenAnEditor(app);
    modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
    tavolaId = (await givenTavola(app.db, modelId, { number: '2' })).id;
  });

  /** A number on the sheet, recorded the way an Editor's marking tool records one. */
  async function givenPosition(number: string, onTavola = tavolaId): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${onTavola}/positions`)
      .send({ number })
      .expect(201);
    const recorded = response.body.positions.find(
      (position: { number: string }) => position.number === number,
    );
    return recorded.id;
  }

  function list(body: object, onTavola = tavolaId) {
    return editor.post(`/api/tavole/${onTavola}/listings`).send(body);
  }

  async function read(positionId: string) {
    const response = await editor.get(`/api/positions/${positionId}/listings`).expect(200);
    return response.body.listings;
  }

  describe('what a Part carries', () => {
    it('is read back whole at the Position it was listed at', async () => {
      const positionId = await givenPosition('207');

      await list({
        positionId,
        quantityPerCar: 2,
        drawn: true,
        part: aPart({
          nameEn: 'Window channel guide rod',
          nameIt: 'ASTA GUIDA PER CRISTALLO MONTANTE',
          catalogNumber: '260 03 150',
          disegnoOrigine: '208503',
          description: 'Guides the door glass in its channel.',
          dimensions: '412 mm',
          materialFinish: 'Steel, cadmium plated',
          catalogNote: 'Fino al telaio 310',
          note: 'The later cars use a longer rod; measure before ordering.',
        }),
      }).expect(201);

      expect(await read(positionId)).toEqual([
        {
          id: expect.any(String),
          quantityPerCar: 2,
          drawn: true,
          elsewhere: [],
          part: {
            id: expect.any(String),
            nameEn: 'Window channel guide rod',
            // An Editor typed it, so it is nobody's Machine translation.
            nameEnMachineTranslated: false,
            nameIt: 'ASTA GUIDA PER CRISTALLO MONTANTE',
            catalogNumber: '260 03 150',
            disegnoOrigine: '208503',
            description: 'Guides the door glass in its channel.',
            dimensions: '412 mm',
            materialFinish: 'Steel, cadmium plated',
            catalogNote: 'Fino al telaio 310',
            catalogNoteEn: null,
            note: 'The later cars use a longer rod; measure before ordering.',
            // What fits it, what replaces it, where it has been available (ticket 08) and what
            // it looks like (ticket 10) arrive with it — empty here, because a Part recorded a
            // moment ago has none of them, and asserted so that the whole of what a member is
            // handed stays written down.
            fitments: [],
            equivalents: [],
            sources: [],
            photographs: [],
          },
        },
      ]);
    });

    /**
     * The factory's words and the club's are two fields and stay two. A member deciding what to
     * buy has to be able to tell evidence from interpretation (story 62), and nothing may
     * "improve" a transcription.
     */
    it('keeps the Catalog Note apart from the Note', async () => {
      const positionId = await givenPosition('12');

      await list({
        positionId,
        drawn: true,
        part: aPart({
          nameEn: 'Brake hose',
          catalogNote: 'V. TAV. 3',
          note: 'Braided replacements are available and fit without modification.',
        }),
      }).expect(201);

      const [listing] = await read(positionId);
      expect(listing.part.catalogNote).toBe('V. TAV. 3');
      expect(listing.part.note).toBe(
        'Braided replacements are available and fit without modification.',
      );
    });

    // "No number is invented. Where a Part has no factory number, it has none." (ADR 0001)
    it('is legitimate with no Catalog Number at all', async () => {
      const positionId = await givenPosition('12');

      await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Spring washer' }),
      }).expect(201);

      const [listing] = await read(positionId);
      expect(listing.part.catalogNumber).toBeNull();
    });

    it('is refused when it has no name in either language', async () => {
      const positionId = await givenPosition('12');

      const response = await list({
        positionId,
        drawn: true,
        part: aPart({ catalogNumber: '260 03 150' }),
      }).expect(400);

      expect(response.body.error.code).toBe('validation_failed');
    });

    // The catalog prints `260 03 150` with its spaces, and a member compares it character by
    // character against a stamped bracket. The trim is of what a form added, never of the value.
    it('keeps a Catalog Number exactly as the catalog prints it', async () => {
      const positionId = await givenPosition('12');

      await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose', catalogNumber: '  260 03 150  ' }),
      }).expect(201);

      const [listing] = await read(positionId);
      expect(listing.part.catalogNumber).toBe('260 03 150');
    });
  });

  describe('a Catalog Number that is already recorded', () => {
    /**
     * **The collision is the deduplication mechanism** (ADR 0001), so the refusal has to hand
     * back the Part that already holds the number — an Editor cannot merge into something they
     * have not been shown.
     */
    it('surfaces the existing Part instead of recording a second one', async () => {
      const first = await givenPosition('12');
      const second = await givenPosition('44');

      const recorded = await list({
        positionId: first,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose', catalogNumber: '260 03 150' }),
      }).expect(201);

      const refused = await list({
        positionId: second,
        drawn: true,
        part: aPart({ nameEn: 'Flexible brake pipe', catalogNumber: '260 03 150' }),
      }).expect(409);

      expect(refused.body.error.code).toBe('conflict');
      expect(refused.body.error.details.part).toMatchObject({
        id: recorded.body.listing.part.id,
        nameEn: 'Brake hose',
        catalogNumber: '260 03 150',
      });

      // And nothing was written: the second Position is still empty.
      expect(await read(second)).toEqual([]);
    });

    // The merge the refusal forces: the same Part, listed at the other Position.
    it('is merged by listing the Part that already has it', async () => {
      const first = await givenPosition('12');
      const second = await givenPosition('44');

      const recorded = await list({
        positionId: first,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose', catalogNumber: '260 03 150' }),
      }).expect(201);
      const partId = recorded.body.listing.part.id;

      await list({ positionId: second, quantityPerCar: 4, drawn: true, partId }).expect(201);

      const [listing] = await read(second);
      expect(listing.part.id).toBe(partId);
      expect(listing.quantityPerCar).toBe(4);
    });

    it('refuses a request that names a Part and describes one at the same time', async () => {
      const positionId = await givenPosition('12');
      const recorded = await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(201);

      await list({
        positionId: await givenPosition('44'),
        drawn: true,
        partId: recorded.body.listing.part.id,
        part: aPart({ nameEn: 'Something else' }),
      }).expect(400);
    });
  });

  /** Authoritative when known, and still not what tells two Parts apart (ADR 0001). */
  it('lets two Parts share a Disegno Origine', async () => {
    const positionId = await givenPosition('12');

    await list({
      positionId,
      drawn: true,
      part: aPart({
        nameEn: 'Bracket, left',
        catalogNumber: '260 03 150',
        disegnoOrigine: '208503',
      }),
    }).expect(201);
    await list({
      positionId,
      drawn: true,
      part: aPart({
        nameEn: 'Bracket, right',
        catalogNumber: '260 03 151',
        disegnoOrigine: '208503',
      }),
    }).expect(201);

    const drawings = (await read(positionId)).map(
      (listing: { part: { disegnoOrigine: string } }) => listing.part.disegnoOrigine,
    );
    expect(drawings).toEqual(['208503', '208503']);
  });

  describe('the same Part on two Tavole', () => {
    /**
     * The quantity lives on the Listing and not on the Part, which is exactly what this asserts:
     * one washer, counted where it is used.
     */
    it('carries a different quantity on each', async () => {
      const other = (await givenTavola(app.db, modelId, { number: '10' })).id;
      const here = await givenPosition('12');
      const there = await givenPosition('44', other);

      const recorded = await list({
        positionId: here,
        quantityPerCar: 4,
        drawn: true,
        part: aPart({ nameEn: 'Spring washer', catalogNumber: '999 00 001' }),
      }).expect(201);
      const partId = recorded.body.listing.part.id;

      await list({ positionId: there, quantityPerCar: 2, drawn: true, partId }, other).expect(201);

      expect((await read(here))[0].quantityPerCar).toBe(4);
      expect((await read(there))[0].quantityPerCar).toBe(2);
    });

    it('is reported from each as appearing on the other', async () => {
      const other = (
        await givenTavola(app.db, modelId, {
          number: '10',
          nameEn: 'Electrical system',
          nameIt: 'Impianto elettrico',
        })
      ).id;
      const here = await givenPosition('12');
      const there = await givenPosition('44', other);

      const recorded = await list({
        positionId: here,
        quantityPerCar: 4,
        drawn: true,
        part: aPart({ nameEn: 'Spring washer' }),
      }).expect(201);

      await list(
        {
          positionId: there,
          quantityPerCar: 2,
          drawn: true,
          partId: recorded.body.listing.part.id,
        },
        other,
      ).expect(201);

      const [washer] = await read(here);
      expect(washer.elsewhere).toEqual([
        {
          tavolaId: other,
          tavolaNumber: '10',
          nameEn: 'Electrical system',
          nameEnMachineTranslated: false,
          nameIt: 'Impianto elettrico',
          model: { id: modelId, brand: 'Iso', name: 'Grifo', series: null, modelYears: null },
          positionNumber: '44',
          quantityPerCar: 2,
        },
      ]);
    });

    // The sheet being read is where the member already is. Repeating it as somewhere "else"
    // would be the archive pointing at itself.
    it('does not report the Tavola being read as somewhere else', async () => {
      const here = await givenPosition('12');
      const alsoHere = await givenPosition('44');

      const recorded = await list({
        positionId: here,
        drawn: true,
        part: aPart({ nameEn: 'Spring washer' }),
      }).expect(201);

      await list({
        positionId: alsoHere,
        drawn: true,
        partId: recorded.body.listing.part.id,
      }).expect(201);

      expect((await read(here))[0].elsewhere).toEqual([]);
    });
  });

  describe('several Parts at one Position', () => {
    /**
     * **The distinction a member cannot afford to have shown ambiguously.** Two drawn Parts are
     * fitted instead of one another; three undrawn ones are all needed as well. Buying one when
     * three were wanted, or three when one was, is the failure this ordering exists to prevent —
     * so the drawn ones come first, and every Listing says which it is.
     */
    it('reports the drawn alternatives before the undrawn fixings', async () => {
      const positionId = await givenPosition('12');

      for (const [nameEn, drawn] of [
        ['Bolt', false],
        ['Caliper, early', true],
        ['Washer', false],
        ['Caliper, late', true],
        ['Split pin', false],
      ] as const) {
        await list({ positionId, drawn, part: aPart({ nameEn }) }).expect(201);
      }

      const listings = await read(positionId);
      expect(listings.map((listing: { drawn: boolean }) => listing.drawn)).toEqual([
        true,
        true,
        false,
        false,
        false,
      ]);
      expect(
        listings
          .filter((listing: { drawn: boolean }) => listing.drawn)
          .map((listing: { part: { nameEn: string } }) => listing.part.nameEn),
      ).toEqual(['Caliper, early', 'Caliper, late']);
    });

    it('refuses the same Part listed twice at one Position', async () => {
      const positionId = await givenPosition('12');
      const recorded = await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(201);

      await list({
        positionId,
        drawn: false,
        partId: recorded.body.listing.part.id,
      }).expect(409);
    });
  });

  describe('a Listing', () => {
    // A Part the catalog names on a sheet without anybody having decided which number it sits at.
    it('may be recorded on a Tavola with no Position at all', async () => {
      await list({ drawn: false, part: aPart({ nameEn: 'Fixing kit' }) }).expect(201);
    });

    it('cannot be put at a Position on somebody else’s Tavola', async () => {
      const other = (await givenTavola(app.db, modelId, { number: '10' })).id;
      const elsewhere = await givenPosition('44', other);

      await list({
        positionId: elsewhere,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(404);
    });

    it('refuses a quantity that is not a count', async () => {
      const positionId = await givenPosition('12');

      await list({
        positionId,
        quantityPerCar: 0,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(400);
    });

    it('is removed when it was recorded in the wrong place', async () => {
      const positionId = await givenPosition('12');
      const recorded = await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(201);

      await editor.delete(`/api/listings/${recorded.body.listing.id}`).expect(204);

      expect(await read(positionId)).toEqual([]);
    });

    it('is a 404 once it is gone', async () => {
      const positionId = await givenPosition('12');
      const recorded = await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(201);

      await editor.delete(`/api/listings/${recorded.body.listing.id}`).expect(204);
      await editor.delete(`/api/listings/${recorded.body.listing.id}`).expect(404);
    });

    /**
     * Removing a Position is how a mistyped number is undone, and it must not take an evening of
     * part data with it. The Listing stays on the Tavola, without a Position — which is a state
     * the model already has.
     */
    it('survives the Position it was at being removed', async () => {
      const positionId = await givenPosition('12');
      const recorded = await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose', catalogNumber: '260 03 150' }),
      }).expect(201);

      await editor.delete(`/api/positions/${positionId}`).expect(200);

      // Read from the database as well as over HTTP, because the row surviving is the claim and
      // the sheet's index is where a member meets it: the Listing keeps its Tavola and loses its
      // Position, which is the state ticket 07 gave somewhere to be seen.
      const remaining = await app.db.select().from(listings);
      expect(remaining).toEqual([
        expect.objectContaining({
          id: recorded.body.listing.id,
          tavolaId,
          positionId: null,
        }),
      ]);

      const response = await editor.get(`/api/tavole/${tavolaId}/listings`).expect(200);
      expect(response.body.listings).toEqual([expect.objectContaining({ positionId: null })]);
    });

    it('cannot be recorded or removed by someone who has not signed in', async () => {
      const positionId = await givenPosition('12');
      const recorded = await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Brake hose' }),
      }).expect(201);

      await app
        .request()
        .post(`/api/tavole/${tavolaId}/listings`)
        .send({ positionId, drawn: true, part: aPart({ nameEn: 'Anything' }) })
        .expect(401);
      await app.request().delete(`/api/listings/${recorded.body.listing.id}`).expect(401);
      await app.request().get(`/api/positions/${positionId}/listings`).expect(401);
    });
  });

  /**
   * **The sheet read as text rather than as a drawing** (story 46), which is what makes
   * navigation two-way — and, because a Position that appears nowhere in it is one nobody has
   * written anything down about, it is also what tells "not known" from "not yet clicked".
   */
  describe('everything listed on one Tavola', () => {
    async function index(onTavola = tavolaId) {
      const response = await editor.get(`/api/tavole/${onTavola}/listings`).expect(200);
      return response.body.listings;
    }

    it('is reported in the order the factory printed its numbers, drawn first at each', async () => {
      // Recorded out of order deliberately: the archive's order is the archive's, and nothing
      // in a browser is ever asked to sort a catalog. `10` before `2` is the failure this rules
      // out — a catalog sorted as text rather than as the numbers it prints.
      const ten = await givenPosition('10');
      const two = await givenPosition('2');

      await list({ positionId: ten, drawn: true, part: aPart({ nameEn: 'Hose' }) }).expect(201);
      await list({ positionId: two, drawn: false, part: aPart({ nameEn: 'Washer' }) }).expect(201);
      await list({ positionId: two, drawn: true, part: aPart({ nameEn: 'Caliper' }) }).expect(201);

      expect(
        (await index()).map((listing: { positionId: string; part: { nameEn: string } }) => [
          listing.positionId,
          listing.part.nameEn,
        ]),
      ).toEqual([
        [two, 'Caliper'],
        [two, 'Washer'],
        [ten, 'Hose'],
      ]);
    });

    // The one place a Listing at no number at all can be seen — which is why the model has had
    // that state since ticket 06 and nothing could reach it until now.
    it('includes the Listings that sit at no Position, last', async () => {
      const positionId = await givenPosition('2');
      await list({ positionId, drawn: true, part: aPart({ nameEn: 'Caliper' }) }).expect(201);
      await list({ drawn: false, part: aPart({ nameEn: 'Fixing kit' }) }).expect(201);

      expect(await index()).toEqual([
        expect.objectContaining({ positionId }),
        expect.objectContaining({ positionId: null }),
      ]);
    });

    /**
     * Four columns of the Part and no more. A Tavola may carry two hundred numbers with several
     * Parts on each, and a list is skimmed — the prose arrives when a member picks one.
     */
    it('carries what a printed catalog page prints, and not the prose', async () => {
      const positionId = await givenPosition('2');
      await list({
        positionId,
        quantityPerCar: 4,
        drawn: true,
        part: aPart({
          nameEn: 'Caliper mounting bolt',
          nameIt: 'VITE FISSAGGIO PINZA',
          catalogNumber: '999 01 004',
          description: 'An ordinary fastener.',
          note: 'A modern equivalent is fine.',
        }),
      }).expect(201);

      expect(await index()).toEqual([
        {
          id: expect.any(String),
          positionId,
          quantityPerCar: 4,
          drawn: true,
          part: {
            id: expect.any(String),
            nameEn: 'Caliper mounting bolt',
            nameEnMachineTranslated: false,
            nameIt: 'VITE FISSAGGIO PINZA',
            catalogNumber: '999 01 004',
          },
        },
      ]);
    });

    it('is an empty list for a sheet nobody has recorded anything on', async () => {
      expect(await index()).toEqual([]);
    });

    it('is a 404 for a Tavola that is not in the archive', async () => {
      await editor.get('/api/tavole/00000000-0000-4000-8000-000000000000/listings').expect(404);
    });

    it('cannot be read by someone who has not signed in', async () => {
      await app.request().get(`/api/tavole/${tavolaId}/listings`).expect(401);
    });

    /**
     * The hole ticket 06 left open, closed now that there is a screen where it would show.
     *
     * `(part, tavola, position)` cannot catch this, because Postgres counts two NULLs as
     * different — so the same component could be listed twice on one sheet at no number, and the
     * index above would print it twice with nothing to tell the two apart.
     */
    it('cannot hold the same Part twice at no Position', async () => {
      const recorded = await list({
        drawn: false,
        part: aPart({ nameEn: 'Fixing kit' }),
      }).expect(201);

      await list({ drawn: false, partId: recorded.body.listing.part.id }).expect(409);
      expect(await index()).toHaveLength(1);
    });

    // The same Part *is* listed on two sheets, and on one of them at no number. That is not the
    // duplicate above; it is the ordinary thing ADR 0001 exists to make possible.
    it('still lets the same Part sit unplaced on another Tavola', async () => {
      const other = (await givenTavola(app.db, modelId, { number: '10' })).id;
      const recorded = await list({
        drawn: false,
        part: aPart({ nameEn: 'Fixing kit' }),
      }).expect(201);

      await list({ drawn: false, partId: recorded.body.listing.part.id }, other).expect(201);
      expect(await index(other)).toHaveLength(1);
    });
  });

  describe('a Position nobody has recorded a Part at', () => {
    // "Not known" and "not yet clicked" are different things to a member (story 45), and the
    // archive answers the first one plainly rather than with nothing at all.
    it('reports no Listings rather than a refusal', async () => {
      expect(await read(await givenPosition('12'))).toEqual([]);
    });

    it('is a 404 for a Position that is not in the archive', async () => {
      await editor.get('/api/positions/00000000-0000-4000-8000-000000000000/listings').expect(404);
    });
  });
});
