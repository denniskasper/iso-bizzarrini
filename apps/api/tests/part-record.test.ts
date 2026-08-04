import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * What fits a Part, what can be bought instead of it, and where it has actually been available.
 *
 * **This is the content that turns a catalog into something a restorer can use.** Everything up
 * to here tells somebody what the factory called a component; these three tell them whether it
 * fits their car, what to order now that the original has not been made for fifty years, and who
 * had one last time anybody looked.
 *
 * Two rules carry most of what is asserted below. A Fitment's qualifier is **free text and is
 * never parsed** — half-known chassis breaks are recorded as the person knew them, or they are
 * lost. And a price is **never separable from the date it was seen**: it is refused at entry
 * rather than hidden at display, because an archive that quietly kept a dateless figure would go
 * on showing it as though somebody had checked this morning.
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

/** What a form sends about a Source: every field a plain string, blank meaning "not recorded". */
function aSource(fields: Partial<Record<string, string>> = {}) {
  return {
    name: 'Fabbrica Ricambi',
    url: 'https://example.invalid/brake-hose',
    condition: '',
    price: '',
    currency: 'EUR',
    observedOn: '',
    note: '',
    ...fields,
  };
}

describe('what fits a Part, what replaces it, and where it has been', () => {
  let app: TestApp;
  let editor: TestAgent;
  let modelId: string;
  let tavolaId: string;
  let positionId: string;
  let partId: string;

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
    tavolaId = (await givenTavola(app.db, modelId, { number: '2' })).id;

    // A number on the sheet with a Part at it — the state a member is in when they read any of
    // this. What is under test is never the marking or the Listing; it is only how a Part comes
    // to exist at all.
    const sheet = await editor
      .post(`/api/tavole/${tavolaId}/positions`)
      .send({ number: '12' })
      .expect(201);
    positionId = sheet.body.positions[0].id;

    const recorded = await editor
      .post(`/api/tavole/${tavolaId}/listings`)
      .send({ positionId, drawn: true, part: aPart({ nameEn: 'Flexible brake hose' }) })
      .expect(201);
    partId = recorded.body.listing.part.id;
  });

  describe('a Fitment', () => {
    /**
     * **The qualifier is the point, and it is free text** (story 71). "From chassis #310" is what
     * somebody actually knows; a structured break would demand a precision nobody has and would
     * drop everything that did not fit the shape.
     */
    it('records the car it fits with the qualification in the words it was written in', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: 'from chassis #310' })
        .expect(201);

      expect(response.body.part.fitments).toEqual([
        {
          id: expect.any(String),
          model: { id: modelId, brand: 'Iso', name: 'Grifo', series: null, modelYears: null },
          qualifier: 'from chassis #310',
        },
      ]);
    });

    it('is ordinary with no qualification at all', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: '' })
        .expect(201);

      expect(response.body.part.fitments[0].qualifier).toBeNull();
    });

    /**
     * Every car the Part fits, so the member judges cross-model compatibility themselves
     * (story 70) — in the order a catalog prints its cars rather than the order they were typed.
     */
    it('lists every Model the Part fits, in the catalog’s own order', async () => {
      const rivolta = (await givenModel(app.db, { brand: 'Iso', name: 'Rivolta IR 300' })).id;
      const bizzarrini = (await givenModel(app.db, { brand: 'Bizzarrini', name: '5300 GT Strada' }))
        .id;

      await editor.post(`/api/parts/${partId}/fitments`).send({ modelId, qualifier: '' });
      await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId: rivolta, qualifier: 'late' });
      const response = await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId: bizzarrini, qualifier: '' })
        .expect(201);

      expect(
        response.body.part.fitments.map(
          (fitment: { model: { name: string } }) => fitment.model.name,
        ),
      ).toEqual(['5300 GT Strada', 'Grifo', 'Rivolta IR 300']);
    });

    // A Part fits a car or it does not, and the qualifier says how. Two rows for one car would be
    // the archive answering "does this fit my Grifo" twice.
    it('is refused when the Part is already recorded as fitting that Model', async () => {
      await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: '' })
        .expect(201);

      const refused = await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: 'late' })
        .expect(409);
      expect(refused.body.error.code).toBe('conflict');
    });

    it('is corrected when the qualification was wrong', async () => {
      const recorded = await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: 'from chassis #310' })
        .expect(201);
      const fitmentId = recorded.body.part.fitments[0].id;

      const corrected = await editor
        .patch(`/api/fitments/${fitmentId}`)
        .send({ modelId, qualifier: 'from chassis #312' })
        .expect(200);

      expect(corrected.body.part.fitments[0].qualifier).toBe('from chassis #312');
    });

    it('is removed', async () => {
      const recorded = await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: '' })
        .expect(201);

      const removed = await editor
        .delete(`/api/fitments/${recorded.body.part.fitments[0].id}`)
        .expect(200);
      expect(removed.body.part.fitments).toEqual([]);
    });

    it('cannot name a Model the archive does not have', async () => {
      await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId: '00000000-0000-4000-8000-000000000000', qualifier: '' })
        .expect(404);
    });

    it('cannot be recorded by someone who has not signed in', async () => {
      await app
        .request()
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: '' })
        .expect(401);
    });
  });

  describe('an Equivalent', () => {
    /**
     * **Unbounded, and that is the requirement rather than a consequence** (story 109). The
     * previous implementation of this archive had two columns, so a Part with six known
     * cross-references kept two of them.
     */
    it('is one of any number a Part may carry', async () => {
      for (const maker of ['Girling', 'Lockheed', 'ATE', 'Bendix', 'Ferodo']) {
        await editor
          .post(`/api/parts/${partId}/equivalents`)
          .send({ kind: 'oe-supplier', maker, reference: '', note: '' })
          .expect(201);
      }

      const response = await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({ kind: 'oem', maker: 'SKF', reference: '6203-2RS', note: '' })
        .expect(201);
      expect(response.body.part.equivalents).toHaveLength(6);
    });

    it('carries what kind of thing it is, and the number to quote', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({
          kind: 'industry-standard',
          maker: 'DIN',
          reference: 'DIN 934 M10',
          note: 'Any supplier’s will do.',
        })
        .expect(201);

      expect(response.body.part.equivalents).toEqual([
        {
          id: expect.any(String),
          kind: 'industry-standard',
          maker: 'DIN',
          reference: 'DIN 934 M10',
          note: 'Any supplier’s will do.',
        },
      ]);
    });

    /**
     * **The car alone is the useful fact** (story 73). Often nobody knows what the other
     * manufacturer called it, and refusing the row for want of a number would throw away the one
     * thing that sends somebody to a scrapyard with something to look for.
     */
    it('may be a Donor Vehicle with no reference number at all', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({
          kind: 'donor-vehicle',
          maker: 'Fiat 124 Coupé',
          reference: '',
          note: 'The same caliper, in the same size.',
        })
        .expect(201);

      expect(response.body.part.equivalents[0]).toMatchObject({
        kind: 'donor-vehicle',
        maker: 'Fiat 124 Coupé',
        reference: null,
      });
    });

    it('is refused with a kind that is not one of the four', async () => {
      await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({ kind: 'aftermarket', maker: 'Somebody', reference: '', note: '' })
        .expect(400);
    });

    it('is refused with nothing to name it by', async () => {
      await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({ kind: 'oem', maker: '  ', reference: '6203', note: '' })
        .expect(400);
    });

    /**
     * Ordered from the closest thing to the original outwards — the supplier who made it, then
     * another manufacturer's, then a standard anybody sells, then a car to go and find. That is
     * the order a restorer reads them in, and the archive decides it rather than the browser.
     */
    it('is read from the original supplier outwards to the scrapyard', async () => {
      const kinds = ['donor-vehicle', 'industry-standard', 'oem', 'oe-supplier'];
      for (const kind of kinds) {
        await editor
          .post(`/api/parts/${partId}/equivalents`)
          .send({ kind, maker: `Maker for ${kind}`, reference: '', note: '' })
          .expect(201);
      }

      const recorded = await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({ kind: 'oem', maker: 'Another', reference: '', note: '' })
        .expect(201);
      expect(
        recorded.body.part.equivalents.map((equivalent: { kind: string }) => equivalent.kind),
      ).toEqual(['oe-supplier', 'oem', 'oem', 'industry-standard', 'donor-vehicle']);
    });

    it('is refused when the same one is already recorded', async () => {
      const body = { kind: 'oem', maker: 'SKF', reference: '6203-2RS', note: '' };
      await editor.post(`/api/parts/${partId}/equivalents`).send(body).expect(201);
      await editor.post(`/api/parts/${partId}/equivalents`).send(body).expect(409);
    });

    // The same rule where the reference is absent, which the constraint above cannot reach:
    // Postgres counts two NULLs as different, and two identical donor vehicles would print twice.
    it('is refused when the same Donor Vehicle is already recorded without a reference', async () => {
      const body = { kind: 'donor-vehicle', maker: 'Fiat 124 Coupé', reference: '', note: '' };
      await editor.post(`/api/parts/${partId}/equivalents`).send(body).expect(201);
      await editor.post(`/api/parts/${partId}/equivalents`).send(body).expect(409);
    });

    it('is corrected and removed', async () => {
      const recorded = await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({ kind: 'oem', maker: 'SKF', reference: '6203', note: '' })
        .expect(201);
      const equivalentId = recorded.body.part.equivalents[0].id;

      const corrected = await editor
        .patch(`/api/equivalents/${equivalentId}`)
        .send({ kind: 'oem', maker: 'SKF', reference: '6203-2RS', note: 'Sealed both sides.' })
        .expect(200);
      expect(corrected.body.part.equivalents[0]).toMatchObject({
        reference: '6203-2RS',
        note: 'Sealed both sides.',
      });

      const removed = await editor.delete(`/api/equivalents/${equivalentId}`).expect(200);
      expect(removed.body.part.equivalents).toEqual([]);
    });
  });

  describe('a Source', () => {
    it('records where the Part has been available, and what was on offer', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(
          aSource({
            name: 'Fabbrica Ricambi',
            url: 'https://example.invalid/brake-hose',
            condition: 'new-old-stock',
            price: '250.00',
            currency: 'EUR',
            observedOn: '2025-11-02',
            note: 'Two in stock when this was written.',
          }),
        )
        .expect(201);

      expect(response.body.part.sources).toEqual([
        {
          id: expect.any(String),
          name: 'Fabbrica Ricambi',
          url: 'https://example.invalid/brake-hose',
          condition: 'new-old-stock',
          price: { amount: 25000, currency: 'EUR', observedOn: '2025-11-02' },
          note: 'Two in stock when this was written.',
        },
      ]);
    });

    /**
     * **The rule the whole ticket turns on** (stories 75, 76). Refused at the point of entry, not
     * merely hidden at display: an archive holding a dateless figure would eventually print it.
     */
    it('is refused when a price arrives without the date it was seen', async () => {
      const refused = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ price: '250.00', observedOn: '' }))
        .expect(400);

      expect(refused.body.error.message).toMatch(/date/i);
    });

    // The same refusal on the way in the second time. A Source recorded properly and then
    // corrected into a dateless price would arrive at exactly the state the rule forbids.
    it('is refused when a correction takes the date off a price', async () => {
      const recorded = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ price: '250.00', observedOn: '2025-11-02' }))
        .expect(201);

      await editor
        .patch(`/api/sources/${recorded.body.part.sources[0].id}`)
        .send(aSource({ price: '250.00', observedOn: '' }))
        .expect(400);
    });

    // A price seen tomorrow was not seen. The clock is the archive's, not the browser's.
    it('is refused when the price was seen on a date the archive has not reached', async () => {
      await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ price: '250.00', observedOn: '2027-01-01' }))
        .expect(400);
    });

    it('is ordinary with no price at all', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ name: 'A specialist in Modena', observedOn: '', price: '' }))
        .expect(201);

      expect(response.body.part.sources[0].price).toBeNull();
    });

    it('keeps the currencies these cars actually trade in, and nothing else', async () => {
      for (const currency of ['EUR', 'USD', 'GBP', 'CHF']) {
        const response = await editor
          .post(`/api/parts/${partId}/sources`)
          .send(
            aSource({ name: `Shop ${currency}`, price: '10', currency, observedOn: '2025-11-02' }),
          )
          .expect(201);
        expect(
          response.body.part.sources.find(
            (source: { name: string }) => source.name === `Shop ${currency}`,
          ).price,
        ).toEqual({ amount: 1000, currency, observedOn: '2025-11-02' });
      }

      await editor
        .post(`/api/parts/${partId}/sources`)
        .send(
          aSource({ name: 'Elsewhere', price: '10', currency: 'JPY', observedOn: '2025-11-02' }),
        )
        .expect(400);
    });

    it('refuses a price that is not one', async () => {
      await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ price: 'about two fifty', observedOn: '2025-11-02' }))
        .expect(400);
    });

    /**
     * **The first thing a restorer asks.** New old stock, used or a reproduction changes the
     * decision completely — and where the offer did not say, the archive says that rather than
     * guessing, the same way it does about a Part with no Catalog Number (ADR 0001).
     */
    it('records what condition was on offer, and says nothing where the offer did not', async () => {
      const stated = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ name: 'Reproductions Ltd', condition: 'reproduction' }))
        .expect(201);
      expect(stated.body.part.sources[0].condition).toBe('reproduction');

      const silent = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ name: 'An auction', condition: '' }))
        .expect(201);
      expect(
        silent.body.part.sources.find((source: { name: string }) => source.name === 'An auction')
          .condition,
      ).toBeNull();
    });

    it('refuses a condition that is not one of the three', async () => {
      await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ condition: 'mint' }))
        .expect(400);
    });

    it('refuses somewhere that is not a link a member can follow', async () => {
      await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ url: 'ask in the forum' }))
        .expect(400);
    });

    /**
     * The same shop, twice, at two prices on two dates is a **price history** rather than a
     * duplicate — and it is the reason nothing here is unique. What a member wants to know is
     * whether the figure has moved.
     */
    it('is read with the most recently seen price first', async () => {
      for (const [name, observedOn] of [
        ['Fabbrica Ricambi', '2024-03-01'],
        ['Fabbrica Ricambi', '2025-11-02'],
        ['An older listing', '2023-01-15'],
      ]) {
        await editor
          .post(`/api/parts/${partId}/sources`)
          .send(aSource({ name, price: '250', observedOn }))
          .expect(201);
      }
      const withoutAPrice = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ name: 'Never priced' }))
        .expect(201);

      expect(
        withoutAPrice.body.part.sources.map(
          (source: { price: { observedOn: string } | null }) => source.price?.observedOn ?? null,
        ),
      ).toEqual(['2025-11-02', '2024-03-01', '2023-01-15', null]);
    });

    it('is corrected and removed', async () => {
      const recorded = await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ price: '250', observedOn: '2025-11-02' }))
        .expect(201);
      const sourceId = recorded.body.part.sources[0].id;

      const corrected = await editor
        .patch(`/api/sources/${sourceId}`)
        .send(aSource({ price: '295,50', currency: 'GBP', observedOn: '2025-12-24' }))
        .expect(200);
      expect(corrected.body.part.sources[0].price).toEqual({
        amount: 29550,
        currency: 'GBP',
        observedOn: '2025-12-24',
      });

      const removed = await editor.delete(`/api/sources/${sourceId}`).expect(200);
      expect(removed.body.part.sources).toEqual([]);
    });
  });

  /** All three arrive with the Part a member clicked, because that is where they are read. */
  describe('the Part a member reads', () => {
    it('carries what fits it, what replaces it and where to get it', async () => {
      await editor.post(`/api/parts/${partId}/fitments`).send({ modelId, qualifier: 'late' });
      await editor
        .post(`/api/parts/${partId}/equivalents`)
        .send({ kind: 'oem', maker: 'SKF', reference: '6203-2RS', note: '' });
      await editor
        .post(`/api/parts/${partId}/sources`)
        .send(aSource({ price: '250', observedOn: '2025-11-02' }));

      const read = await editor.get(`/api/positions/${positionId}/listings`).expect(200);
      const [{ part }] = read.body.listings;

      expect(part.fitments).toHaveLength(1);
      expect(part.equivalents).toHaveLength(1);
      expect(part.sources).toHaveLength(1);
      expect(part.sources[0].price).toEqual({
        amount: 25000,
        currency: 'EUR',
        observedOn: '2025-11-02',
      });
    });

    /**
     * And none of it reaches the sheet's index, which stays the four columns a printed catalog
     * page prints. A Tavola may carry two hundred numbers with several Parts on each, and every
     * car one fits and every shop that has had one is a drawing's worth of prose nobody skimming
     * a table of contents asked to read.
     */
    it('does not carry any of it into the sheet’s own index', async () => {
      await editor.post(`/api/parts/${partId}/fitments`).send({ modelId, qualifier: 'late' });

      const response = await editor.get(`/api/tavole/${tavolaId}/listings`).expect(200);
      expect(response.body.listings[0].part).toEqual({
        id: partId,
        nameEn: 'Flexible brake hose',
        nameIt: null,
        catalogNumber: null,
      });
    });

    it('is a 404 for a Part that is not in the archive', async () => {
      await editor
        .post('/api/parts/00000000-0000-4000-8000-000000000000/fitments')
        .send({ modelId, qualifier: '' })
        .expect(404);
    });

    it('is a 404 once a Fitment, Equivalent or Source is gone', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await editor.delete(`/api/fitments/${missing}`).expect(404);
      await editor.delete(`/api/equivalents/${missing}`).expect(404);
      await editor.delete(`/api/sources/${missing}`).expect(404);
    });
  });
});
