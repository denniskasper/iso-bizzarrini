import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scans } from '../src/db/schema.js';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Scan ingest and the private image route.
 *
 * The Club's drawings are the thing members contribute on the understanding that outsiders
 * cannot see them (ADR 0006), so "a signed-out request is refused" is tested for every address
 * an image has, not once for a representative one.
 */
describe('a Tavola’s scan', () => {
  let app: TestApp;
  let editor: TestAgent;
  let tavolaId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await givenAnEditor(app);

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12' })).id;
  });

  async function upload(
    image: Buffer,
    contentType = 'image/png',
  ): Promise<{ id: string; displayUrl: string; previewUrl: string }> {
    const response = await editor
      .put(`/api/tavole/${tavolaId}/scan`)
      .set('Content-Type', contentType)
      .send(image)
      .expect(201);
    return response.body.scan;
  }

  it('is prepared for viewing at ingest, and the Editor never says what format it is', async () => {
    // A TIFF, which no browser will show. What comes back is a picture a member can open.
    const scan = await upload(await givenScanImage({ format: 'tiff' }), 'image/tiff');

    const display = await editor.get(scan.displayUrl).expect(200);
    expect(display.headers['content-type']).toBe('image/webp');

    // The display image is the whole drawing at the size it was scanned; the preview is a
    // thumbnail, so listing a Model's Tavole never downloads one.
    expect((await sharp(display.body as Buffer).metadata()).width).toBe(1200);

    const preview = await editor.get(scan.previewUrl).expect(200);
    expect(preview.headers['content-type']).toBe('image/webp');
    expect((await sharp(preview.body as Buffer).metadata()).width).toBe(480);
  });

  // ADR 0006 asks that the upload be kept privately, not that it be served: nothing a member
  // does needs the original, so it has no address at all. It is the archival copy.
  it('keeps the upload itself byte for byte, and serves it to nobody', async () => {
    const uploaded = await givenScanImage({ width: 600, height: 400 });
    const scan = await upload(uploaded);

    await editor.get(`/api/scans/${scan.id}/original`).expect(400);

    const [row] = await app.db.select().from(scans).where(eq(scans.tavolaId, tavolaId));
    const stored = await readFile(join(app.filesPath, row?.originalKey ?? ''));
    expect(stored).toEqual(uploaded);
  });

  it('appears on the Tavola, with the dimensions a viewer needs', async () => {
    await upload(await givenScanImage({ width: 1200, height: 800 }));

    const response = await editor.get(`/api/tavole/${tavolaId}`).expect(200);

    expect(response.body.tavola.scan).toEqual({
      id: expect.any(String),
      width: 1200,
      height: 800,
      displayUrl: expect.stringContaining('/api/scans/'),
      previewUrl: expect.stringContaining('/api/scans/'),
    });
  });

  // Nothing verified the assumption that these drawings need tiling (ADR 0013), so rather than
  // ask a volunteer to measure a dozen files by hand, ingest measures every one of them.
  it('records what it measured, so the tiling question can be answered from the archive', async () => {
    const uploaded = await givenScanImage({ width: 1400, height: 900, format: 'jpeg' });
    await upload(uploaded, 'image/jpeg');

    const [row] = await app.db.select().from(scans).where(eq(scans.tavolaId, tavolaId));

    expect(row).toMatchObject({
      sourceFormat: 'jpeg',
      sourceByteSize: uploaded.byteLength,
      sourceWidth: 1400,
      sourceHeight: 900,
      displayFormat: 'webp',
      ingestedAt: app.clock.now(),
    });
    expect(row?.displayByteSize).toBeGreaterThan(0);
    expect(row?.previewByteSize).toBeGreaterThan(0);
  });

  describe('re-uploading it', () => {
    it('regenerates the derived images without ever orphaning the Tavola', async () => {
      const first = await upload(await givenScanImage({ width: 1200, height: 800 }));
      const second = await upload(await givenScanImage({ width: 900, height: 600 }));

      expect(second.id).not.toBe(first.id);

      const response = await editor.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(response.body.tavola.scan).toMatchObject({
        id: second.id,
        width: 900,
        height: 600,
      });

      await editor.get(second.displayUrl).expect(200);
    });

    it('takes the replaced files away rather than leaving them on the disk', async () => {
      const first = await upload(await givenScanImage());
      await upload(await givenScanImage({ width: 900, height: 600 }));

      await editor.get(first.displayUrl).expect(404);
      expect(await readdir(join(app.filesPath, 'scans'))).not.toContain(first.id);
    });
  });

  describe('reaching an image', () => {
    it('is refused at every one of its addresses when nobody is signed in', async () => {
      const scan = await upload(await givenScanImage());

      for (const url of [scan.displayUrl, scan.previewUrl]) {
        const response = await app.request().get(url).expect(401);
        expect(response.body.error).toMatchObject({ code: 'not_signed_in' });
      }
    });

    it('is refused the moment an Editor signs out', async () => {
      const scan = await upload(await givenScanImage());
      await editor.get(scan.displayUrl).expect(200);

      await editor.delete('/api/session').expect(200);

      await editor.get(scan.displayUrl).expect(401);
    });

    // The address of an image never changes what it points at, which is what makes it safe to
    // cache for a year — and what makes a per-request authentication check affordable.
    it('carries a long, immutable cache header, and one that says who it was for', async () => {
      const scan = await upload(await givenScanImage());

      const response = await editor.get(scan.displayUrl).expect(200);

      expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(response.headers['vary']).toContain('Cookie');
      expect(response.headers['etag']).toBeDefined();
    });

    it('answers a browser that already has it with nothing at all', async () => {
      const scan = await upload(await givenScanImage());
      const first = await editor.get(scan.displayUrl).expect(200);

      const second = await editor
        .get(scan.displayUrl)
        .set('If-None-Match', first.headers['etag'] as string)
        .expect(304);

      expect(second.headers['content-length']).toBeUndefined();
    });

    it('is a 404 for a scan that is not there', async () => {
      await editor.get('/api/scans/00000000-0000-4000-8000-000000000000/display').expect(404);
    });

    it('is a 400 for a variant nobody serves', async () => {
      const scan = await upload(await givenScanImage());

      await editor.get(`/api/scans/${scan.id}/thumbnail`).expect(400);
    });
  });

  describe('an upload that is not a scan', () => {
    it('is refused when it is not an image at all, whatever it claimed to be', async () => {
      const response = await editor
        .put(`/api/tavole/${tavolaId}/scan`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('%PDF-1.4 not a drawing'))
        .expect(415);

      expect(response.body.error).toMatchObject({ code: 'unsupported_media_type' });
    });

    // A `.tif` off a flatbed routinely arrives with no type at all, and refusing that would be
    // exactly the conversation about image formats an Editor is promised never to have.
    it('is accepted when the browser could not say what it was', async () => {
      await editor
        .put(`/api/tavole/${tavolaId}/scan`)
        .set('Content-Type', 'application/octet-stream')
        .send(await givenScanImage({ format: 'tiff' }))
        .expect(201);
    });

    it('is refused when it claims to be an image and is not', async () => {
      await editor
        .put(`/api/tavole/${tavolaId}/scan`)
        .set('Content-Type', 'image/png')
        .send(Buffer.from('this is not a PNG'))
        .expect(415);
    });

    it('is refused when it is empty', async () => {
      await editor
        .put(`/api/tavole/${tavolaId}/scan`)
        .set('Content-Type', 'image/png')
        .send(Buffer.alloc(0))
        .expect(400);
    });

    it('is refused for a Tavola that does not exist', async () => {
      await editor
        .put('/api/tavole/00000000-0000-4000-8000-000000000000/scan')
        .set('Content-Type', 'image/png')
        .send(await givenScanImage())
        .expect(404);
    });

    it('cannot be sent by someone who has not signed in', async () => {
      await app
        .request()
        .put(`/api/tavole/${tavolaId}/scan`)
        .set('Content-Type', 'image/png')
        .send(await givenScanImage())
        .expect(401);
    });
  });
});

describe('an upload larger than this archive accepts', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { MAX_SCAN_BYTES: '2048' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is refused rather than read into memory', async () => {
    await app.reset();
    const editor = await givenAnEditor(app);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id);

    const response = await editor
      .put(`/api/tavole/${tavola.id}/scan`)
      .set('Content-Type', 'image/png')
      .send(await givenScanImage({ width: 1200, height: 800 }))
      .expect(413);

    expect(response.body.error).toMatchObject({ code: 'payload_too_large' });
  });
});
