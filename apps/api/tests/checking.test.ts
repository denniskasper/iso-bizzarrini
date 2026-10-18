import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TavolaCheckingResponse, TavolaResponse, TavolaScan } from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scans } from '../src/db/schema.js';
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
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Checking a machine-read Tavola** (issue #34): what an Editor compares it with — the rows as
 * read beside the sheet each came from, the doubts, the Reading method — and turning its Scan.
 */
describe('checking an Unchecked Tavola', () => {
  let app: TestApp;
  let editor: TestAgent;
  let member: TestAgent;
  const opened: OutputDirectory[] = [];

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app);
    editor = (await givenAMember(app, administrator.agent, { name: 'An Editor', role: 'editor' }))
      .agent;
    member = (await givenAMember(app, administrator.agent)).agent;
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  // Two Table sheets; the two Readings of the second disagree on the quantity at 3.
  const TAVOLA_84: InventedPage[] = [
    aDrawing('84', { titleIt: 'ASSALE POSTERIORE' }),
    aTableSheet('84', [aTable([aRow('1', '208501', 'SCATOLA'), aRow('2', '208502', 'SEMIASSE')])], {
      foglio: '1',
    }),
    aTableSheet(
      '84',
      [
        aTable([aRow('3', '208503', 'CUSCINETTO', { quantity: '2' })]),
        aTable([aRow('3', '208503', 'CUSCINETTO', { quantity: '4' })]),
      ],
      { foglio: '2' },
    ),
  ];

  async function givenLoaded(): Promise<string> {
    const out = await givenOutputDirectory();
    opened.push(out);
    await readCatalog({
      pdf: 'catalog.pdf',
      out: out.path,
      model: { brand: 'Iso', name: 'Rivolta' },
      method: fakeReadingMethod(TAVOLA_84),
      pages: fakePages(TAVOLA_84),
      limit: 100,
      print: () => undefined,
    });
    const report = await loadReading({
      db: app.db,
      fileStore: createFileStore(app.filesPath),
      clock: app.clock,
      logger: app.logger,
      source: out.path,
    });
    expect(report.rejected).toEqual([]);

    const { models } = (await editor.get('/api/models').expect(200)).body;
    const { tavole } = (await editor.get(`/api/models/${models[0].id}`).expect(200)).body;
    return tavole[0].id as string;
  }

  async function drawing(agent: TestAgent, tavolaId: string): Promise<TavolaResponse> {
    return (await agent.get(`/api/tavole/${tavolaId}`).expect(200)).body;
  }

  async function checking(tavolaId: string): Promise<TavolaCheckingResponse> {
    return (await editor.get(`/api/tavole/${tavolaId}/checking`).expect(200)).body;
  }

  describe('shows an Editor', () => {
    it('each row as read, with the Table sheet it came from', async () => {
      const tavolaId = await givenLoaded();
      const { listings } = await checking(tavolaId);

      expect(listings.map((listing) => [listing.part.catalogNumber, listing.tableSheet])).toEqual([
        ['208501', 1],
        ['208502', 1],
        ['208503', 2],
      ]);
    });

    it('the doubts, each leading to the row and the number it concerns', async () => {
      const tavolaId = await givenLoaded();
      const { listings, doubts } = await checking(tavolaId);
      const { positions } = await drawing(editor, tavolaId);
      const three = listings.find((listing) => listing.part.catalogNumber === '208503');

      expect(doubts).toEqual([
        {
          id: expect.any(String),
          reason: expect.stringContaining('quantity'),
          listingId: three?.id,
          positionId: positions.find((position) => position.number === '3')?.id,
        },
      ]);
    });

    it('which Reading method read it', async () => {
      const tavolaId = await givenLoaded();
      expect((await checking(tavolaId)).readingMethod).toBe('a fake Reading method');
    });

    it('a row flipped from drawn to undrawn, as it now is', async () => {
      const tavolaId = await givenLoaded();
      const [first] = (await checking(tavolaId)).listings;

      await editor
        .patch(`/api/listings/${first?.id}`)
        .send({
          positionId: first?.positionId,
          quantityPerCar: first?.quantityPerCar,
          drawn: false,
        })
        .expect(200);

      const flipped = (await checking(tavolaId)).listings.find(
        (listing) => listing.id === first?.id,
      );
      expect(flipped).toMatchObject({ drawn: false, tableSheet: 1 });
    });

    it('the Table sheets, which an Editor can open before anybody has published it', async () => {
      const tavolaId = await givenLoaded();
      const { tavola } = await drawing(editor, tavolaId);

      expect(tavola.tableSheets).toEqual([
        { sheet: 1, width: 300, height: 200, url: `/api/tavole/${tavolaId}/table-sheets/1` },
        { sheet: 2, width: 300, height: 200, url: `/api/tavole/${tavolaId}/table-sheets/2` },
      ]);
      const image = await editor.get(tavola.tableSheets[1]?.url ?? '').expect(200);
      expect(image.headers['content-type']).toBe('image/png');
      expect((await sharp(image.body as Buffer).metadata()).width).toBe(300);
    });
  });

  describe('for a Member', () => {
    it('is no screen at all', async () => {
      const tavolaId = await givenLoaded();
      await member.get(`/api/tavole/${tavolaId}/checking`).expect(404);

      await editor.post(`/api/tavole/${tavolaId}/publication`).expect(200);
      await member.get(`/api/tavole/${tavolaId}/checking`).expect(403);
    });

    it('opens the Table sheets once the Tavola is Published, and not before', async () => {
      const tavolaId = await givenLoaded();
      await member.get(`/api/tavole/${tavolaId}/table-sheets/1`).expect(404);

      await editor.post(`/api/tavole/${tavolaId}/publication`).expect(200);
      const { tavola } = await drawing(member, tavolaId);
      expect(tavola.tableSheets).toHaveLength(2);
      await member.get(tavola.tableSheets[0]?.url ?? '').expect(200);
      await member.get(`/api/tavole/${tavolaId}/table-sheets/3`).expect(404);
    });

    it('never says which Reading method read it', async () => {
      const tavolaId = await givenLoaded();
      await editor.post(`/api/tavole/${tavolaId}/publication`).expect(200);

      const response = await member.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(response.text).not.toContain('a fake Reading method');
    });
  });
});

describe('turning a Scan a quarter', () => {
  let app: TestApp;
  let editor: TestAgent;
  let member: TestAgent;
  let tavolaId: string;
  let uploaded: Buffer;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app);
    editor = (await givenAMember(app, administrator.agent, { name: 'An Editor', role: 'editor' }))
      .agent;
    member = (await givenAMember(app, administrator.agent)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12', state: 'unchecked' })).id;

    uploaded = await givenScanImage({ width: 600, height: 400 });
    await editor
      .put(`/api/tavole/${tavolaId}/scan`)
      .set('Content-Type', 'image/png')
      .send(uploaded)
      .expect(201);
    await editor.post(`/api/tavole/${tavolaId}/marks`).send({ number: '1', x: 0.2, y: 0.1 });
  });

  async function turn(direction: string): Promise<TavolaScan> {
    return (await editor.post(`/api/tavole/${tavolaId}/scan/turns`).send({ direction }).expect(200))
      .body.scan;
  }

  async function markOnOne(): Promise<{ x: number; y: number }> {
    const { positions } = (await editor.get(`/api/tavole/${tavolaId}`).expect(200))
      .body as TavolaResponse;
    const [mark] = positions[0]?.marks ?? [];
    return { x: mark?.x ?? NaN, y: mark?.y ?? NaN };
  }

  it('clockwise, turning the drawing and every Mark on it with it', async () => {
    const before = (await editor.get(`/api/tavole/${tavolaId}`)).body.tavola.scan as TavolaScan;
    const scan = await turn('clockwise');

    expect(scan.id).not.toBe(before.id);
    expect({ width: scan.width, height: scan.height }).toEqual({ width: 400, height: 600 });
    const display = await editor.get(scan.displayUrl).expect(200);
    expect(await sharp(display.body as Buffer).metadata()).toMatchObject({
      width: 400,
      height: 600,
    });

    // (x, y) → (1 − y, x)
    const mark = await markOnOne();
    expect(mark.x).toBeCloseTo(0.9);
    expect(mark.y).toBeCloseTo(0.2);
  });

  it('anticlockwise, the other way', async () => {
    await turn('anticlockwise');

    // (x, y) → (y, 1 − x)
    const mark = await markOnOne();
    expect(mark.x).toBeCloseTo(0.1);
    expect(mark.y).toBeCloseTo(0.8);
  });

  it('keeps the upload byte for byte, however often it is turned', async () => {
    await turn('clockwise');
    await turn('clockwise');
    await turn('anticlockwise');
    const scan = await turn('clockwise');
    expect({ width: scan.width, height: scan.height }).toEqual({ width: 600, height: 400 });

    const [row] = await app.db.select().from(scans).where(eq(scans.tavolaId, tavolaId));
    expect(row?.quarterTurns).toBe(2);
    expect(await readFile(join(app.filesPath, row?.originalKey ?? ''))).toEqual(uploaded);

    const mark = await markOnOne();
    expect(mark.x).toBeCloseTo(0.8);
    expect(mark.y).toBeCloseTo(0.9);
  });

  it('is an Editor’s to do', async () => {
    await editor.post(`/api/tavole/${tavolaId}/publication`).expect(200);
    await member
      .post(`/api/tavole/${tavolaId}/scan/turns`)
      .send({ direction: 'clockwise' })
      .expect(403);
  });

  it('refuses a direction that is not one of the two', async () => {
    await editor.post(`/api/tavole/${tavolaId}/scan/turns`).send({ direction: 'up' }).expect(400);
  });

  it('answers that there is no Scan to turn on a Tavola without one', async () => {
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });
    const bare = await givenTavola(app.db, model.id, { number: '3' });
    const response = await editor
      .post(`/api/tavole/${bare.id}/scan/turns`)
      .send({ direction: 'clockwise' })
      .expect(404);
    expect(response.body.error.message).toMatch(/no Scan/);
  });
});
