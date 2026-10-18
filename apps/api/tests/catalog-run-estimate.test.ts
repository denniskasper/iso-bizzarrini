import { readdir, rm, stat } from 'node:fs/promises';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { CatalogRun, CatalogRunResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ConfiguredReading } from '../src/composition/reading.js';
import type { ModelRow } from '../src/db/schema.js';
import { PRICE_LIST } from '../src/reading/price-list.js';
import { fakeReadingMethod } from './support/catalog-reading.js';
import { estimateSettled, heldReadingMethod } from './support/catalog-run.js';
import { fixturePdf, largeFixturePdf } from './support/fixture-pdf.js';
import { givenModel } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Uploading a catalog and seeing what reading it would cost** (issue #57). Nothing is read: the
 * PDF is kept as privately as a Scan, and the run is estimated page by page as the read command
 * estimates it. The fake Reading method counts every request at $0.04, so a blank page, asked
 * what it is and read twice, is estimated at $0.12 (`support/catalog-reading.ts`).
 *
 * The upload is answered once the catalog is stored, and the estimate is worked out after it, in
 * the background (issue #65): a catalog of a few hundred pages takes longer than a request may.
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
    const run = await estimateSettled(administrator, (response.body as CatalogRunResponse).run);

    expect(run).toMatchObject({
      state: 'estimated',
      estimating: null,
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

    const run = await estimateSettled(administrator, (response.body as CatalogRunResponse).run);
    expect(run).toMatchObject({
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

  it('is refused as it arrives, where the request did not say how large it is', async () => {
    const { email, password } = await givenAnAdministrator(app);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const server = createServer(app.app);
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
    try {
      const cookie = await signedInOver(server, { email, password });
      const answer = await streamed(server, cookie, model, largeFixturePdf(3, 64 * 1024), {
        declared: false,
      });

      expect(answer.status).toBe(413);
      expect(answer.body).toMatch(/larger than/);
      expect(await storedFiles(app)).toEqual([]);
    } finally {
      await new Promise((closed) => server.close(closed));
    }
  });
});

describe('a catalog estimated in the background', () => {
  let app: TestApp;
  let method: ReturnType<typeof heldReadingMethod>;
  let administrator: TestAgent;
  let model: ModelRow;

  beforeAll(async () => {
    method = heldReadingMethod([]);
    app = await startTestApp({ reading: configured(method) });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
  });

  async function estimating(): Promise<{ run: CatalogRun; release: () => void }> {
    const hold = method.holdAt('estimate 3');
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '2', lastPage: '4' },
      fixturePdf(5),
    ).expect(201);
    await hold.reached;
    return { run: (response.body as CatalogRunResponse).run, release: hold.release };
  }

  it('is answered before the estimate is worked out, which then follows page by page', async () => {
    const { run, release } = await estimating();
    expect(run).toMatchObject({ state: 'estimating', estimating: { pages: 0, of: 3 } });

    const going = await administrator.get(`/api/catalog-runs/${run.id}`).expect(200);
    expect((going.body as CatalogRunResponse).run).toMatchObject({
      state: 'estimating',
      estimating: { pages: 1, of: 3 },
    });

    release();
    expect(await estimateSettled(administrator, run)).toMatchObject({
      state: 'estimated',
      estimate: 0.36,
      estimating: null,
    });
  });

  it('cannot be started while it is still being estimated', async () => {
    const { run, release } = await estimating();

    const response = await administrator
      .post(`/api/catalog-runs/${run.id}/start`)
      .send({ limit: 1 })
      .expect(409);
    expect(response.body.error.message).toMatch(/still being estimated/);

    release();
    await estimateSettled(administrator, run);
    await administrator.post(`/api/catalog-runs/${run.id}/start`).send({ limit: 1 }).expect(202);
  });

  it('is the one thing being read: another catalog waits until it is done', async () => {
    const { run, release } = await estimating();
    const stored = await storedFiles(app);

    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      fixturePdf(2),
    ).expect(409);
    expect(response.body.error.message).toMatch(/one at a time/i);
    expect(await storedFiles(app)).toEqual(stored);

    release();
    await estimateSettled(administrator, run);
    await upload(
      administrator,
      { modelId: model.id, firstPage: '1', lastPage: '2' },
      fixturePdf(2),
    ).expect(201);
  });
});

describe('a catalog being estimated when the server restarts', () => {
  let after: TestApp;

  afterAll(async () => {
    await after.close();
  });

  it('is estimated to the end by the next server, at the same figure', async () => {
    const interrupted = heldReadingMethod([]);
    const before = await startTestApp({ reading: configured(interrupted) });
    const { agent: administrator, email, password } = await givenAnAdministrator(before);
    const model = await givenModel(before.db, { brand: 'Iso', name: 'Rivolta' });
    const hold = interrupted.holdAt('estimate 3');
    const response = await upload(
      administrator,
      { modelId: model.id, firstPage: '2', lastPage: '4' },
      fixturePdf(5),
    ).expect(201);
    const { run } = response.body as CatalogRunResponse;
    await hold.reached;

    const carriedOn = heldReadingMethod([]);
    after = await before.restart({ reading: configured(carriedOn) });
    // What the server that went away was waiting on comes back to nobody.
    hold.release();
    const again = await after.memberAgent({ email, password });

    expect(await estimateSettled(again, run)).toMatchObject({
      state: 'estimated',
      estimate: 0.36,
      estimating: null,
    });
    // Page 2 was estimated before the restart, and page 3 is estimated again whole.
    expect(carriedOn.estimated).toEqual([3, 4]);
  });
});

/** Signed in over `server`'s own socket, as the cookie a browser would send back. */
async function signedInOver(
  server: Server,
  credentials: { email: string; password: string },
): Promise<string> {
  const { port } = server.address() as AddressInfo;
  const signedIn = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  expect(signedIn.status).toBe(201);
  return signedIn.headers
    .getSetCookie()
    .map((set) => set.split(';')[0])
    .join('; ');
}

/**
 * A catalog sent a chunk at a time over a real socket, saying its size where `declared`, and sent
 * in chunks of no stated size otherwise, as a browser may.
 */
function streamed(
  server: Server,
  cookie: string,
  model: ModelRow,
  catalog: ReturnType<typeof largeFixturePdf>,
  { declared }: { declared: boolean },
): Promise<{ status: number; body: string }> {
  const { port } = server.address() as AddressInfo;
  return new Promise((answered, failed) => {
    const sending = request(
      {
        port,
        host: '127.0.0.1',
        method: 'POST',
        path: `/api/catalog-runs?modelId=${model.id}&firstPage=1&lastPage=3`,
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/pdf',
          ...(declared ? { 'Content-Length': catalog.byteSize } : {}),
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (body += chunk));
        response.on('end', () => answered({ status: response.statusCode ?? 0, body }));
      },
    );
    sending.on('error', failed);
    catalog.stream().pipe(sending);
  });
}

/**
 * **A catalog the size of a scanned one** (issue #65) goes to the file store as it arrives, and
 * the server never holds it whole. Sent over a real socket, a chunk at a time, so that neither end
 * of the test holds it either; the memory the server's buffers take is watched while it arrives.
 */
describe('a large catalog uploaded', () => {
  const BYTES = 256 * 1024 * 1024;
  let app: TestApp;
  let server: Server;

  beforeAll(async () => {
    app = await startTestApp({
      env: { MAX_CATALOG_BYTES: String(BYTES * 2) },
      reading: configured(fakeReadingMethod([])),
    });
    server = createServer(app.app);
    await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  });

  afterAll(async () => {
    await new Promise((closed) => server.close(closed));
    await app.close();
  });

  it('is stored without being held in memory', { timeout: 120_000 }, async () => {
    const { email, password } = await givenAnAdministrator(app);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
    const cookie = await signedInOver(server, { email, password });
    const catalog = largeFixturePdf(3, BYTES);

    const before = process.memoryUsage().arrayBuffers;
    let most = before;
    const watching = setInterval(() => {
      most = Math.max(most, process.memoryUsage().arrayBuffers);
    }, 5);
    const answer = await streamed(server, cookie, model, catalog, { declared: true }).finally(() =>
      clearInterval(watching),
    );

    expect(answer.status).toBe(201);
    // Held whole, it would be its size at least; a chunk at a time, some tens of megabytes of
    // buffers wait for the collector, how many depending on the machine (71 MB on a CI runner).
    // Half the file is well clear of both.
    expect(most - before).toBeLessThan(BYTES / 2);

    const { run } = JSON.parse(answer.body) as CatalogRunResponse;
    const agent = await app.memberAgent({ email, password });
    expect(await estimateSettled(agent, run)).toMatchObject({ state: 'estimated', estimate: 0.36 });
    const kept = await stat(join(app.filesPath, 'catalog-runs', run.id, 'catalog.pdf'));
    expect(kept.size).toBe(catalog.byteSize);
  });
});
