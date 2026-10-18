import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CatalogRun,
  CatalogRunResponse,
  ReadAgainFromResponse,
  TavolaResponse,
} from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contributions, positions, tavole, type ModelRow } from '../src/db/schema.js';
import { aRow, aTable, aTableSheet, type InventedPage } from './support/catalog-reading.js';
import { configured, estimated, heldReadingMethod, settled, start } from './support/catalog-run.js';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Reading one Unchecked Tavola again** (issue #61), without reading the catalog again.
 *
 * The catalog is two Table sheets, page 1 of Tavola 1 and page 2 of Tavola 2, and every request
 * costs $0.04 (`support/catalog-reading.ts`). Read again, a Tavola's pages are already known, so
 * only its sheet is read, twice: $0.08.
 */
function catalog(): InventedPage[] {
  return [
    aTableSheet(
      '1',
      [aTable([aRow('1', '41.01.001', 'COPERCHIO'), aRow('2', '41.01.002', 'GUARNIZIONE')])],
      { titleIt: 'COPERCHIO MOTORE' },
    ),
    aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
  ];
}

describe('reading one Unchecked Tavola again', () => {
  let app: TestApp;
  let pages: InventedPage[];
  let method: ReturnType<typeof heldReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    pages = catalog();
    method = heldReadingMethod(pages);
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    pages.splice(0, pages.length, ...catalog());
    method.calls.length = 0;
    administrator = (await givenAnAdministrator(app)).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta', series: 'GT' });
  });

  /** A finished run of the whole catalog, and the Unchecked Tavola 1 it read. */
  async function readTavolaOne(): Promise<{ run: CatalogRun; tavolaId: string }> {
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);
    const finished = await settled(administrator, run);
    const tavolaId = finished.tavole.find((tavola) => tavola.number === '1')?.tavolaId;
    if (!tavolaId) {
      throw new Error('Tavola 1 was not loaded.');
    }
    method.calls.length = 0;
    return { run: finished, tavolaId };
  }

  function readAgain(agent: TestAgent, tavolaId: string) {
    return agent.post('/api/catalog-runs/read-again').send({ tavolaId });
  }

  function readAgainFrom(agent: TestAgent, tavolaId: string) {
    return agent.get('/api/catalog-runs/read-again').query({ tavolaId });
  }

  async function filesUnder(prefix: string): Promise<string[]> {
    return readdir(join(app.filesPath, prefix)).catch(() => []);
  }

  it('says which run a Tavola came from, to an Administrator', async () => {
    const { run, tavolaId } = await readTavolaOne();

    const response = await readAgainFrom(administrator, tavolaId).expect(200);

    expect(response.body as ReadAgainFromResponse).toEqual({ runId: run.id });
  });

  it('estimates only that Tavola’s sheets, and asks nothing yet', async () => {
    const { run, tavolaId } = await readTavolaOne();

    const response = await readAgain(administrator, tavolaId).expect(201);

    const again = (response.body as CatalogRunResponse).run;
    expect(again.id).not.toBe(run.id);
    expect(again).toMatchObject({
      state: 'estimated',
      estimate: 0.08,
      readsAgain: { tavola: '1', pages: [1] },
      model: { id: model.id },
    });
    expect(method.calls).toEqual([]);
  });

  it('replaces the Tavola whole, and the old Listings and files are gone', async () => {
    const { tavolaId } = await readTavolaOne();
    const before = (await administrator.get(`/api/tavole/${tavolaId}`).expect(200))
      .body as TavolaResponse;
    expect(before.positions.map((position) => position.number)).toEqual(['1', '2']);
    const sheetsBefore = await filesUnder('table-sheets');

    // Read better this time: one row, where the first reading found two.
    pages[0] = aTableSheet('1', [aTable([aRow('1', '41.01.009', 'COPERCHIO NUOVO')])], {
      titleIt: 'COPERCHIO MOTORE',
    });
    const again = (
      (await readAgain(administrator, tavolaId).expect(201)).body as CatalogRunResponse
    ).run;
    await start(administrator, again, { limit: 1 }).expect(202);
    const finished = await settled(administrator, again);

    expect(method.calls).toEqual(['read 1 1', 'read 1 2']);
    expect(finished).toMatchObject({ state: 'finished', spent: 0.08 });
    expect(finished.tavole).toEqual([
      expect.objectContaining({ number: '1', finished: true, cost: 0.08, refused: null }),
    ]);
    const replacedId = finished.tavole[0]?.tavolaId;
    expect(replacedId).toBeTruthy();
    expect(replacedId).not.toBe(tavolaId);

    await administrator.get(`/api/tavole/${tavolaId}`).expect(404);
    const replaced = (await administrator.get(`/api/tavole/${replacedId}`).expect(200))
      .body as TavolaResponse;
    expect(replaced.tavola).toMatchObject({ number: '1', state: 'unchecked' });
    expect(replaced.positions.map((position) => position.number)).toEqual(['1']);
    const checking = await administrator.get(`/api/tavole/${replacedId}/checking`).expect(200);
    expect(checking.body.readingMethod).toBe(method.name);
    expect(
      checking.body.listings.map(
        (listing: { part: { catalogNumber: string } }) => listing.part.catalogNumber,
      ),
    ).toEqual(['41.01.009']);

    // Its old Table sheet went with it, and the new one took its place.
    const sheetsAfter = await filesUnder('table-sheets');
    expect(sheetsAfter).toHaveLength(sheetsBefore.length);
    expect(sheetsAfter).not.toEqual(sheetsBefore);

    // Tavola 2 was not touched.
    const [two] = await app.db.select().from(tavole).where(eq(tavole.number, '2'));
    expect(two?.state).toBe('unchecked');
  });

  it('is refused for a Published Tavola, and says why', async () => {
    const { tavolaId } = await readTavolaOne();
    await app.db.update(tavole).set({ state: 'published' }).where(eq(tavole.id, tavolaId));

    const response = await readAgain(administrator, tavolaId).expect(409);

    expect(response.body.error.message).toMatch(/Published/);
    expect(method.calls).toEqual([]);
  });

  it('is refused for a Tavola with Contributions on its Positions, and says why', async () => {
    const { tavolaId } = await readTavolaOne();
    const [position] = await app.db
      .select()
      .from(positions)
      .where(eq(positions.tavolaId, tavolaId));
    await app.db
      .insert(contributions)
      .values({ positionId: position?.id, body: 'Mine has a brass one.', writtenAt: new Date() });

    const response = await readAgain(administrator, tavolaId).expect(409);

    expect(response.body.error.message).toMatch(/Contributions/);
  });

  it('is refused at the start too, where it was Published after it was estimated', async () => {
    const { tavolaId } = await readTavolaOne();
    const again = (
      (await readAgain(administrator, tavolaId).expect(201)).body as CatalogRunResponse
    ).run;
    await app.db.update(tavole).set({ state: 'published' }).where(eq(tavole.id, tavolaId));

    const response = await start(administrator, again, { limit: 1 }).expect(409);

    expect(response.body.error.message).toMatch(/Published/);
    expect(method.calls).toEqual([]);
  });

  it('is refused while another run is running', async () => {
    const { tavolaId } = await readTavolaOne();
    const other = await estimated(administrator, model);
    const hold = method.holdAt('read 1 1');
    await start(administrator, other, { limit: 1 }).expect(202);
    await hold.reached;

    const response = await readAgain(administrator, tavolaId).expect(409);
    expect(response.body.error.message).toMatch(/one at a time/i);

    hold.release();
    await settled(administrator, other);
  });

  it('is refused for a Tavola no Catalog run read', async () => {
    const loaded = await givenTavola(app.db, model.id, { number: '7', state: 'unchecked' });

    await readAgainFrom(administrator, loaded.id).expect(200, { runId: null });
    const response = await readAgain(administrator, loaded.id).expect(409);
    expect(response.body.error.message).toMatch(/Catalog run/);
  });

  it('is not there for an Editor or a Member', async () => {
    const { tavolaId } = await readTavolaOne();
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await readAgain(agent, tavolaId).expect(404);
      await readAgainFrom(agent, tavolaId).expect(404);
    }
    expect(method.calls).toEqual([]);
  });
});
