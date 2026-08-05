import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Search — **the route into the archive that does not start at the car.**
 *
 * Every other way in begins with choosing a Model, and half the time a restorer begins with the
 * bracket in their hand instead. So what is asserted here is mostly about *reaching* a Part from
 * the only thing somebody holding it can read: a number stamped into metal, printed in a letter,
 * or moulded into a modern bearing that replaces it.
 *
 * The headline is the last of those. A member typing `6205` is asking the cross-reference
 * content the reverse question — *what does this replace* — and that is the single most valuable
 * thing the archive holds (ticket 08). It is the one match that has to say **why** it matched,
 * because a bearing that comes back as "Front wheel bearing" with no mention of `6205` is an
 * answer a member cannot check.
 *
 * The other load-bearing rule is the spacing one. The catalog prints `260 03 150`, the bracket is
 * stamped `26003150`, and a member is not going to guess which the archive was given.
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

interface Match {
  part: { id: string; nameEn: string | null; catalogNumber: string | null };
  matchedEquivalents: { maker: string; reference: string | null }[];
  listings: {
    id: string;
    tavolaId: string;
    tavolaNumber: string;
    nameEn: string;
    model: { brand: string; name: string };
    positionNumber: string | null;
  }[];
}

describe('search', () => {
  let app: TestApp;
  let member: TestAgent;
  let grifoId: string;
  let tavolaId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    member = await app.editor();
    grifoId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
    tavolaId = (await givenTavola(app.db, grifoId, { number: '2', nameEn: 'Front brakes' })).id;
  });

  /** A number on the sheet, recorded the way an Editor's marking tool records one. */
  async function givenPosition(number: string, onTavola = tavolaId): Promise<string> {
    const response = await member
      .post(`/api/tavole/${onTavola}/positions`)
      .send({ number })
      .expect(201);
    const recorded = response.body.positions.find(
      (position: { number: string }) => position.number === number,
    );
    return recorded.id;
  }

  /** A Part, listed once — which is how a Part comes into the archive at all. */
  async function givenPart(
    fields: Partial<Record<string, string>>,
    at: { positionId?: string | null; onTavola?: string } = {},
  ): Promise<string> {
    const response = await member
      .post(`/api/tavole/${at.onTavola ?? tavolaId}/listings`)
      .send({
        positionId: at.positionId ?? null,
        quantityPerCar: null,
        drawn: true,
        part: aPart(fields),
      })
      .expect(201);
    return response.body.listing.part.id;
  }

  async function search(query: string): Promise<{ matches: Match[]; more: boolean }> {
    const response = await member.get('/api/search').query({ q: query }).expect(200);
    return response.body;
  }

  async function found(query: string): Promise<(string | null)[]> {
    return (await search(query)).matches.map((match) => match.part.nameEn);
  }

  describe('the number in somebody’s hand', () => {
    beforeEach(async () => {
      await givenPart({ nameEn: 'Front brake caliper', catalogNumber: '260 03 150' });
    });

    it('finds a Part by the Catalog Number as the catalog prints it', async () => {
      expect(await found('260 03 150')).toEqual(['Front brake caliper']);
    });

    /**
     * **The rule the whole thing turns on.** The catalog prints spaces and the stamping on the
     * part has none; a member holding the bracket types what is on the bracket.
     */
    it('finds it however the query is spaced', async () => {
      expect(await found('26003150')).toEqual(['Front brake caliper']);
      expect(await found('260  03150')).toEqual(['Front brake caliper']);
    });

    it('finds it from the beginning of the number', async () => {
      expect(await found('26003')).toEqual(['Front brake caliper']);
    });

    it('does not find it from the middle of the number', async () => {
      expect(await found('03150')).toEqual([]);
    });
  });

  /**
   * **And the same in reverse**, which is the half that is easy to leave untested: an Editor
   * transcribing from a photocopy types the number closed up, and the member searching for it has
   * the printed catalog in front of them and types it open. Neither of them is wrong, so the
   * spacing has to come out of *both* sides rather than only out of the query.
   */
  it('finds a Part recorded without spaces from a query typed with them', async () => {
    await givenPart({ nameEn: 'Front brake caliper', catalogNumber: '26003150' });

    expect(await found('260 03 150')).toEqual(['Front brake caliper']);
    expect(await found('260 03')).toEqual(['Front brake caliper']);
  });

  it('finds a Part by its Disegno Origine, spacing and all', async () => {
    await givenPart({ nameEn: 'Brake hose', disegnoOrigine: '2087 11' });

    expect(await found('208711')).toEqual(['Brake hose']);
    expect(await found('2087')).toEqual(['Brake hose']);
  });

  /**
   * **The reverse lookup, which is what the cross-reference content is for.** Somebody holding a
   * modern bearing marked `6205` wants to know what it replaces — and the answer has to carry the
   * Equivalent that matched, or the member has been handed a part with no way to check it is the
   * right one.
   */
  describe('the number on a modern part that replaces it', () => {
    let bearingId: string;

    beforeEach(async () => {
      bearingId = await givenPart({ nameEn: 'Front wheel bearing', catalogNumber: '431 02 010' });
      await member
        .post(`/api/parts/${bearingId}/equivalents`)
        .send({ kind: 'industry-standard', maker: 'SKF', reference: '6205 2RS', note: '' })
        .expect(201);
    });

    it('finds the Part an Equivalent reference replaces', async () => {
      expect(await found('6205 2RS')).toEqual(['Front wheel bearing']);
    });

    it('finds it however the reference is spaced, and from its beginning', async () => {
      expect(await found('62052rs')).toEqual(['Front wheel bearing']);
      expect(await found('6205')).toEqual(['Front wheel bearing']);
    });

    it('says which Equivalent matched, so the member can check the answer', async () => {
      const { matches } = await search('6205');

      expect(matches[0]?.matchedEquivalents).toEqual([
        expect.objectContaining({ maker: 'SKF', reference: '6205 2RS' }),
      ]);
    });

    /**
     * A Part found by its own number matched nothing of the sort, and saying otherwise would put
     * a supplier's number beside a result that has nothing to do with it.
     */
    it('names no Equivalent for a Part the query found some other way', async () => {
      const { matches } = await search('431 02 010');

      expect(matches[0]?.matchedEquivalents).toEqual([]);
    });
  });

  describe('what it is called', () => {
    beforeEach(async () => {
      await givenPart({ nameEn: 'Front brake caliper', nameIt: 'PINZA FRENO ANTERIORE' });
    });

    it('finds a Part by the beginning of its English name, whatever the case', async () => {
      expect(await found('front brake')).toEqual(['Front brake caliper']);
    });

    it('finds it by the beginning of its Denominazione', async () => {
      expect(await found('pinza')).toEqual(['Front brake caliper']);
    });

    it('does not find it from the middle of a name', async () => {
      expect(await found('caliper')).toEqual([]);
    });
  });

  /**
   * **Deliberately not searched** (spec, and ticket 22). Notes are prose an Editor wrote and the
   * catalog note is prose the factory wrote; a search over either is a free-text search, which is
   * what "Postgres only, no relevance ranking" rules out. A member typing a word that happens to
   * appear in a note would get a list nothing explains.
   */
  it('searches none of the prose — notes, catalog notes, descriptions or dimensions', async () => {
    await givenPart({
      nameEn: 'Bleed screw',
      note: 'Interchangeable with the Rivolta screw',
      catalogNote: 'Vedi tavola 14',
      description: 'Hexagonal, drilled',
      dimensions: '8 mm across flats',
      materialFinish: 'Cadmium plated',
    });

    expect(await found('Interchangeable')).toEqual([]);
    expect(await found('Vedi')).toEqual([]);
    expect(await found('Hexagonal')).toEqual([]);
    expect(await found('8 mm')).toEqual([]);
    expect(await found('Cadmium')).toEqual([]);
  });

  describe('which one is theirs', () => {
    /**
     * The whole of story 82. The same number turns up on more than one car, and the member is
     * the one who knows which car is in their garage — so every result names the car, the sheet
     * and the number it sits at, and each of those is somewhere to go.
     */
    it('reports the car, the sheet and the number for each place a Part is listed', async () => {
      const rivoltaId = (await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' })).id;
      const rivoltaTavola = (
        await givenTavola(app.db, rivoltaId, { number: '9', nameEn: 'Rear brakes' })
      ).id;

      const partId = await givenPart(
        { nameEn: 'Lock washer', catalogNumber: '999 01 090' },
        {
          positionId: await givenPosition('4'),
        },
      );
      await member
        .post(`/api/tavole/${rivoltaTavola}/listings`)
        .send({ positionId: null, quantityPerCar: 2, drawn: false, partId })
        .expect(201);

      const { matches } = await search('99901090');

      expect(matches[0]?.listings).toEqual([
        {
          id: expect.any(String),
          tavolaId,
          tavolaNumber: '2',
          nameEn: 'Front brakes',
          model: expect.objectContaining({ brand: 'Iso', name: 'Grifo' }),
          positionNumber: '4',
        },
        {
          id: expect.any(String),
          tavolaId: rivoltaTavola,
          tavolaNumber: '9',
          nameEn: 'Rear brakes',
          model: expect.objectContaining({ brand: 'Iso', name: 'Rivolta' }),
          // Listed on the sheet without anybody having decided which number it sits at.
          positionNumber: null,
        },
      ]);
    });

    /** A washer at three numbers on one drawing is three circles to go and look at. */
    it('reports every number a Part sits at on one sheet', async () => {
      const partId = await givenPart(
        { nameEn: 'Lock washer', catalogNumber: '999 01 090' },
        {
          positionId: await givenPosition('4'),
        },
      );
      await member
        .post(`/api/tavole/${tavolaId}/listings`)
        .send({ positionId: await givenPosition('11'), quantityPerCar: 4, drawn: false, partId })
        .expect(201);

      const { matches } = await search('99901090');

      expect(matches[0]?.listings.map((listing) => listing.positionNumber)).toEqual(['4', '11']);
      // Each is a Listing in its own right, so a screen can tell them apart by what they are
      // rather than by a sheet and a number stuck back together.
      expect(new Set(matches[0]?.listings.map((listing) => listing.id)).size).toBe(2);
    });

    /**
     * A Part whose last Listing was removed is on no drawing and still holds its number. It is
     * reported as what it is rather than hidden — an archive that answered "nothing matches" to a
     * number it is still refusing to anybody who types it would be lying twice.
     */
    it('reports a Part listed on no drawing, with nowhere to go', async () => {
      const partId = await givenPart({ nameEn: 'Bleed screw', catalogNumber: '260 03 999' });
      const { body } = await member.get(`/api/parts/${partId}`).expect(200);
      expect(body.listedOn).toHaveLength(1);
      await member
        .delete(
          `/api/listings/${(await member.get(`/api/tavole/${tavolaId}/listings`)).body.listings[0].id}`,
        )
        .expect(204);

      const { matches } = await search('26003999');

      expect(matches).toHaveLength(1);
      expect(matches[0]?.listings).toEqual([]);
    });
  });

  describe('the shape of the answer', () => {
    /**
     * **No relevance ranking** (spec). What decides the order is the archive's own: the number
     * the query names exactly first — at most one Part can hold it, and a member who typed a
     * number typed something they already know — and then the catalog's order. Nothing is scored,
     * weighted or tuned, and the same query twice gives the same list in the same order.
     */
    it('puts the number that was typed in full first, then the catalog’s own order', async () => {
      await givenPart({ nameEn: 'Bolt, long', catalogNumber: '999 01 004' });
      await givenPart({ nameEn: 'Bolt, short', catalogNumber: '999 01' });
      await givenPart({ nameEn: 'Bolt, very long', catalogNumber: '999 01 900' });

      expect(await found('999 01')).toEqual(['Bolt, short', 'Bolt, long', 'Bolt, very long']);
    });

    /**
     * **And it is the same rule for all three numbers.** A member quoting a Disegno Origine out of
     * a letter, or reading the reference off a modern bearing, has typed a number they already
     * know just as surely as one reading a catalog's first column — so where the number came from
     * must not decide how far down the list it lands.
     */
    it('lifts a Disegno Origine or a supplier’s reference typed in full, just the same', async () => {
      await givenPart({ nameEn: 'Bracket, long', catalogNumber: '300 10 004' });
      const bracket = await givenPart({ nameEn: 'Bracket, exact', disegnoOrigine: '300 10' });
      const bearing = await givenPart({ nameEn: 'Bearing, exact', catalogNumber: '431 02 010' });
      await member
        .post(`/api/parts/${bearing}/equivalents`)
        .send({ kind: 'industry-standard', maker: 'SKF', reference: '300 10', note: '' })
        .expect(201);

      const { matches } = await search('30010');

      // Both hold the number in full, so both are above the one that merely begins with it.
      expect(
        matches
          .slice(0, 2)
          .map((match) => match.part.id)
          .sort(),
      ).toEqual([bracket, bearing].sort());
      expect(matches[2]?.part.nameEn).toBe('Bracket, long');
    });

    it('answers nothing at all when nothing matches', async () => {
      await givenPart({ nameEn: 'Front brake caliper', catalogNumber: '260 03 150' });

      expect(await search('nothing like it')).toEqual({ matches: [], more: false });
    });

    /**
     * A capped list must never read as a complete one. A member told "nothing else matches" by an
     * answer that stopped early goes looking for a Part the archive has.
     */
    it('says so when it held matches back', async () => {
      for (let index = 0; index < 55; index += 1) {
        await givenPart({
          nameEn: `Washer ${index}`,
          catalogNumber: `900 ${String(index).padStart(3, '0')}`,
        });
      }

      const { matches, more } = await search('900');

      expect(matches).toHaveLength(50);
      expect(more).toBe(true);
    });

    /** `%` is a character somebody could have typed, not a way to ask for everything. */
    it('treats the wildcards of the database as ordinary characters', async () => {
      await givenPart({ nameEn: 'Front brake caliper', catalogNumber: '260 03 150' });

      expect(await found('%')).toEqual([]);
      expect(await found('_')).toEqual([]);
    });

    it('refuses a query with nothing in it', async () => {
      await member.get('/api/search').query({ q: '   ' }).expect(400);
      await member.get('/api/search').expect(400);
    });
  });

  /**
   * **Nothing without a live Membership** (ticket 22). The archive is members-only in every
   * direction, and a search endpoint outside the gate would be the one address that hands a
   * crawler the catalog a number at a time.
   */
  it('tells a browser that has not been through the gate nothing whatever', async () => {
    await givenPart({ nameEn: 'Front brake caliper', catalogNumber: '260 03 150' });

    const response = await app.request().get('/api/search').query({ q: '26003150' }).expect(401);

    expect(JSON.stringify(response.body)).not.toContain('caliper');
  });
});
