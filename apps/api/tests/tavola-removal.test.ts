import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  CatalogModelResponse,
  CatalogRun,
  CatalogRunResponse,
  CatalogRunsResponse,
  RemovedTavolaResponse,
  SearchResponse,
  TavolaRemoval,
  TavolaRemovalResponse,
  TavolaCheckingResponse,
  TavolaResponse,
} from '@ricambi/contracts';
import { eq, inArray } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contributions,
  listings,
  marks,
  photographs,
  positions,
  readingDoubts,
  subAssemblies,
  tavole,
  type ModelRow,
} from '../src/db/schema.js';
import { loadReading } from '../src/migration/load-reading.js';
import { readCatalog } from '../src/reading/read-catalog.js';
import { createFileStore } from '../src/storage/file-store.js';
import {
  aDrawing,
  aRow,
  aTable,
  aTableSheet,
  fakePages,
  fakeReadingMethod,
  givenOutputDirectory,
  type InventedPage,
  type OutputDirectory,
} from './support/catalog-reading.js';
import {
  carryOn,
  configured,
  estimateSettled,
  estimated,
  heldReadingMethod,
  settled,
  start,
} from './support/catalog-run.js';
import { fixturePdf } from './support/fixture-pdf.js';
import { givenModel, givenPhotographImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **An Administrator removes an Unchecked Tavola** (issue #83), by the rule reading it again
 * replaces one by (`catalog/discard-tavola.ts`).
 *
 * Two Tavole of one Model, read with a fake Reading method and loaded as `archive:load` loads
 * them, so no Catalog run is behind them: 84, a drawing and a Table sheet, and 85, a Table sheet.
 * The screw 208900 is listed on both.
 */
const READ: InventedPage[] = [
  aDrawing('84', { titleIt: 'ASSALE POSTERIORE' }),
  aTableSheet('84', [
    aTable([aRow('1', '208501', 'SCATOLA DIFFERENZIALE'), aRow('2', '208900', 'VITE')]),
    // The second Reading disagrees on the first quantity, which leaves a doubt.
    aTable([
      aRow('1', '208501', 'SCATOLA DIFFERENZIALE', { quantity: '2' }),
      aRow('2', '208900', 'VITE'),
    ]),
  ]),
  aTableSheet('85', [aTable([aRow('1', '208900', 'VITE')])], { titleIt: 'VITERIA' }),
];

describe('removing an Unchecked Tavola', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  const opened: OutputDirectory[] = [];

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
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  /** Tavole 84 and 85 loaded Unchecked, with no Catalog run, and the Model they are on. */
  async function givenLoaded(): Promise<{ modelId: string; tavola: (n: string) => string }> {
    const out = await givenOutputDirectory();
    opened.push(out);
    await readCatalog({
      pdf: 'catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method: fakeReadingMethod(READ),
      pages: fakePages(READ),
      limit: 100,
      print: () => undefined,
    });
    const report = await loadReading({
      db: app.db,
      fileStore: createFileStore(app.filesPath),
      clock: app.clock,
      logger: app.logger,
      source: out.path,
      dryRun: false,
    });
    expect(report.rejected).toEqual([]);
    const rows = await app.db.select().from(tavole);
    const modelId = rows[0]?.modelId as string;
    return {
      modelId,
      tavola: (number) => rows.find((row) => row.number === number)?.id as string,
    };
  }

  function remove(agent: TestAgent, tavolaId: string) {
    return agent.delete(`/api/tavole/${tavolaId}`);
  }

  async function whatRemovalTakes(tavolaId: string): Promise<TavolaRemoval> {
    return (
      (await administrator.get(`/api/tavole/${tavolaId}/removal`).expect(200))
        .body as TavolaRemovalResponse
    ).removal;
  }

  async function filesUnder(prefix: string): Promise<number> {
    return (await readdir(join(app.filesPath, prefix)).catch(() => [])).length;
  }

  async function search(q: string): Promise<SearchResponse> {
    return (await editor.get('/api/search').query({ q }).expect(200)).body;
  }

  /** The Model's Tavole, which its Left to check is the Unchecked ones of. */
  async function onModel(modelId: string): Promise<CatalogModelResponse['tavole']> {
    return ((await editor.get(`/api/models/${modelId}`).expect(200)).body as CatalogModelResponse)
      .tavole;
  }

  async function leftToCheck(modelId: string): Promise<string[]> {
    return (await onModel(modelId))
      .filter((tavola) => tavola.state === 'unchecked')
      .map((tavola) => tavola.number);
  }

  async function partNumbered(catalogNumber: string): Promise<string> {
    const [match] = (await search(catalogNumber)).matches;
    return match?.part.id as string;
  }

  it('takes it away whole, its files with it, and answers with its Model', async () => {
    const { modelId, tavola } = await givenLoaded();
    const removed = tavola('84');
    const checking = (await editor.get(`/api/tavole/${removed}/checking`).expect(200))
      .body as TavolaCheckingResponse;
    expect(checking.doubts.length).toBeGreaterThan(0);
    const scans = await filesUnder('scans');
    const sheets = await filesUnder('table-sheets');
    expect(await leftToCheck(modelId)).toEqual(['84', '85']);

    const response = await remove(administrator, removed).expect(200);

    expect(response.body as RemovedTavolaResponse).toEqual({ modelId });
    await editor.get(`/api/tavole/${removed}`).expect(404);
    expect((await onModel(modelId)).map((one) => one.number)).toEqual(['85']);
    expect(await leftToCheck(modelId)).toEqual(['85']);
    // Its Scan and its one Table sheet; Tavola 85's sheet stays.
    expect(await filesUnder('scans')).toBe(scans - 1);
    expect(await filesUnder('table-sheets')).toBe(sheets - 1);
    for (const table of [positions, listings, readingDoubts]) {
      expect(await app.db.select().from(table).where(eq(table.tavolaId, removed))).toEqual([]);
    }
  });

  it('takes the Parts listed only on it, Photographs and all, and keeps the others', async () => {
    const { tavola } = await givenLoaded();
    await editor
      .post(`/api/parts/${await partNumbered('208501')}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(201);
    const photographs = await filesUnder('photographs');
    const otherBefore = (await editor.get(`/api/tavole/${tavola('85')}/listings`).expect(200))
      .body as unknown;

    await remove(administrator, tavola('84')).expect(200);

    expect((await search('208501')).matches).toEqual([]);
    expect(await filesUnder('photographs')).toBe(photographs - 1);
    const [screw] = (await search('208900')).matches;
    expect(screw?.part.nameIt).toBe('VITE');
    await editor
      .get(`/api/tavole/${tavola('85')}/listings`)
      .expect(200)
      .expect((response) => expect(response.body).toEqual(otherBefore));
    const other = (await editor.get(`/api/tavole/${tavola('85')}`).expect(200))
      .body as TavolaResponse;
    expect(other.tavola).toMatchObject({ number: '85', state: 'unchecked' });
  });

  it('takes its Sub-assemblies’ Photographs, files and all', async () => {
    const { tavola } = await givenLoaded();
    const [group] = await app.db
      .insert(subAssemblies)
      .values({ tavolaId: tavola('84'), name: 'Differential' })
      .returning();
    // Uploaded to the screw, which stays, then handed to the Sub-assembly: nothing lets an Editor
    // photograph a Sub-assembly yet, and this is the row and the files that would make.
    const uploaded = await editor
      .post(`/api/parts/${await partNumbered('208900')}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(201);
    const photographId = uploaded.body.part.photographs[0].id as string;
    await app.db
      .update(photographs)
      .set({ partId: null, subAssemblyId: group?.id })
      .where(eq(photographs.id, photographId));
    const stored = await filesUnder('photographs');

    await remove(administrator, tavola('84')).expect(200);

    expect(await app.db.select().from(photographs).where(eq(photographs.id, photographId))).toEqual(
      [],
    );
    expect(await filesUnder('photographs')).toBe(stored - 1);
  });

  it('keeps a Part listed only on it that carries a Contribution', async () => {
    const { tavola } = await givenLoaded();
    const partId = await partNumbered('208501');
    await app.db
      .insert(contributions)
      .values({ partId, body: 'Mine is cast, not pressed.', writtenAt: new Date() });

    await remove(administrator, tavola('84')).expect(200);

    await editor.get(`/api/parts/${partId}`).expect(200);
  });

  it('is refused for a Published Tavola, and says why', async () => {
    const { tavola } = await givenLoaded();
    await editor.post(`/api/tavole/${tavola('85')}/publication`).expect(200);

    const response = await remove(administrator, tavola('85')).expect(409);

    expect(response.body.error.message).toMatch(/Published/);
    await editor.get(`/api/tavole/${tavola('85')}`).expect(200);
  });

  it('is refused for a Tavola with a Contribution on its Positions, decided or not', async () => {
    const { tavola } = await givenLoaded();
    const scans = await filesUnder('scans');
    const [position] = await app.db
      .select()
      .from(positions)
      .where(eq(positions.tavolaId, tavola('84')));
    await app.db.insert(contributions).values({
      positionId: position?.id,
      body: 'Mine has a brass one.',
      writtenAt: new Date(),
      state: 'discarded',
    });

    const response = await remove(administrator, tavola('84')).expect(409);

    expect(response.body.error.message).toMatch(/Contributions/);
    await editor.get(`/api/tavole/${tavola('84')}`).expect(200);
    expect(await filesUnder('scans')).toBe(scans);
  });

  it('is not there for an Editor or a Member', async () => {
    const { tavola } = await givenLoaded();
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    await editor.post(`/api/tavole/${tavola('85')}/publication`).expect(200);

    for (const agent of [editor, member]) {
      await remove(agent, tavola('84')).expect(404);
      await remove(agent, tavola('85')).expect(404);
    }
    await editor.get(`/api/tavole/${tavola('84')}`).expect(200);
  });

  it('says what removing it would take, which is what the removal then takes', async () => {
    const { tavola } = await givenLoaded();
    const removing = tavola('84');
    const onIt = await app.db.select().from(positions).where(eq(positions.tavolaId, removing));
    const marked = await app.db
      .select()
      .from(marks)
      .where(
        inArray(
          marks.positionId,
          onIt.map((position) => position.id),
        ),
      );
    const listed = await app.db.select().from(listings).where(eq(listings.tavolaId, removing));

    const removal = await whatRemovalTakes(removing);

    expect(removal).toMatchObject({
      positions: onIt.length,
      marks: marked.length,
      listings: listed.length,
      tableSheets: 1,
      scan: true,
      // The screw is listed on 85 as well, and stays.
      parts: [
        {
          id: await partNumbered('208501'),
          catalogNumber: '208501',
          nameIt: 'SCATOLA DIFFERENZIALE',
        },
      ],
    });
    expect(removal.parts).toHaveLength(1);
    expect(removal.positions).toBeGreaterThan(0);
    expect(removal.listings).toBe(2);

    await remove(administrator, removing).expect(200);

    expect((await search('208501')).matches).toEqual([]);
    expect((await search('208900')).matches).toHaveLength(1);
  });

  it('changes nothing by saying what removing it would take', async () => {
    const { modelId, tavola } = await givenLoaded();
    const scans = await filesUnder('scans');

    await whatRemovalTakes(tavola('84'));

    expect(await leftToCheck(modelId)).toEqual(['84', '85']);
    expect(await filesUnder('scans')).toBe(scans);
    expect((await search('208501')).matches).toHaveLength(1);
    expect(await whatRemovalTakes(tavola('84'))).toMatchObject({ listings: 2 });
  });

  it('says why removing it would be refused, instead of what it would take', async () => {
    const { tavola } = await givenLoaded();
    await editor.post(`/api/tavole/${tavola('85')}/publication`).expect(200);
    const [position] = await app.db
      .select()
      .from(positions)
      .where(eq(positions.tavolaId, tavola('84')));
    await app.db.insert(contributions).values({
      positionId: position?.id,
      body: 'Mine has a brass one.',
      writtenAt: new Date(),
    });

    const published = await administrator.get(`/api/tavole/${tavola('85')}/removal`).expect(409);
    expect(published.body.error.message).toMatch(/Published/);
    const contributed = await administrator.get(`/api/tavole/${tavola('84')}/removal`).expect(409);
    expect(contributed.body.error.message).toMatch(/Contributions/);
  });

  it('does not say what removing it would take to an Editor or a Member', async () => {
    const { tavola } = await givenLoaded();
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await agent.get(`/api/tavole/${tavola('84')}/removal`).expect(404);
    }
  });

  it('writes its removal to the log, as no Catalog run read it', async () => {
    const { modelId, tavola } = await givenLoaded();
    const { account } = (await administrator.get('/api/session').expect(200)).body as {
      account: { id: string };
    };
    const info = vi.spyOn(app.logger, 'info');

    try {
      await remove(administrator, tavola('84')).expect(200);

      expect(info).toHaveBeenCalledWith(
        { by: account.id, modelId, tavola: '84' },
        'An Administrator removed a Tavola no Catalog run read',
      );
    } finally {
      info.mockRestore();
    }
  });

  it('is a 404 for a Tavola that is not there', async () => {
    const { tavola } = await givenLoaded();
    await remove(administrator, tavola('84')).expect(200);

    await remove(administrator, tavola('84')).expect(404);
  });
});

/**
 * Removing a Tavola a Catalog run read, and while one is reading. The catalog is two Table
 * sheets, page 1 of Tavola 1 and page 2 of Tavola 2 (`support/catalog-reading.ts`).
 */
describe('removing a Tavola a Catalog run read', () => {
  let app: TestApp;
  let pages: InventedPage[];
  let method: ReturnType<typeof heldReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  function catalog(): InventedPage[] {
    return [
      aTableSheet('1', [aTable([aRow('1', '41.01.001', 'COPERCHIO')])], { titleIt: 'COPERCHIO' }),
      aTableSheet('2', [aTable([aRow('1', '41.02.001', 'VITE')])], { titleIt: 'VITERIA' }),
    ];
  }

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
    administrator = (await givenAnAdministrator(app, { name: 'Ada Admin' })).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta', series: 'GT' });
    method.calls.length = 0;
  });

  async function current(run: CatalogRun): Promise<CatalogRun> {
    return (
      (await administrator.get(`/api/catalog-runs/${run.id}`).expect(200))
        .body as CatalogRunResponse
    ).run;
  }

  async function readBoth(): Promise<{ run: CatalogRun; tavolaId: string }> {
    const run = await estimated(administrator, model);
    await start(administrator, run, { limit: 1 }).expect(202);
    const finished = await settled(administrator, run);
    const tavolaId = finished.tavole.find((tavola) => tavola.number === '1')?.tavolaId;
    if (!tavolaId) {
      throw new Error('Tavola 1 was not loaded.');
    }
    return { run: finished, tavolaId };
  }

  it('removes it, and the Model keeps the other', async () => {
    const { tavolaId } = await readBoth();

    await administrator.delete(`/api/tavole/${tavolaId}`).expect(200, { modelId: model.id });

    await administrator.get(`/api/tavole/${tavolaId}`).expect(404);
    const { tavole: onModel } = (await administrator.get(`/api/models/${model.id}`).expect(200))
      .body as { tavole: { number: string }[] };
    expect(onModel.map((one) => one.number)).toEqual(['2']);
  });

  it('keeps the run’s cost and record, and its line and Who did what say it was removed', async () => {
    const { run, tavolaId } = await readBoth();
    app.clock.setTo(new Date('2026-01-16T10:00:00.000Z'));

    await administrator.delete(`/api/tavole/${tavolaId}`).expect(200);

    const after = await current(run);
    const by = { id: expect.any(String), name: 'Ada Admin' };
    expect(after).toMatchObject({
      state: run.state,
      spent: run.spent,
      estimate: run.estimate,
      limit: run.limit,
      costs: run.costs,
    });
    expect(after.tavole).toEqual([
      {
        ...run.tavole[0],
        tavolaId: null,
        removed: { by, at: '2026-01-16T10:00:00.000Z' },
      },
      run.tavole[1],
    ]);
    expect(run.tavole[1]?.removed).toBeNull();
    expect(after.actions).toEqual([
      ...run.actions,
      { action: 'removed', by, at: '2026-01-16T10:00:00.000Z', limit: null, tavola: '1' },
    ]);
    expect(run.actions[0]?.tavola).toBeNull();
  });

  it('says on the earlier run that a later one replaced its Tavola, and counts removals per run', async () => {
    app.clock.setTo(new Date('2026-01-16T09:00:00.000Z'));
    const first = await readBoth();
    app.clock.setTo(new Date('2026-01-16T09:30:00.000Z'));
    const second = await readBoth();
    await administrator.delete(`/api/tavole/${second.tavolaId}`).expect(200);

    const earlier = await current(first.run);
    expect(earlier.tavole.find((tavola) => tavola.number === '1')).toMatchObject({
      tavolaId: null,
      removed: null,
      replacedBy: { runId: second.run.id },
    });
    const later = await current(second.run);
    expect(later.tavole.find((tavola) => tavola.number === '1')).toMatchObject({
      tavolaId: null,
      removed: { by: { name: 'Ada Admin' } },
      replacedBy: null,
    });
    expect(later.tavole.find((tavola) => tavola.number === '2')?.replacedBy).toBeNull();

    const { runs } = (await administrator.get('/api/catalog-runs').expect(200))
      .body as CatalogRunsResponse;
    expect(runs.map((run) => [run.id, run.removed])).toEqual([
      [second.run.id, 1],
      [first.run.id, 0],
    ]);
  });

  it('is not read again by the run continued after it was removed', async () => {
    const run = await estimated(administrator, model);
    // $0.30 reads Tavola 1 and stops before Tavola 2 (`catalog-run-continue.test.ts`).
    await start(administrator, run, { limit: 0.3 }).expect(202);
    const stopped = await settled(administrator, run);
    expect(stopped.state).toBe('stopped-at-limit');
    const tavolaId = stopped.tavole[0]?.tavolaId as string;
    await administrator.delete(`/api/tavole/${tavolaId}`).expect(200);

    method.calls.length = 0;
    await carryOn(administrator, run, { limit: 1 }).expect(202);
    const finished = await settled(administrator, run);

    expect(finished.state).toBe('finished');
    expect(method.calls).toEqual(['read 2 1', 'read 2 2']);
    expect(finished.tavole[0]).toMatchObject({ number: '1', tavolaId: null });
    expect(finished.tavole[0]?.removed).toEqual({
      by: { id: expect.any(String), name: 'Ada Admin' },
      at: expect.any(String),
    });
    const { tavole: onModel } = (await administrator.get(`/api/models/${model.id}`).expect(200))
      .body as { tavole: { number: string }[] };
    expect(onModel.map((one) => one.number)).toEqual(['2']);
  });

  it('is refused while a run is reading, and while one is being estimated', async () => {
    const loaded = await givenTavola(app.db, model.id, { number: '7', state: 'unchecked' });

    const reading = await estimated(administrator, model);
    const holdReading = method.holdAt('read 1 1');
    await start(administrator, reading, { limit: 1 }).expect(202);
    await holdReading.reached;
    const whileReading = await administrator.delete(`/api/tavole/${loaded.id}`).expect(409);
    expect(whileReading.body.error.message).toMatch(/one at a time/i);
    const askedWhileReading = await administrator
      .get(`/api/tavole/${loaded.id}/removal`)
      .expect(409);
    expect(askedWhileReading.body.error.message).toMatch(/one at a time/i);
    holdReading.release();
    await settled(administrator, reading);

    const holdEstimate = method.holdAt('estimate 1');
    const estimating = await administrator
      .post('/api/catalog-runs')
      .query({ modelId: model.id, firstPage: '1', lastPage: '2' })
      .set('Content-Type', 'application/pdf')
      .send(fixturePdf(2))
      .expect(201);
    await holdEstimate.reached;
    const whileEstimating = await administrator.delete(`/api/tavole/${loaded.id}`).expect(409);
    expect(whileEstimating.body.error.message).toMatch(/one at a time/i);
    holdEstimate.release();
    await estimateSettled(administrator, (estimating.body as CatalogRunResponse).run);

    await administrator.get(`/api/tavole/${loaded.id}`).expect(200);
  });
});
