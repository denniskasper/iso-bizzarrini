import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogRunResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfiguredReading } from '../src/composition/reading.js';
import type { ModelRow } from '../src/db/schema.js';
import { PRICE_LIST } from '../src/reading/price-list.js';
import { fakeReadingMethod } from './support/catalog-reading.js';
import { fixturePdf } from './support/fixture-pdf.js';
import { givenModel } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Uploading a catalog and seeing what reading it would cost** (issue #57). Nothing is read: the
 * PDF is kept as privately as a Scan, and the run is estimated page by page as the read command
 * estimates it. The fake Reading method counts every request at $0.04, so a blank page, asked
 * what it is and read twice, is estimated at $0.12 (`support/catalog-reading.ts`).
 */
function configured(
  method: ReturnType<typeof fakeReadingMethod>,
  kind: 'api-key' | 'subscription' = 'api-key',
): ConfiguredReading {
  return { kind, method, unavailable: null, invented: false };
}

function upload(agent: TestAgent, query: Record<string, string>, body: Buffer) {
  return agent
    .post('/api/catalog-runs')
    .query(query)
    .set('Content-Type', 'application/pdf')
    .send(body);
}

async function storedFiles(app: TestApp): Promise<string[]> {
  return readdir(app.filesPath, { recursive: true });
}

describe('uploading a catalog and its estimate', () => {
  let app: TestApp;
  let method: ReturnType<typeof fakeReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    method = fakeReadingMethod([]);
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    await rm(join(app.filesPath, 'catalog-runs'), { recursive: true, force: true });
    method.estimated.length = 0;
    administrator = (await givenAnAdministrator(app)).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
  });

  it('estimates only the pages it was given, from the fake method’s token counts', async () => {
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '2', lastPage: '4' },
      fixturePdf(5),
    ).expect(201);
    const { run } = response.body as CatalogRunResponse;

    expect(run).toMatchObject({
      state: 'estimated',
      model: { id: model.id, brand: 'Iso', name: 'Rivolta' },
      pages: { first: 2, last: 4 },
      catalogPages: 5,
      estimate: 0.36,
      readingMethod: 'api-key',
      charged: true,
      priceList: { model: 'claude-opus-5-5', checkedOn: PRICE_LIST.checkedOn },
    });
    // The front matter and the technical data are never even counted.
    expect(method.estimated).toEqual([2, 3, 4]);
    expect(method.calls).toEqual([]);

    const again = await administrator.get(`/api/catalog-runs/${run.id}`).expect(200);
    expect((again.body as CatalogRunResponse).run).toEqual(run);
  });

  it('keeps the catalog, for an Administrator to open', async () => {
    const pdf = fixturePdf(3);
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '3' },
      pdf,
    ).expect(201);
    const { run } = response.body as CatalogRunResponse;

    const catalog = await administrator
      .get(`/api/catalog-runs/${run.id}/catalog`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(catalog.headers['content-type']).toBe('application/pdf');
    expect(Buffer.compare(catalog.body as Buffer, pdf)).toBe(0);
  });

  it('refuses a file that is not a PDF, before anything is kept', async () => {
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      Buffer.from('Figura;N° Ordinazione;Denominazione\n'),
    ).expect(415);

    expect(response.body.error.message).toMatch(/not a PDF/);
    expect(await storedFiles(app)).toEqual([]);
    expect(method.estimated).toEqual([]);
  });

  it('refuses a PDF that cannot be read, before anything is kept', async () => {
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      Buffer.from('%PDF-1.4\nthe rest of it is missing'),
    ).expect(415);

    expect(response.body.error.message).toMatch(/could not be read/);
    expect(await storedFiles(app)).toEqual([]);
  });

  it('refuses pages the catalog does not have, and says how many it has', async () => {
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '4', lastPage: '9' },
      fixturePdf(5),
    ).expect(400);

    expect(response.body.error.message).toMatch(/5 pages/);
    expect(await storedFiles(app)).toEqual([]);
  });

  it('needs the pages to read, first to last', async () => {
    const pdf = fixturePdf(5);
    await upload(administrator, { modelId: model.id }, pdf).expect(400);
    await upload(administrator, { modelId: model.id, firstPage: '4', lastPage: '2' }, pdf).expect(
      400,
    );
    await upload(administrator, { modelId: model.id, firstPage: '0', lastPage: '2' }, pdf).expect(
      400,
    );
  });

  it('needs a Model that exists', async () => {
    await upload(
      administrator,
      { modelId: '00000000-0000-4000-8000-000000000000', firstPage: '1', lastPage: '2' },
      fixturePdf(2),
    ).expect(404);
    expect(await storedFiles(app)).toEqual([]);
  });

  it('is not there for an Editor or a Member, nor is the catalog', async () => {
    const pdf = fixturePdf(2);
    const { run } = (
      await upload(administrator, { modelId: model.id, firstPage: '1', lastPage: '2' }, pdf).expect(
        201,
      )
    ).body as CatalogRunResponse;
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;

    for (const agent of [editor, member]) {
      await upload(agent, { modelId: model.id, firstPage: '1', lastPage: '2' }, pdf).expect(404);
      await agent.get(`/api/catalog-runs/${run.id}`).expect(404);
      await agent.get(`/api/catalog-runs/${run.id}/catalog`).expect(404);
    }
    await app.request().get(`/api/catalog-runs/${run.id}/catalog`).expect(401);
  });
});

describe('a catalog estimated on a subscription', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({
      reading: configured(fakeReadingMethod([], { charged: false }), 'subscription'),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is priced at list prices, and not charged', async () => {
    const administrator = (await givenAnAdministrator(app)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });

    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      fixturePdf(2),
    ).expect(201);

    expect((response.body as CatalogRunResponse).run).toMatchObject({
      estimate: 0.24,
      readingMethod: 'subscription',
      charged: false,
    });
  });
});

describe('a catalog uploaded where nothing can be read', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('is refused, with the reason', async () => {
    const administrator = (await givenAnAdministrator(app)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Fidia' });

    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      fixturePdf(2),
    ).expect(409);

    expect(response.body.error.message).toMatch(/No Reading method is configured/);
    expect(await storedFiles(app)).toEqual([]);
  });
});

describe('a catalog larger than the archive accepts', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({
      env: { MAX_CATALOG_BYTES: '2048' },
      reading: configured(fakeReadingMethod([])),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is refused, with the reason', async () => {
    const administrator = (await givenAnAdministrator(app)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });

    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      Buffer.concat([fixturePdf(2), Buffer.alloc(4096)]),
    ).expect(413);

    expect(response.body.error.message).toMatch(/larger than/);
    expect(await storedFiles(app)).toEqual([]);
  });
});
