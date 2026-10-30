import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { violates } from '../src/db/constraints.js';
import { photographs, subAssemblies } from '../src/db/schema.js';
import { givenModel, givenPhotographImage, givenTavola } from './support/fixtures.js';
import { givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Photographs of a Part — **the check no part number can give anybody** (story 77).
 *
 * Two things are being proved here and they pull in opposite directions. The pictures have to be
 * easy to put in, because an Editor with a phone full of them will not convert files first; and
 * they have to be as private as the drawings are, because they are the Club's and ADR 0006 makes
 * one promise about every image in the archive. So "a signed-out request is refused" is asserted
 * at every address a photograph has, not once for a representative one.
 *
 * The third thing is the order. Which photograph is *first* is a judgement about which one shows
 * the part best, and an archive that reordered on its own — by upload time, by name — would be
 * overruling the one person who has looked at both pictures.
 */

/** What a form sends about a Part: every field a plain string, blank meaning "not recorded". */
function aPart(fields: Record<string, string> = {}) {
  return {
    nameEn: 'Front brake caliper',
    nameIt: '',
    catalogNumber: '',
    disegnoOrigine: '',
    description: '',
    dimensions: '',
    materialFinish: '',
    catalogNote: '',
    note: '',
    ...fields,
  };
}

describe('photographs of a Part', () => {
  let app: TestApp;
  let editor: TestAgent;
  let partId: string;
  let listingId: string;

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
    const tavola = await givenTavola(app.db, model.id, { number: '2' });

    // A Part to photograph. What is under test is never how it came to exist.
    const recorded = await editor
      .post(`/api/tavole/${tavola.id}/listings`)
      .send({ positionId: null, drawn: true, part: aPart() })
      .expect(201);
    partId = recorded.body.listing.part.id;
    listingId = recorded.body.listing.id;
  });

  /** What is in the private store, tolerant of a directory no upload has created yet. */
  async function storedPhotographs(): Promise<string[]> {
    return readdir(join(app.filesPath, 'photographs')).catch(() => []);
  }

  interface UploadedPhotograph {
    id: string;
    width: number;
    height: number;
    displayUrl: string;
    previewUrl: string;
  }

  async function upload(image: Buffer, contentType = 'image/jpeg'): Promise<UploadedPhotograph[]> {
    const response = await editor
      .post(`/api/parts/${partId}/photographs`)
      .set('Content-Type', contentType)
      .send(image)
      .expect(201);
    return response.body.part.photographs;
  }

  async function readPart(): Promise<UploadedPhotograph[]> {
    const response = await editor.get(`/api/parts/${partId}`).expect(200);
    return response.body.part.photographs;
  }

  describe('uploading one', () => {
    /**
     * The same promise the scan makes (story 94), kept for the other kind of picture: an Editor
     * picks a file off a phone and never says a word about formats.
     */
    it('is prepared for viewing at ingest, and the Editor never says what format it is', async () => {
      // A TIFF, which no browser will show. What comes back is a picture a member can open.
      const [photograph] = await upload(
        await givenPhotographImage({ format: 'tiff' }),
        'image/tiff',
      );
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }

      const display = await editor.get(photograph.displayUrl).expect(200);
      expect(display.headers['content-type']).toBe('image/webp');

      const preview = await editor.get(photograph.previewUrl).expect(200);
      expect(preview.headers['content-type']).toBe('image/webp');
      expect((await sharp(preview.body as Buffer).metadata()).width).toBe(480);
    });

    /**
     * **Bounded, unlike a scan.** A member is confirming a shape rather than reading a number off
     * one, so a phone's 4000px photograph is brought down to something that arrives — and the
     * dimensions reported are the ones a browser will actually lay out.
     */
    it('is brought down to a size a phone in a garage will actually receive', async () => {
      const [photograph] = await upload(await givenPhotographImage({ width: 4032, height: 3024 }));
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }

      expect(photograph.width).toBe(2400);
      expect(photograph.height).toBe(1800);

      const display = await editor.get(photograph.displayUrl).expect(200);
      expect((await sharp(display.body as Buffer).metadata()).width).toBe(2400);
    });

    it('is not enlarged when what arrived was already small', async () => {
      const [photograph] = await upload(await givenPhotographImage({ width: 900, height: 600 }));

      expect(photograph).toMatchObject({ width: 900, height: 600 });
    });

    // ADR 0006 asks that the upload be kept privately, not that it be served: nothing a member
    // does needs the original, so it has no address at all. It is the archival copy.
    it('keeps the upload itself byte for byte, and serves it to nobody', async () => {
      const uploaded = await givenPhotographImage({ width: 1600, height: 1200 });
      const [photograph] = await upload(uploaded);
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }

      await editor.get(`/api/photographs/${photograph.id}/original`).expect(400);

      const [row] = await app.db
        .select()
        .from(photographs)
        .where(eq(photographs.id, photograph.id));
      const stored = await readFile(join(app.filesPath, row?.originalKey ?? ''));
      expect(stored).toEqual(uploaded);
    });

    it('records what it measured, the way every image in this archive is measured', async () => {
      const uploaded = await givenPhotographImage({ width: 1600, height: 1200, format: 'jpeg' });
      await upload(uploaded);

      const [row] = await app.db.select().from(photographs).where(eq(photographs.partId, partId));

      expect(row).toMatchObject({
        sourceFormat: 'jpeg',
        sourceByteSize: uploaded.byteLength,
        sourceWidth: 1600,
        sourceHeight: 1200,
        displayFormat: 'webp',
        sequence: 0,
        uploadedAt: app.clock.now(),
      });
      expect(row?.displayByteSize).toBeGreaterThan(0);
      expect(row?.previewByteSize).toBeGreaterThan(0);
    });

    /**
     * **They are the Part's, not the drawing's** (ADR 0001) — so a member reading the Part at a
     * circle sees the same pictures as one reading it at any other circle, and there is nothing
     * to upload twice.
     */
    it('is read with the Part wherever the Part is read', async () => {
      await upload(await givenPhotographImage());

      const response = await editor.get(`/api/parts/${partId}`).expect(200);
      expect(response.body.part.photographs).toHaveLength(1);
    });

    it('is refused for a Part that does not exist', async () => {
      await editor
        .post('/api/parts/00000000-0000-4000-8000-000000000000/photographs')
        .set('Content-Type', 'image/jpeg')
        .send(await givenPhotographImage())
        .expect(404);
    });

    it('cannot be sent by someone who has not signed in', async () => {
      await app
        .request()
        .post(`/api/parts/${partId}/photographs`)
        .set('Content-Type', 'image/jpeg')
        .send(await givenPhotographImage())
        .expect(401);
    });
  });

  /**
   * **More than one, because one photograph is rarely the answer**: a casting number underneath,
   * the profile that tells the early bracket from the late one, the end that is always corroded.
   */
  describe('several of them', () => {
    it('are kept in the order they were uploaded, until somebody says otherwise', async () => {
      await upload(await givenPhotographImage({ width: 800, height: 600 }));
      await upload(await givenPhotographImage({ width: 640, height: 480 }));
      const all = await upload(await givenPhotographImage({ width: 500, height: 400 }));

      expect(all.map((photograph) => photograph.width)).toEqual([800, 640, 500]);
    });

    /**
     * The whole order, applied at once. Which picture is first is which picture a member sees
     * without scrolling, and that is a judgement about the photographs rather than about when
     * they arrived.
     */
    it('are reordered by naming the whole order', async () => {
      await upload(await givenPhotographImage({ width: 800, height: 600 }));
      await upload(await givenPhotographImage({ width: 640, height: 480 }));
      const uploaded = await upload(await givenPhotographImage({ width: 500, height: 400 }));

      const [first, second, third] = uploaded.map((photograph) => photograph.id);
      const response = await editor
        .patch(`/api/parts/${partId}/photographs`)
        .send({ photographIds: [third, first, second] })
        .expect(200);

      expect(response.body.part.photographs.map((one: UploadedPhotograph) => one.width)).toEqual([
        500, 800, 640,
      ]);
      // And it is the archive that holds the order, not the response that reported it.
      expect((await readPart()).map((one) => one.width)).toEqual([500, 800, 640]);
    });

    /**
     * **All of them or none of them.** A browser sending an order drawn from a list that has since
     * moved on — another Editor added a photograph, or removed one — is refused rather than half
     * applied, because half of an order is an order nobody chose.
     */
    it('refuse an order that is not exactly the photographs the Part has', async () => {
      await upload(await givenPhotographImage());
      const uploaded = await upload(await givenPhotographImage());
      const [first, second] = uploaded.map((photograph) => photograph.id);

      await editor
        .patch(`/api/parts/${partId}/photographs`)
        .send({ photographIds: [first] })
        .expect(400);

      await editor
        .patch(`/api/parts/${partId}/photographs`)
        .send({ photographIds: [first, first] })
        .expect(400);

      await editor
        .patch(`/api/parts/${partId}/photographs`)
        .send({
          photographIds: [first, second, '00000000-0000-4000-8000-000000000000'],
        })
        .expect(400);

      // Nothing moved.
      expect((await readPart()).map((one) => one.id)).toEqual([first, second]);
    });

    it('cannot be reordered by someone who has not signed in', async () => {
      const uploaded = await upload(await givenPhotographImage());

      await app
        .request()
        .patch(`/api/parts/${partId}/photographs`)
        .send({ photographIds: uploaded.map((photograph) => photograph.id) })
        .expect(401);
    });
  });

  describe('removing one', () => {
    it('takes it off the Part and takes its files off the disk', async () => {
      await upload(await givenPhotographImage({ width: 800, height: 600 }));
      const uploaded = await upload(await givenPhotographImage({ width: 640, height: 480 }));
      const going = uploaded[0];
      if (!going) {
        throw new Error('The upload reported no photograph.');
      }

      const response = await editor.delete(`/api/photographs/${going.id}`).expect(200);

      expect(response.body.part.photographs.map((one: UploadedPhotograph) => one.width)).toEqual([
        640,
      ]);
      await editor.get(going.displayUrl).expect(404);
      expect(await storedPhotographs()).not.toContain(going.id);
    });

    it('leaves the ones after it in the order they were in', async () => {
      await upload(await givenPhotographImage({ width: 800, height: 600 }));
      await upload(await givenPhotographImage({ width: 640, height: 480 }));
      const uploaded = await upload(await givenPhotographImage({ width: 500, height: 400 }));
      const middle = uploaded[1];
      if (!middle) {
        throw new Error('The upload reported no photograph.');
      }

      await editor.delete(`/api/photographs/${middle.id}`).expect(200);

      expect((await readPart()).map((one) => one.width)).toEqual([800, 500]);
    });

    it('is a 404 for a photograph that is not there', async () => {
      await editor.delete('/api/photographs/00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('cannot be done by someone who has not signed in', async () => {
      const uploaded = await upload(await givenPhotographImage());

      await app
        .request()
        .delete(`/api/photographs/${uploaded[0]?.id ?? ''}`)
        .expect(401);
    });

    /** A Part removed takes its pictures with it: they are of *it* and of nothing else. */
    it('happens on its own when the Part goes', async () => {
      const uploaded = await upload(await givenPhotographImage());

      // The Listing goes first, because a Part still listed anywhere is refused — which is the
      // rule that keeps an evening's work off a sheet nobody is looking at.
      await editor.delete(`/api/listings/${listingId}`).expect(204);
      await editor.delete(`/api/parts/${partId}`).expect(204);

      const [row] = await app.db
        .select()
        .from(photographs)
        .where(eq(photographs.id, uploaded[0]?.id ?? ''));
      expect(row).toBeUndefined();
    });
  });

  describe('reaching an image', () => {
    it('is refused at every one of its addresses when nobody is signed in', async () => {
      const [photograph] = await upload(await givenPhotographImage());
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }

      for (const url of [photograph.displayUrl, photograph.previewUrl]) {
        const response = await app.request().get(url).expect(401);
        expect(response.body.error).toMatchObject({ code: 'not_signed_in' });
      }
    });

    it('is refused the moment an Editor signs out', async () => {
      const [photograph] = await upload(await givenPhotographImage());
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }
      await editor.get(photograph.displayUrl).expect(200);

      await editor.delete('/api/session').expect(200);

      await editor.get(photograph.displayUrl).expect(401);
    });

    it('carries a long, immutable cache header, and one that says who it was for', async () => {
      const [photograph] = await upload(await givenPhotographImage());
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }

      const response = await editor.get(photograph.displayUrl).expect(200);

      expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(response.headers['vary']).toContain('Cookie');
      expect(response.headers['etag']).toBeDefined();
    });

    it('answers a browser that already has it with nothing at all', async () => {
      const [photograph] = await upload(await givenPhotographImage());
      if (!photograph) {
        throw new Error('The upload reported no photograph.');
      }
      const first = await editor.get(photograph.displayUrl).expect(200);

      const second = await editor
        .get(photograph.displayUrl)
        .set('If-None-Match', first.headers['etag'] as string)
        .expect(304);

      expect(second.headers['content-length']).toBeUndefined();
    });

    it('is a 404 for a photograph that is not there', async () => {
      await editor.get('/api/photographs/00000000-0000-4000-8000-000000000000/display').expect(404);
    });

    it('is a 400 for a variant nobody serves', async () => {
      const [photograph] = await upload(await givenPhotographImage());

      await editor.get(`/api/photographs/${photograph?.id ?? ''}/thumbnail`).expect(400);
    });
  });

  describe('an upload that is not a photograph', () => {
    it('is refused when it is not an image at all, whatever it claimed to be', async () => {
      const response = await editor
        .post(`/api/parts/${partId}/photographs`)
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.from('%PDF-1.4 not a photograph'))
        .expect(415);

      expect(response.body.error).toMatchObject({ code: 'unsupported_media_type' });
      // Said about the thing that was being uploaded, so the refusal reads as an answer.
      expect(response.body.error.message).toContain('photograph');
    });

    it('is accepted when the browser could not say what it was', async () => {
      await editor
        .post(`/api/parts/${partId}/photographs`)
        .set('Content-Type', 'application/octet-stream')
        .send(await givenPhotographImage({ format: 'tiff' }))
        .expect(201);
    });

    it('is refused when it is empty', async () => {
      await editor
        .post(`/api/parts/${partId}/photographs`)
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.alloc(0))
        .expect(400);
    });

    /** Nothing is left on the disk by a refusal: the row never happened, so neither do the files. */
    it('leaves nothing behind it', async () => {
      const before = await storedPhotographs();

      await editor
        .post(`/api/parts/${partId}/photographs`)
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.from('not a photograph'))
        .expect(415);

      expect(await storedPhotographs()).toEqual(before);
    });
  });
});

/**
 * The size limit, which is a quarter of a scan's: refusing an oversized upload **before it is
 * read into memory** is the whole point of putting the limit on the body parser rather than in a
 * handler, and this is the only place that can tell the two apart.
 */
describe('a photograph larger than this archive accepts', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp({ env: { MAX_PHOTOGRAPH_BYTES: '2048' } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is refused rather than read into memory', async () => {
    await app.reset();
    const editor = await givenAnEditor(app);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id);

    const recorded = await editor
      .post(`/api/tavole/${tavola.id}/listings`)
      .send({ positionId: null, drawn: true, part: aPart() })
      .expect(201);

    const response = await editor
      .post(`/api/parts/${recorded.body.listing.part.id}/photographs`)
      .set('Content-Type', 'image/jpeg')
      .send(await givenPhotographImage({ width: 1600, height: 1200 }))
      .expect(413);

    expect(response.body.error).toMatchObject({ code: 'payload_too_large' });
  });
});

describe('whose a Photograph is', () => {
  let app: TestApp;
  let partId: string;
  let subAssemblyId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const editor = await givenAnEditor(app);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id, { number: '2' });
    const recorded = await editor
      .post(`/api/tavole/${tavola.id}/listings`)
      .send({ positionId: null, drawn: true, part: aPart() })
      .expect(201);
    partId = recorded.body.listing.part.id;
    const [group] = await app.db
      .insert(subAssemblies)
      .values({ tavolaId: tavola.id, name: 'Window Slider' })
      .returning();
    subAssemblyId = group?.id as string;
  });

  /** A row as ingest would write one, owned as `owner` says. */
  function aPhotograph(owner: { partId?: string; subAssemblyId?: string }) {
    const id = randomUUID();
    return {
      id,
      ...owner,
      sequence: 0,
      sourceFormat: 'jpeg',
      sourceByteSize: 1,
      sourceWidth: 1,
      sourceHeight: 1,
      displayFormat: 'webp',
      displayByteSize: 1,
      displayWidth: 1,
      displayHeight: 1,
      previewByteSize: 1,
      originalKey: `photographs/${id}/original`,
      displayKey: `photographs/${id}/display`,
      previewKey: `photographs/${id}/preview`,
      uploadedAt: new Date(),
    };
  }

  async function refusal(owner: { partId?: string; subAssemblyId?: string }): Promise<unknown> {
    return app.db
      .insert(photographs)
      .values(aPhotograph(owner))
      .then(
        () => null,
        (error: unknown) => error,
      );
  }

  it('may be a Part’s or a Sub-assembly’s', async () => {
    await app.db.insert(photographs).values(aPhotograph({ partId }));
    await app.db.insert(photographs).values(aPhotograph({ subAssemblyId }));

    expect(await app.db.select().from(photographs)).toHaveLength(2);
  });

  it('is refused by the database when it would be both', async () => {
    expect(
      violates(await refusal({ partId, subAssemblyId }), 'photographs_belong_to_one_owner'),
    ).toBe(true);
  });

  it('is refused by the database when it would be nobody’s', async () => {
    expect(violates(await refusal({}), 'photographs_belong_to_one_owner')).toBe(true);
  });
});
