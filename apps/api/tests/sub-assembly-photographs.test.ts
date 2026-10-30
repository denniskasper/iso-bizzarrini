import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Photograph, SubAssemblyResponse } from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { photographs } from '../src/db/schema.js';
import { givenModel, givenPhotographImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Sub-assembly's Photographs** (issue #114): the window slider as restorers photograph it,
 * assembled, rather than its screws one at a time.
 *
 * Uploading, the derived sizes and the image addresses are a Part's Photographs' own, and
 * `photographs.test.ts` proves those. What is proved here is what is the Sub-assembly's: that an
 * Editor adds, orders and removes them through the Sub-assembly, that its page reads them in that
 * order, and that they are exactly as private as a Part's.
 */
describe('photographs of a Sub-assembly', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let member: TestAgent;
  let tavolaId: string;
  let subAssemblyId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '30' })).id;

    const sheet = await editor
      .post(`/api/tavole/${tavolaId}/positions`)
      .send({ number: '12' })
      .expect(201);
    const grouped = await editor
      .post(`/api/tavole/${tavolaId}/sub-assemblies`)
      .send({
        name: 'Window Slider',
        positionIds: (sheet.body.positions as { id: string }[]).map((one) => one.id),
      })
      .expect(201);
    subAssemblyId = (grouped.body.subAssemblies as { id: string }[])[0]?.id ?? '';
  });

  async function storedPhotographs(): Promise<string[]> {
    return readdir(join(app.filesPath, 'photographs')).catch(() => []);
  }

  function send(image: Buffer, as: TestAgent = editor) {
    return as
      .post(`/api/sub-assemblies/${subAssemblyId}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(image);
  }

  async function upload(image: Buffer): Promise<Photograph[]> {
    const response = await send(image).expect(201);
    return (response.body as SubAssemblyResponse).subAssembly.photographs;
  }

  async function readPage(as: TestAgent = member): Promise<Photograph[]> {
    const response = await as
      .get(`/api/tavole/${tavolaId}/sub-assemblies/${subAssemblyId}`)
      .expect(200);
    return (response.body as SubAssemblyResponse).subAssembly.photographs;
  }

  it('reads none on a page nobody has photographed', async () => {
    expect(await readPage()).toEqual([]);
  });

  it('are added by an Editor, prepared as a Part’s are, and read on the page', async () => {
    const [photograph] = await upload(await givenPhotographImage({ width: 4032, height: 3024 }));
    if (!photograph) {
      throw new Error('The upload reported no photograph.');
    }

    // The derived sizes are a Part's Photographs' sizes.
    expect(photograph).toMatchObject({ width: 2400, height: 1800 });
    expect(await readPage()).toEqual([photograph]);

    const display = await member.get(photograph.displayUrl).expect(200);
    expect(display.headers['content-type']).toBe('image/webp');
    await member.get(photograph.previewUrl).expect(200);

    // The Sub-assembly's, and nobody's Part's.
    const [row] = await app.db.select().from(photographs).where(eq(photographs.id, photograph.id));
    expect(row).toMatchObject({ subAssemblyId, partId: null, sequence: 0 });
  });

  it('are kept in the order they were uploaded, and reordered by naming the whole order', async () => {
    await upload(await givenPhotographImage({ width: 800, height: 600 }));
    await upload(await givenPhotographImage({ width: 640, height: 480 }));
    const uploaded = await upload(await givenPhotographImage({ width: 500, height: 400 }));
    expect(uploaded.map((one) => one.width)).toEqual([800, 640, 500]);

    const [first, second, third] = uploaded.map((one) => one.id);
    const response = await editor
      .patch(`/api/sub-assemblies/${subAssemblyId}/photographs`)
      .send({ photographIds: [third, first, second] })
      .expect(200);

    expect(
      (response.body as SubAssemblyResponse).subAssembly.photographs.map((one) => one.width),
    ).toEqual([500, 800, 640]);
    expect((await readPage()).map((one) => one.width)).toEqual([500, 800, 640]);
  });

  it('refuse an order that is not exactly the Sub-assembly’s photographs', async () => {
    await upload(await givenPhotographImage());
    const uploaded = await upload(await givenPhotographImage());
    const [first, second] = uploaded.map((one) => one.id);

    for (const photographIds of [
      [first],
      [first, first],
      [first, second, '00000000-0000-4000-8000-000000000000'],
    ]) {
      await editor
        .patch(`/api/sub-assemblies/${subAssemblyId}/photographs`)
        .send({ photographIds })
        .expect(400);
    }

    expect((await readPage()).map((one) => one.id)).toEqual([first, second]);
  });

  it('are removed one at a time, files and all, leaving the rest in order', async () => {
    await upload(await givenPhotographImage({ width: 800, height: 600 }));
    await upload(await givenPhotographImage({ width: 640, height: 480 }));
    const uploaded = await upload(await givenPhotographImage({ width: 500, height: 400 }));
    const middle = uploaded[1];
    if (!middle) {
      throw new Error('The upload reported no photograph.');
    }

    const response = await editor
      .delete(`/api/sub-assemblies/${subAssemblyId}/photographs/${middle.id}`)
      .expect(200);

    expect(
      (response.body as SubAssemblyResponse).subAssembly.photographs.map((one) => one.width),
    ).toEqual([800, 500]);
    await editor.get(middle.displayUrl).expect(404);
    expect(await storedPhotographs()).not.toContain(middle.id);
  });

  it('are not removed through another owner’s address', async () => {
    const [photograph] = await upload(await givenPhotographImage());
    const other = await editor
      .post(`/api/tavole/${tavolaId}/sub-assemblies`)
      .send({
        name: 'Door Lock',
        positionIds: [
          (
            (await editor.post(`/api/tavole/${tavolaId}/positions`).send({ number: '13' })).body
              .positions as { id: string; number: string }[]
          ).find((one) => one.number === '13')?.id,
        ],
      })
      .expect(201);
    const doorLock = (other.body.subAssemblies as { id: string; name: string }[]).find(
      (one) => one.name === 'Door Lock',
    )?.id;

    await editor
      .delete(`/api/sub-assemblies/${doorLock ?? ''}/photographs/${photograph?.id ?? ''}`)
      .expect(404);
    // A Part's address takes only a Part's.
    await editor.delete(`/api/photographs/${photograph?.id ?? ''}`).expect(404);

    expect(await readPage()).toHaveLength(1);
  });

  it('are a 404 for a Sub-assembly there is not', async () => {
    await editor
      .post('/api/sub-assemblies/00000000-0000-4000-8000-000000000000/photographs')
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage())
      .expect(404);
    await editor
      .patch('/api/sub-assemblies/00000000-0000-4000-8000-000000000000/photographs')
      .send({ photographIds: [] })
      .expect(404);
  });

  it('refuse an upload that is not a photograph, and leave nothing behind', async () => {
    const before = await storedPhotographs();

    await send(Buffer.from('%PDF-1.4 not a photograph')).expect(415);

    expect(await storedPhotographs()).toEqual(before);
    expect(await readPage()).toEqual([]);
  });

  it('are an Editor’s to add, order and remove, and a Member is refused', async () => {
    const [photograph] = await upload(await givenPhotographImage());

    const refused = await send(await givenPhotographImage(), member).expect(403);
    expect(refused.body.error?.code).toBe('forbidden');
    await member
      .patch(`/api/sub-assemblies/${subAssemblyId}/photographs`)
      .send({ photographIds: [photograph?.id] })
      .expect(403);
    await member
      .delete(`/api/sub-assemblies/${subAssemblyId}/photographs/${photograph?.id ?? ''}`)
      .expect(403);

    expect(await readPage()).toHaveLength(1);
  });

  /** As private as a Part's (ADR 0006), and refused from the moment a Membership lapses. */
  it('are refused a lapsed Account, and a browser that has not signed in', async () => {
    const [photograph] = await upload(await givenPhotographImage());
    if (!photograph) {
      throw new Error('The upload reported no photograph.');
    }
    const lapsed = (await givenAMember(app, administrator, { paidThrough: '2025-12-31' })).agent;

    for (const url of [photograph.displayUrl, photograph.previewUrl]) {
      const refused = await lapsed.get(url).expect(403);
      expect(refused.body.error?.code).toBe('membership_lapsed');
      await app.request().get(url).expect(401);
    }
    await lapsed.get(`/api/tavole/${tavolaId}/sub-assemblies/${subAssemblyId}`).expect(403);
  });
});
