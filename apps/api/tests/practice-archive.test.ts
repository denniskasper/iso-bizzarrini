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
