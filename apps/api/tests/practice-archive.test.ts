import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  emptyCatalog,
  seedPracticeArchiveIfEmpty,
  writePracticeArchive,
} from '../src/catalog/practice-archive.js';
import { createFileStore } from '../src/storage/file-store.js';
import { givenModel } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * What a preview deployment does to itself when it starts.
 *
 * The load-bearing rule is the second test: an Editor fills a preview in through the screens
 * to show somebody, and a redeployment that quietly emptied it would take that work away.
 */
describe('a practice system writing itself a catalog', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
  });

  function dependencies() {
    return {
      db: app.db,
      fileStore: createFileStore(app.filesPath),
      clock: app.clock,
      logger: app.logger,
      config: app.config,
    };
  }

  function seed() {
    return seedPracticeArchiveIfEmpty(dependencies());
  }

  it('writes an invented catalog into an archive with nothing in it', async () => {
    const written = await seed();

    expect(written).toMatchObject({
      models: 3,
      tavole: 4,
      drawings: 3,
      positions: 15,
      parts: 6,
      listings: 8,
      subAssemblies: 1,
      relatedPositions: 1,
      fitments: 5,
      equivalents: 4,
      sources: 4,
    });

    const member = await app.editor();
    const response = await member.get('/api/models').expect(200);
    expect(response.body.models).toHaveLength(3);
  });

  // The reason this is safe to run on every boot.
  it('leaves an archive that already has something in it entirely alone', async () => {
    await givenModel(app.db, { brand: 'Iso', name: 'A car an Editor recorded' });

    expect(await seed()).toBeNull();

    const member = await app.editor();
    const response = await member.get('/api/models').expect(200);
    expect(response.body.models).toHaveLength(1);
    expect(response.body.models[0]).toMatchObject({ name: 'A car an Editor recorded' });
  });

  it('draws its own Tavole, so a preview has something to open', async () => {
    await seed();
    const member = await app.editor();

    const models = await member.get('/api/models').expect(200);
    const grifo = models.body.models.find((model: { name: string }) => model.name === 'Grifo');
    const read = await member.get(`/api/models/${grifo.id}`).expect(200);

    const drawn = read.body.tavole.filter((tavola: { scan: unknown }) => tavola.scan !== null);
    expect(drawn).toHaveLength(2);

    // A Tavola recorded from a paper catalog before anybody scanned the sheet: a legitimate
    // state, and one a practice archive should show.
    expect(read.body.tavole).toHaveLength(3);

    await member.get(drawn[0].scan.displayUrl).expect(200);
  });

  // A drawing with no circles on it is a picture, and the product is a drawing you can click.
  it('marks up what it draws, including one Position the drawing does not show', async () => {
    await seed();
    const member = await app.editor();

    const models = await member.get('/api/models').expect(200);
    const grifo = models.body.models.find((model: { name: string }) => model.name === 'Grifo');
    const listed = await member.get(`/api/models/${grifo.id}`).expect(200);
    const drawn = listed.body.tavole.find((tavola: { scan: unknown }) => tavola.scan !== null);

    const read = await member.get(`/api/tavole/${drawn.id}`).expect(200);
    const numbers = read.body.positions.map((position: { number: string }) => position.number);
    expect(numbers).toEqual(['1', '2', '3', '4', '5']);

    // Every circle the sheet prints is clickable, and the one it does not print is listed
    // without pretending to be anywhere.
    const marked = read.body.positions.filter(
      (position: { marks: unknown[] }) => position.marks.length > 0,
    );
    expect(marked).toHaveLength(4);
    expect(marked[0].marks[0]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });

    // And one number printed in two places, because the factory printed a number wherever the
    // part is used — a screen that takes a member to each in turn (story 48) needs one to show.
    const twice = read.body.positions.find(
      (position: { number: string }) => position.number === '2',
    );
    expect(twice.marks).toHaveLength(2);
  });

  /**
   * A practice archive whose Parts are all complete and all alike proves nothing. The one
   * distinction a member cannot afford to misread — an alternative against an addition — has to
   * be visible on it, and so does a Part the factory never gave a number to.
   */
  it('lists a Position with alternatives, fixings, and a Part carrying no number', async () => {
    await seed();
    const member = await app.editor();

    const models = await member.get('/api/models').expect(200);
    const grifo = models.body.models.find((model: { name: string }) => model.name === 'Grifo');
    const listed = await member.get(`/api/models/${grifo.id}`).expect(200);
    const brakes = listed.body.tavole.find((tavola: { number: string }) => tavola.number === '2');
    const sheet = await member.get(`/api/tavole/${brakes.id}`).expect(200);

    const at = async (number: string) => {
      const position = sheet.body.positions.find(
        (candidate: { number: string }) => candidate.number === number,
      );
      const read = await member.get(`/api/positions/${position.id}/listings`).expect(200);
      return read.body.listings;
    };

    const first = await at('1');
    expect(first.filter((listing: { drawn: boolean }) => listing.drawn)).toHaveLength(2);
    expect(first.filter((listing: { drawn: boolean }) => !listing.drawn)).toHaveLength(2);

    // The bolt is the same Part on two sheets, in two quantities — which is the whole reason a
    // quantity belongs to a Listing rather than to a Part.
    const bolt = first.find(
      (listing: { part: { nameEn: string } }) => listing.part.nameEn === 'Caliper mounting bolt',
    );
    expect(bolt.quantityPerCar).toBe(4);
    expect(bolt.elsewhere).toEqual([
      expect.objectContaining({ tavolaNumber: '10', quantityPerCar: 6 }),
    ]);

    const [bleedScrew] = await at('3');
    expect(bleedScrew.part.catalogNumber).toBeNull();

    // And one number with nothing at it, because that is an ordinary state too.
    expect(await at('4')).toEqual([]);
  });

  /**
   * The content that turns a catalog into something a restorer can use — and, like the Parts
   * above, **chosen to be every state a screen has to handle**: a chassis break in somebody's own
   * words, a donor vehicle with no number anybody has ever found, and a shop seen twice at two
   * prices so that the reading is a price history rather than a figure.
   */
  it('records what fits its Parts, what replaces them and where they have been for sale', async () => {
    await seed();
    const member = await app.editor();

    const models = await member.get('/api/models').expect(200);
    const grifo = models.body.models.find((model: { name: string }) => model.name === 'Grifo');
    const listed = await member.get(`/api/models/${grifo.id}`).expect(200);
    const brakes = listed.body.tavole.find((tavola: { number: string }) => tavola.number === '2');
    const sheet = await member.get(`/api/tavole/${brakes.id}`).expect(200);

    // Position 2 on the practice sheet is the flexible brake hose.
    const hosePosition = sheet.body.positions.find(
      (candidate: { number: string }) => candidate.number === '2',
    );
    const read = await member.get(`/api/positions/${hosePosition.id}/listings`).expect(200);
    const { part } = read.body.listings[0];

    // Two cars, one of them qualified in the words somebody would use.
    expect(
      part.fitments.map((fitment: { model: { name: string }; qualifier: string | null }) => [
        fitment.model.name,
        fitment.qualifier,
      ]),
    ).toEqual([
      ['Grifo', null],
      ['Rivolta IR 300', 'late cars only'],
    ]);

    // The original supplier first, then the car to go and find one in — with no number, which is
    // the ordinary state for a donor vehicle and the reason that column is nullable.
    expect(part.equivalents).toEqual([
      expect.objectContaining({ kind: 'oe-supplier', maker: 'Girling', reference: '64678231' }),
      expect.objectContaining({ kind: 'donor-vehicle', maker: 'Fiat 124 Coupé', reference: null }),
    ]);

    // The same shop twice, most recently seen first, and every price carrying its date.
    expect(
      part.sources.map((source: { price: { amount: number; observedOn: string } }) => [
        source.price.amount,
        source.price.observedOn,
      ]),
    ).toEqual([
      [24500, '2025-11-02'],
      [19000, '2024-03-18'],
    ]);

    // And a picture of it, reachable and actually there — a seeded row pointing at a file that
    // was never written would look right in every response and show nothing on any screen.
    expect(part.photographs).toHaveLength(1);
    await member.get(part.photographs[0].previewUrl).expect(200);
  });

  /**
   * **Several photographs on one Part**, which is the only thing that can demonstrate an order —
   * and Parts with none, because a screen that says nothing where there is nothing to show is a
   * claim a practice archive has to be able to be judged on too.
   */
  it('photographs some of its Parts, one of them more than once', async () => {
    await seed();
    const member = await app.editor();

    const models = await member.get('/api/models').expect(200);
    const grifo = models.body.models.find((model: { name: string }) => model.name === 'Grifo');
    const listed = await member.get(`/api/models/${grifo.id}`).expect(200);
    const brakes = listed.body.tavole.find((tavola: { number: string }) => tavola.number === '2');
    const sheet = await member.get(`/api/tavole/${brakes.id}`).expect(200);

    // Position 1 carries the two calipers and the two fixings.
    const caliperPosition = sheet.body.positions.find(
      (candidate: { number: string }) => candidate.number === '1',
    );
    const read = await member.get(`/api/positions/${caliperPosition.id}/listings`).expect(200);

    interface SeededListing {
      part: { nameEn: string; photographs: { previewUrl: string }[] };
    }
    const photographsOf = (nameEn: string) => {
      const found = read.body.listings.find(
        (listing: SeededListing) => listing.part.nameEn === nameEn,
      );
      if (!found) {
        throw new Error(`The practice Position 1 has no ${nameEn}.`);
      }
      return found.part.photographs as { previewUrl: string }[];
    };

    expect(photographsOf('Front brake caliper, early')).toHaveLength(2);
    expect(photographsOf('Caliper mounting bolt')).toEqual([]);
  });

  /**
   * What belongs *with* a number, in both of the shapes it comes in — so that the two screens
   * showing them have a seeded sheet to be built and judged against.
   *
   * The sheet has to demonstrate the absence as well: `2` is in no group, and a number in no
   * group shows nothing rather than falling back to every other number on the drawing.
   */
  it('groups some of its numbers, and links two of them', async () => {
    await seed();
    const member = await app.editor();

    const models = await member.get('/api/models').expect(200);
    const grifo = models.body.models.find((model: { name: string }) => model.name === 'Grifo');
    const listed = await member.get(`/api/models/${grifo.id}`).expect(200);
    const brakes = listed.body.tavole.find((tavola: { number: string }) => tavola.number === '2');
    const sheet = await member.get(`/api/tavole/${brakes.id}`).expect(200);

    interface SeededPosition {
      id: string;
      number: string;
      subAssemblyId: string | null;
      related: { positionId: string }[];
    }
    const positions: SeededPosition[] = sheet.body.positions;
    const numbered = (number: string) => {
      const found = positions.find((position) => position.number === number);
      if (!found) {
        throw new Error(`The practice sheet has no number ${number}.`);
      }
      return found;
    };

    expect(sheet.body.subAssemblies).toEqual([
      { id: expect.any(String), name: 'Front caliper assembly' },
    ]);
    const group = sheet.body.subAssemblies[0].id;
    expect(
      positions.filter((position) => position.subAssemblyId === group).map((one) => one.number),
    ).toEqual(['1', '3', '5']);
    expect(numbered('2').subAssemblyId).toBeNull();

    // One row, read from both ends: the hose runs to the caliper, recorded once.
    expect(numbered('1').related).toEqual([
      { id: expect.any(String), positionId: numbered('2').id },
    ]);
    expect(numbered('2').related).toEqual([
      { id: expect.any(String), positionId: numbered('1').id },
    ]);
  });

  /**
   * `pnpm db:seed` on a laptop, twice — which is what a developer actually does, and what the
   * end-to-end suite does on every run.
   *
   * It is a test rather than an assumption because emptying the catalog is **not** one cascade.
   * A Part has no column pointing at a Model (ADR 0001), so truncating the Models leaves every
   * Part standing and the second run collides on the first Catalog Number it writes. That is
   * exactly what happened, and it was the whole suite that said so.
   */
  it('empties and rewrites itself, so seeding twice is not a collision', async () => {
    await writePracticeArchive(dependencies());
    await emptyCatalog(app.db, createFileStore(app.filesPath));

    const again = await writePracticeArchive(dependencies());
    expect(again).toMatchObject({ models: 3, parts: 6, listings: 8 });

    const member = await app.editor();
    const models = await member.get('/api/models').expect(200);
    expect(models.body.models).toHaveLength(3);
  });
});
