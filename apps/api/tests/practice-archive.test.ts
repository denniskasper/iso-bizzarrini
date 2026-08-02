import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPracticeArchiveIfEmpty } from '../src/catalog/practice-archive.js';
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

  function seed() {
    return seedPracticeArchiveIfEmpty({
      db: app.db,
      fileStore: createFileStore(app.filesPath),
      clock: app.clock,
      logger: app.logger,
      config: app.config,
    });
  }

  it('writes an invented catalog into an archive with nothing in it', async () => {
    const written = await seed();

    expect(written).toMatchObject({ models: 3, tavole: 4, drawings: 3 });

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
});
