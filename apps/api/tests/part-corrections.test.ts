import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parts } from '../src/db/schema.js';
import { givenModel, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Correcting a Part, and correcting where it is listed.
 *
 * **Recording is not the hard half; correcting is.** Everything ticket 06 built is a one-way
 * door without this file: a Part with no Catalog Number could be listed exactly once and never
 * again, a Listing removed by mistake could not be put back, and a Part whose last Listing went
 * became a phantom — invisible on every screen, holding a number the archive would go on refusing
 * to anybody who typed it.
 *
 * Two rules run through what is asserted here. A Part is **one thing** (ADR 0001), so correcting
 * it corrects it wherever it is listed and the archive says how many sheets that is before
 * anything is saved. And nothing destroys work on a sheet the Editor is not looking at: removing
 * a Part is refused while it is still listed, so the Listings go first, deliberately.
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

describe('correcting a Part and its Listings', () => {
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
    editor = await app.editor();
    modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
    tavolaId = (await givenTavola(app.db, modelId, { number: '2' })).id;
  });

  async function givenPosition(number: string, onTavola = tavolaId): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${onTavola}/positions`)
      .send({ number })
      .expect(201);
    return response.body.positions.find(
      (position: { number: string }) => position.number === number,
    ).id;
  }

  function list(body: object, onTavola = tavolaId) {
    return editor.post(`/api/tavole/${onTavola}/listings`).send(body);
  }

  /** A Part in the archive, listed at a number, which is the only way one gets there. */
  async function givenPart(
    fields: Partial<Record<string, string>> = {},
    at?: { positionId?: string; onTavola?: string; quantityPerCar?: number; drawn?: boolean },
  ): Promise<{ partId: string; listingId: string }> {
    const response = await list(
      {
        positionId: at?.positionId,
        quantityPerCar: at?.quantityPerCar,
        drawn: at?.drawn ?? true,
        part: aPart(fields),
      },
      at?.onTavola ?? tavolaId,
    ).expect(201);

    return { partId: response.body.listing.part.id, listingId: response.body.listing.id };
  }

  async function readPart(partId: string) {
    const response = await editor.get(`/api/parts/${partId}`).expect(200);
    return response.body;
  }

  async function listingsAt(positionId: string) {
    const response = await editor.get(`/api/positions/${positionId}/listings`).expect(200);
    return response.body.listings;
  }

  describe('the Part itself', () => {
    /**
     * All nine fields, in one press. **Correcting is not re-recording**: an Editor who has to
     * remove a Part and type it again loses its Fitments, its Equivalents, its Sources and every
     * other Listing of it, which is why "remove and record it again" was never a workaround.
     */
    it('has every one of its nine fields corrected in place', async () => {
      const positionId = await givenPosition('207');
      const { partId } = await givenPart({ nameEn: 'Guide rod' }, { positionId });

      const corrected = await editor
        .patch(`/api/parts/${partId}`)
        .send(
          aPart({
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
        )
        .expect(200);

      expect(corrected.body.part).toMatchObject({
        id: partId,
        nameEn: 'Window channel guide rod',
        nameIt: 'ASTA GUIDA PER CRISTALLO MONTANTE',
        catalogNumber: '260 03 150',
        disegnoOrigine: '208503',
        description: 'Guides the door glass in its channel.',
        dimensions: '412 mm',
        materialFinish: 'Steel, cadmium plated',
        catalogNote: 'Fino al telaio 310',
        note: 'The later cars use a longer rod; measure before ordering.',
      });

      // And it is the Part that changed, not a copy of it: the Listing still reads the same one.
      const [listing] = await listingsAt(positionId);
      expect(listing.part.id).toBe(partId);
      expect(listing.part.nameEn).toBe('Window channel guide rod');
    });

    // The three things that can happen to a factory number, and the third is the one an archive
    // usually cannot say: "this Part has no number" must stay expressible (ADR 0001).
    it('takes a Catalog Number it did not have', async () => {
      const { partId } = await givenPart({ nameEn: 'Bleed screw' });

      const corrected = await editor
        .patch(`/api/parts/${partId}`)
        .send(aPart({ nameEn: 'Bleed screw', catalogNumber: '260 03 900' }))
        .expect(200);

      expect(corrected.body.part.catalogNumber).toBe('260 03 900');
    });

    it('has a Catalog Number cleared back to none at all', async () => {
      const { partId } = await givenPart({ nameEn: 'Bleed screw', catalogNumber: '260 03 900' });

      const corrected = await editor
        .patch(`/api/parts/${partId}`)
        .send(aPart({ nameEn: 'Bleed screw' }))
        .expect(200);

      expect(corrected.body.part.catalogNumber).toBeNull();
    });

    /**
     * **The same refusal entering one gets** (ADR 0001), because the rule belongs to the archive
     * and not to the form the number was typed on. The existing Part is carried, since an Editor
     * cannot merge into something they have not been shown.
     */
    it('is refused when its Catalog Number is corrected into one another Part holds', async () => {
      const { partId: hose } = await givenPart({
        nameEn: 'Brake hose',
        catalogNumber: '260 03 150',
      });
      const { partId: caliper } = await givenPart({
        nameEn: 'Caliper',
        catalogNumber: '260 03 151',
      });

      const refused = await editor
        .patch(`/api/parts/${caliper}`)
        .send(aPart({ nameEn: 'Caliper', catalogNumber: '260 03 150' }))
        .expect(409);

      expect(refused.body.error.code).toBe('conflict');
      expect(refused.body.error.details.part).toMatchObject({
        id: hose,
        nameEn: 'Brake hose',
        catalogNumber: '260 03 150',
      });

      // Nothing was written: the Part that was being corrected still has what it had.
      expect((await readPart(caliper)).part.catalogNumber).toBe('260 03 151');
    });

    // Its own number is not a collision with itself, which is what makes correcting a spelling
    // beside an untouched number an ordinary edit rather than a refusal.
    it('keeps its own Catalog Number while everything around it is corrected', async () => {
      const { partId } = await givenPart({ nameEn: 'Brake hose', catalogNumber: '260 03 150' });

      const corrected = await editor
        .patch(`/api/parts/${partId}`)
        .send(aPart({ nameEn: 'Flexible brake hose, front', catalogNumber: '260 03 150' }))
        .expect(200);

      expect(corrected.body.part.nameEn).toBe('Flexible brake hose, front');
      expect(corrected.body.part.catalogNumber).toBe('260 03 150');
    });

    // A Part with neither name is a blank line in a list of Parts. The rule is the same one
    // recording applies, and the database's check constraint stands behind it.
    it('is refused when both of its names are cleared', async () => {
      const { partId } = await givenPart({ nameEn: 'Brake hose' });

      await editor
        .patch(`/api/parts/${partId}`)
        .send(aPart({ note: 'Nameless' }))
        .expect(400);
    });

    it('is a 404 for a Part that is not in the archive', async () => {
      await editor
        .patch('/api/parts/00000000-0000-4000-8000-000000000000')
        .send(aPart({ nameEn: 'Anything' }))
        .expect(404);
    });

    it('cannot be corrected by someone who has not signed in', async () => {
      const { partId } = await givenPart({ nameEn: 'Brake hose' });

      await app
        .request()
        .patch(`/api/parts/${partId}`)
        .send(aPart({ nameEn: 'Anything' }))
        .expect(401);
      await app.request().get(`/api/parts/${partId}`).expect(401);
    });
  });

  /**
   * **How far a correction reaches, said before it is made.** A Part is one thing, so correcting
   * it changes every sheet it is listed on at once — which is exactly what a screen showing one
   * Position cannot show, and is therefore the archive's job to report.
   */
  describe('the sheets a correction reaches', () => {
    it('names every Tavola the Part is listed on', async () => {
      const other = (
        await givenTavola(app.db, modelId, { number: '10', nameEn: 'Electrical system' })
      ).id;
      const here = await givenPosition('12');
      const there = await givenPosition('44', other);

      const { partId } = await givenPart({ nameEn: 'Spring washer' }, { positionId: here });
      await list({ positionId: there, drawn: true, partId }, other).expect(201);

      expect((await readPart(partId)).listedOn).toEqual([
        {
          tavolaId,
          tavolaNumber: '2',
          nameEn: 'Brake system',
          model: { id: modelId, brand: 'Iso', name: 'Grifo', series: null, modelYears: null },
        },
        {
          tavolaId: other,
          tavolaNumber: '10',
          nameEn: 'Electrical system',
          model: { id: modelId, brand: 'Iso', name: 'Grifo', series: null, modelYears: null },
        },
      ]);
    });

    /**
     * One entry per **sheet**, not per Listing. A washer at four numbers on one drawing is on one
     * drawing, and an Editor told a correction reaches four sheets when it reaches one has been
     * told something false about how much they are about to change.
     */
    it('counts a sheet once however many numbers the Part sits at on it', async () => {
      const first = await givenPosition('12');
      const second = await givenPosition('44');
      const third = await givenPosition('58');

      const { partId } = await givenPart({ nameEn: 'Spring washer' }, { positionId: first });
      await list({ positionId: second, drawn: true, partId }).expect(201);
      await list({ positionId: third, drawn: true, partId }).expect(201);

      expect((await readPart(partId)).listedOn).toEqual([expect.objectContaining({ tavolaId })]);
    });

    // The phantom, seen for what it is. Nothing else in the archive can reach this Part.
    it('is empty for a Part whose last Listing was removed', async () => {
      const positionId = await givenPosition('12');
      const { partId, listingId } = await givenPart({ nameEn: 'Fixing kit' }, { positionId });

      await editor.delete(`/api/listings/${listingId}`).expect(204);

      expect((await readPart(partId)).listedOn).toEqual([]);
    });
  });

  describe('a Listing', () => {
    it('has its quantity, its drawn flag and its Position corrected', async () => {
      const from = await givenPosition('12');
      const to = await givenPosition('44');
      const { partId, listingId } = await givenPart(
        { nameEn: 'Bracket screw' },
        { positionId: from, quantityPerCar: 2, drawn: true },
      );

      const corrected = await editor
        .patch(`/api/listings/${listingId}`)
        .send({ positionId: to, quantityPerCar: 4, drawn: false })
        .expect(200);

      expect(corrected.body.listing).toMatchObject({
        id: listingId,
        quantityPerCar: 4,
        drawn: false,
      });
      expect(corrected.body.listing.part.id).toBe(partId);

      expect(await listingsAt(from)).toEqual([]);
      expect((await listingsAt(to))[0].id).toBe(listingId);
    });

    // A Part transcribed against the wrong line of a catalog page, put back where it belongs —
    // and the sheet it is on is not one of the things that can be corrected here.
    it('cannot be moved to a Position on another Tavola', async () => {
      const other = (await givenTavola(app.db, modelId, { number: '10' })).id;
      const elsewhere = await givenPosition('44', other);
      const { listingId } = await givenPart(
        { nameEn: 'Brake hose' },
        { positionId: await givenPosition('12') },
      );

      await editor
        .patch(`/api/listings/${listingId}`)
        .send({ positionId: elsewhere, drawn: true })
        .expect(404);
    });

    it('is refused when the Part is already listed at the number it is moved to', async () => {
      const from = await givenPosition('12');
      const to = await givenPosition('44');
      const { partId, listingId } = await givenPart(
        { nameEn: 'Spring washer' },
        { positionId: from },
      );
      await list({ positionId: to, drawn: false, partId }).expect(201);

      const refused = await editor
        .patch(`/api/listings/${listingId}`)
        .send({ positionId: to, drawn: true })
        .expect(409);

      expect(refused.body.error.code).toBe('conflict');
    });

    // The state a Position removed out from under a Listing leaves it in, reachable deliberately.
    it('has its Position cleared', async () => {
      const positionId = await givenPosition('12');
      const { listingId } = await givenPart({ nameEn: 'Fixing kit' }, { positionId });

      await editor.patch(`/api/listings/${listingId}`).send({ drawn: false }).expect(200);

      expect(await listingsAt(positionId)).toEqual([]);
      const index = await editor.get(`/api/tavole/${tavolaId}/listings`).expect(200);
      expect(index.body.listings).toEqual([expect.objectContaining({ positionId: null })]);
    });

    it('refuses a quantity that is not a count', async () => {
      const { listingId } = await givenPart(
        { nameEn: 'Brake hose' },
        { positionId: await givenPosition('12') },
      );

      await editor
        .patch(`/api/listings/${listingId}`)
        .send({ quantityPerCar: 0, drawn: true })
        .expect(400);
    });

    it('is a 404 once it is gone', async () => {
      const { listingId } = await givenPart(
        { nameEn: 'Brake hose' },
        { positionId: await givenPosition('12') },
      );

      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await editor.patch(`/api/listings/${listingId}`).send({ drawn: true }).expect(404);
    });

    it('cannot be corrected by someone who has not signed in', async () => {
      const { listingId } = await givenPart(
        { nameEn: 'Brake hose' },
        { positionId: await givenPosition('12') },
      );

      await app.request().patch(`/api/listings/${listingId}`).send({ drawn: true }).expect(401);
    });
  });

  /**
   * **The trapdoor ticket 06 left open.** The only path that listed a Part the archive already
   * had was the Catalog Number collision — so a Part with *no* number could be listed exactly
   * once, and an Editor who removed a Listing by mistake had no way to put it back.
   */
  describe('a Part the archive already has, listed again', () => {
    it('is listed at a second number although it has no Catalog Number', async () => {
      const first = await givenPosition('12');
      const second = await givenPosition('44');
      const { partId } = await givenPart({ nameEn: 'Spring washer' }, { positionId: first });

      await list({ positionId: second, quantityPerCar: 6, drawn: false, partId }).expect(201);

      const [washer] = await listingsAt(second);
      expect(washer.part.id).toBe(partId);
      expect(washer.quantityPerCar).toBe(6);
    });

    it('is listed again after its last Listing was removed by mistake', async () => {
      const positionId = await givenPosition('12');
      const { partId, listingId } = await givenPart({ nameEn: 'Spring washer' }, { positionId });

      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await list({ positionId, drawn: true, partId }).expect(201);

      expect((await listingsAt(positionId))[0].part.id).toBe(partId);
    });
  });

  /**
   * **Finding the Part to list again**, which is what makes the paragraph above reachable from a
   * screen.
   *
   * It matches through the archive's one matching rule, which ticket 22 widened to the five
   * fields a member searches — so what is asserted here is no longer *what counts as a match*,
   * which `search.test.ts` covers, but what this lookup **reports** about one: the sheets a
   * correction would reach, and the Part that is on no sheet at all.
   */
  describe('finding an existing Part', () => {
    async function find(query: string) {
      const response = await editor.get('/api/parts').query({ q: query }).expect(200);
      return response.body;
    }

    /**
     * The rule this lookup shares with Search, and the reason a number is typed rather than
     * remembered: the catalog prints `260 03 150`, the bracket is stamped `26003150`, and an
     * Editor holding one should not have to guess which spacing the archive was given.
     *
     * Where it goes further than it once did is the prefix. That widening came with ticket 22 and
     * is the whole point of there being one matcher: an Editor who typed `260 03` and an
     * unnumbered pasted row asking the same question of the same archive get the same answer.
     */
    it('matches a Catalog Number whatever spacing was typed, and from its beginning', async () => {
      const { partId } = await givenPart({ nameEn: 'Brake hose', catalogNumber: '260 03 150' });

      for (const typed of ['260 03 150', '26003150', '  260  03150 ', '260 03']) {
        expect((await find(typed)).parts.map((found: { part: { id: string } }) => found.part.id)) //
          .toEqual([partId]);
      }
    });

    // From the beginning and never from the middle. A number is an identifier compared against a
    // printed page, and matching inside one would answer `03150` with things that are not it.
    it('does not match a Catalog Number from the middle of it', async () => {
      await givenPart({ nameEn: 'Brake hose', catalogNumber: '260 03 150' });

      expect((await find('03 150')).parts).toEqual([]);
    });

    it('matches a prefix of either name, whatever case was typed', async () => {
      const { partId: hose } = await givenPart({ nameEn: 'Brake hose, front' });
      const { partId: rod } = await givenPart({
        nameEn: 'Guide rod',
        nameIt: 'ASTA GUIDA PER CRISTALLO',
      });

      expect((await find('brake')).parts.map((found: { part: { id: string } }) => found.part.id)) //
        .toEqual([hose]);
      expect((await find('asta gui')).parts.map((found: { part: { id: string } }) => found.part.id)) //
        .toEqual([rod]);
      // A prefix, and not a word anywhere in the name. Neither tool reaches into the middle of
      // one: that is free-text search, which the spec rules out for both of them.
      expect((await find('guida')).parts).toEqual([]);
    });

    it('says which Tavole each Part it found is already listed on', async () => {
      const other = (
        await givenTavola(app.db, modelId, { number: '10', nameEn: 'Electrical system' })
      ).id;
      const { partId } = await givenPart(
        { nameEn: 'Spring washer', catalogNumber: '999 00 001' },
        { positionId: await givenPosition('12') },
      );
      await list({ positionId: await givenPosition('44', other), drawn: true, partId }, other) //
        .expect(201);

      const [found] = (await find('999 00 001')).parts;
      expect(found.listedOn.map((sheet: { tavolaNumber: string }) => sheet.tavolaNumber)).toEqual([
        '2',
        '10',
      ]);
    });

    /**
     * **The recovery the phantom needs.** A Part listed nowhere is on no drawing, in no index and
     * behind no circle — this lookup is the only thing in the archive that can see it, which is
     * what turns "the number is taken and I cannot find what has it" into an ordinary afternoon.
     */
    it('surfaces a Part that is listed nowhere', async () => {
      const positionId = await givenPosition('12');
      const { partId, listingId } = await givenPart(
        { nameEn: 'Orphan bracket', catalogNumber: '260 03 999' },
        { positionId },
      );
      await editor.delete(`/api/listings/${listingId}`).expect(204);

      const [found] = (await find('260 03 999')).parts;
      expect(found.part.id).toBe(partId);
      expect(found.listedOn).toEqual([]);
    });

    it('refuses a query with nothing in it', async () => {
      await editor.get('/api/parts').query({ q: '   ' }).expect(400);
      await editor.get('/api/parts').expect(400);
    });

    /**
     * A capped answer must never read as a complete one. An Editor told "no such Part" by a
     * truncated list records a second copy of the Part the list did not get to.
     */
    it('says so when it held matches back', async () => {
      await app.db.insert(parts).values(
        Array.from({ length: 30 }, (_, index) => ({
          nameEn: `Washer, ${String(index).padStart(2, '0')} mm`,
        })),
      );

      const found = await find('washer');
      expect(found.parts).toHaveLength(20);
      expect(found.more).toBe(true);

      const narrower = await find('washer, 0');
      expect(narrower.parts).toHaveLength(10);
      expect(narrower.more).toBe(false);
    });

    // A `%` typed into the box is a character somebody is looking for, not a wildcard.
    it('reads the wildcards of a pattern as ordinary characters', async () => {
      await givenPart({ nameEn: 'Brake hose' });

      expect((await find('%')).parts).toEqual([]);
      expect((await find('_rake')).parts).toEqual([]);
    });

    it('cannot be used by someone who has not signed in', async () => {
      await app.request().get('/api/parts').query({ q: 'brake' }).expect(401);
    });
  });

  /**
   * **The Listings go first, and that is the whole rule.** Removing a Part removes it from every
   * sheet it is on at once, including the ones the Editor is not looking at — so the archive
   * refuses until nothing is listed, and the Editor has had to see each of those sheets to get
   * there.
   */
  describe('removing a Part', () => {
    it('is refused while it is still listed', async () => {
      const positionId = await givenPosition('12');
      const { partId } = await givenPart({ nameEn: 'Brake hose' }, { positionId });

      const refused = await editor.delete(`/api/parts/${partId}`).expect(409);
      expect(refused.body.error.code).toBe('conflict');

      // And it is still there, on the sheet it was on.
      expect((await listingsAt(positionId))[0].part.id).toBe(partId);
    });

    it('is removed once nothing lists it', async () => {
      const positionId = await givenPosition('12');
      const { partId, listingId } = await givenPart(
        { nameEn: 'Orphan bracket', catalogNumber: '260 03 999' },
        { positionId },
      );

      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await editor.delete(`/api/parts/${partId}`).expect(204);

      await editor.get(`/api/parts/${partId}`).expect(404);
    });

    // Which is what removing the phantom was for: the number it was sitting on is free again.
    it('gives its Catalog Number back to the archive', async () => {
      const positionId = await givenPosition('12');
      const { partId, listingId } = await givenPart(
        { nameEn: 'Orphan bracket', catalogNumber: '260 03 999' },
        { positionId },
      );
      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await editor.delete(`/api/parts/${partId}`).expect(204);

      await list({
        positionId,
        drawn: true,
        part: aPart({ nameEn: 'Bracket', catalogNumber: '260 03 999' }),
      }).expect(201);
    });

    it('takes what was recorded about it with it', async () => {
      const positionId = await givenPosition('12');
      const { partId, listingId } = await givenPart({ nameEn: 'Orphan bracket' }, { positionId });
      await editor
        .post(`/api/parts/${partId}/fitments`)
        .send({ modelId, qualifier: 'late cars' })
        .expect(201);

      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await editor.delete(`/api/parts/${partId}`).expect(204);

      expect(await app.db.select().from(parts)).toEqual([]);
    });

    it('is a 404 once it is gone', async () => {
      const { partId, listingId } = await givenPart({ nameEn: 'Orphan bracket' });

      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await editor.delete(`/api/parts/${partId}`).expect(204);
      await editor.delete(`/api/parts/${partId}`).expect(404);
    });

    it('cannot be removed by someone who has not signed in', async () => {
      const { partId } = await givenPart({ nameEn: 'Brake hose' });

      await app.request().delete(`/api/parts/${partId}`).expect(401);
    });
  });
});
