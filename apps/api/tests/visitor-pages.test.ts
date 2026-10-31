import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **What a search engine and a link preview find** (issue #133, ADR 0019): only the landing page
 * and the Samples may be indexed, and only in production; and the page for each carries its own
 * title, description and picture in the markup, because a forum's preview never runs the app.
 *
 * Asserted as a crawler reads them: the headers, the markup, `robots.txt` and the sitemap.
 */
const indexHtml = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta name="robots" content="noindex, nofollow" />
    <meta name="description" content="Ricambi — the Club's parts reference for Iso and Bizzarrini cars." />
    <title>Ricambi</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

const PUBLIC_URL = 'https://ricambi.example';

let distPath: string;

beforeAll(() => {
  distPath = mkdtempSync(path.join(tmpdir(), 'ricambi-web-dist-'));
  mkdirSync(path.join(distPath, 'assets'), { recursive: true });
  writeFileSync(path.join(distPath, 'index.html'), indexHtml);
  // The Club's logo is dropped in at deploy time, never committed; any picture stands in here.
  writeFileSync(path.join(distPath, 'club-logo.png'), 'not really a picture');
});

afterAll(() => {
  rmSync(distPath, { recursive: true, force: true });
});

/** A Tavola shown to Visitors, and one beside it that is not. */
async function givenASampleAndAnother(app: TestApp) {
  const administrator: TestAgent = (await givenAnAdministrator(app)).agent;
  const modelId = (
    await givenModel(app.db, {
      brand: 'Iso',
      name: 'Grifo',
      series: 'GL 365',
      modelYears: '1965–68',
    })
  ).id;

  async function givenScanned(number: string, nameIt: string, nameEn: string) {
    const id = (await givenTavola(app.db, modelId, { number, nameIt, nameEn })).id;
    await administrator
      .put(`/api/tavole/${id}/scan`)
      .set('Content-Type', 'image/png')
      .send(await givenScanImage({ width: 3000, height: 2000 }))
      .expect(201);
    return id;
  }

  const sampleId = await givenScanned('12', 'Impianto freni', 'Brake system <front & rear>');
  const otherId = await givenScanned('13', 'Sospensione segreta', 'Secret suspension');
  const marked = await administrator
    .post(`/api/tavole/${sampleId}/marks`)
    .send({ number: '7', x: 0.4, y: 0.6 })
    .expect(201);
  const seven = (marked.body.positions as { id: string; number: string }[]).find(
    (position) => position.number === '7',
  )!.id;
  const shown = await administrator
    .put(`/api/tavole/${sampleId}/sample`)
    .send({ positionId: seven })
    .expect(200);

  return {
    administrator,
    sampleId,
    otherId,
    drawingUrl: shown.body.sample.drawing.url as string,
  };
}

function metaContent(html: string, attribute: 'name' | 'property', key: string): string | null {
  const match = new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`).exec(html);
  return match?.[1] ?? null;
}

describe('production', () => {
  let app: TestApp;
  let sample: Awaited<ReturnType<typeof givenASampleAndAnother>>;

  beforeAll(async () => {
    app = await startTestApp({
      env: { WEB_DIST_PATH: distPath, ENVIRONMENT_MODE: 'production', PUBLIC_URL },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    sample = await givenASampleAndAnother(app);
  });

  describe('indexing', () => {
    it('lets the landing page be indexed', async () => {
      const response = await app.request().get('/').expect(200);

      expect(response.headers['x-robots-tag']).toBeUndefined();
      expect(response.text).not.toContain('noindex');
    });

    it('lets a Sample be indexed, and the public copy of its drawing', async () => {
      const page = await app.request().get(`/tavole/${sample.sampleId}`).expect(200);
      const drawing = await app.request().get(sample.drawingUrl).expect(200);

      expect(page.headers['x-robots-tag']).toBeUndefined();
      expect(page.text).not.toContain('noindex');
      expect(drawing.headers['x-robots-tag']).toBeUndefined();
    });

    it('keeps every other page, address and answer out of the index', async () => {
      const responses = await Promise.all([
        app.request().get(`/tavole/${sample.otherId}`),
        app.request().get('/sign-in'),
        app.request().get('/privacy'),
        app.request().get(`/tavole/${sample.sampleId}/sub-assemblies/${sample.otherId}`),
        app.request().get('/api/landing'),
        app.request().get(`/api/landing/samples/${sample.sampleId}`),
        app.request().get(`/api/tavole/${sample.sampleId}`),
        app.request().get('/api/sample-drawings/00000000-0000-4000-8000-000000000000'),
        app.request().get('/api/status'),
        app.request().get('/robots.txt'),
        app.request().get('/sitemap.xml'),
      ]);

      for (const response of responses) {
        expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
      }
      expect(responses[0]!.text).toContain('<meta name="robots" content="noindex, nofollow"');
    });

    it('stops a Tavola being indexed the moment it stops being a Sample', async () => {
      await sample.administrator.delete(`/api/tavole/${sample.sampleId}/sample`).expect(204);

      const page = await app.request().get(`/tavole/${sample.sampleId}`).expect(200);
      expect(page.headers['x-robots-tag']).toBe('noindex, nofollow');
    });
  });

  describe('robots.txt and the sitemap', () => {
    it('lets a crawler reach the landing and the Samples, and no other page', async () => {
      const response = await app.request().get('/robots.txt').expect(200);
      const allowed = response.text
        .split('\n')
        .filter((line) => line.startsWith('Allow: ') && line.endsWith('$'))
        .map((line) => line.slice('Allow: '.length, -1));

      expect(response.headers['content-type']).toMatch(/text\/plain/);
      expect(allowed.sort()).toEqual(
        ['/', `/tavole/${sample.sampleId}`, sample.drawingUrl, '/sitemap.xml'].sort(),
      );
      expect(response.text).toContain('Disallow: /\n');
      expect(response.text).toContain(`Sitemap: ${PUBLIC_URL}/sitemap.xml`);
      expect(response.text).not.toContain(sample.otherId);
    });

    it('lists exactly the landing and the current Samples in the sitemap', async () => {
      const response = await app.request().get('/sitemap.xml').expect(200);
      const pages = [...response.text.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);

      expect(response.headers['content-type']).toMatch(/xml/);
      expect(pages).toEqual([`${PUBLIC_URL}/`, `${PUBLIC_URL}/tavole/${sample.sampleId}`]);
      expect(response.text).toContain(`<image:loc>${PUBLIC_URL}${sample.drawingUrl}</image:loc>`);
    });

    it('drops a Sample from both once it is withdrawn', async () => {
      await sample.administrator.delete(`/api/tavole/${sample.sampleId}/sample`).expect(204);

      const robots = await app.request().get('/robots.txt').expect(200);
      const sitemap = await app.request().get('/sitemap.xml').expect(200);
      expect(robots.text).not.toContain(sample.sampleId);
      expect(sitemap.text).not.toContain(sample.sampleId);
      expect(sitemap.text).toContain(`<loc>${PUBLIC_URL}/</loc>`);
    });
  });

  describe('link previews', () => {
    it('gives the landing a title, a description and the Club’s logo', async () => {
      const html = (await app.request().get('/').expect(200)).text;

      expect(html).toContain('<title>Ricambi</title>');
      expect(metaContent(html, 'property', 'og:title')).toBe('Ricambi');
      expect(metaContent(html, 'property', 'og:description')).toMatch(/Iso and Bizzarrini/);
      expect(metaContent(html, 'name', 'description')).toMatch(/Iso and Bizzarrini/);
      expect(metaContent(html, 'property', 'og:image')).toBe(`${PUBLIC_URL}/club-logo.png`);
      expect(metaContent(html, 'property', 'og:url')).toBe(`${PUBLIC_URL}/`);
    });

    it('gives a Sample its own title, description and its public drawing', async () => {
      const html = (await app.request().get(`/tavole/${sample.sampleId}?position=7`).expect(200))
        .text;

      const title = 'Tavola 12 · Impianto freni — Iso Grifo — Ricambi';
      expect(html).toContain(`<title>${title}</title>`);
      expect(metaContent(html, 'property', 'og:title')).toBe(title);
      expect(metaContent(html, 'property', 'og:description')).toBe(
        'Brake system &lt;front &amp; rear&gt;: a factory parts drawing for the Iso Grifo GL 365 ' +
          '(1965–68), from the Club’s archive. Members read the Parts at every number.',
      );
      expect(metaContent(html, 'property', 'og:image')).toBe(`${PUBLIC_URL}${sample.drawingUrl}`);
      expect(metaContent(html, 'property', 'og:url')).toBe(
        `${PUBLIC_URL}/tavole/${sample.sampleId}`,
      );
      expect(metaContent(html, 'name', 'twitter:card')).toBe('summary_large_image');
    });

    it('says nothing of a Tavola that is not a Sample, not even its name', async () => {
      const html = (await app.request().get(`/tavole/${sample.otherId}`).expect(200)).text;

      expect(html).not.toContain('Sospensione');
      expect(html).not.toContain('Secret');
      expect(html).not.toContain('og:image');
      expect(html).toContain('<title>Ricambi</title>');
    });
  });
});

describe('a non-production environment', () => {
  let app: TestApp;
  let sample: Awaited<ReturnType<typeof givenASampleAndAnother>>;

  beforeAll(async () => {
    app = await startTestApp({ env: { WEB_DIST_PATH: distPath, PUBLIC_URL } });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    sample = await givenASampleAndAnother(app);
  });

  it('keeps every page out of the index, the landing and the Samples too', async () => {
    const responses = await Promise.all([
      app.request().get('/'),
      app.request().get(`/tavole/${sample.sampleId}`),
      app.request().get(sample.drawingUrl),
      app.request().get(`/tavole/${sample.otherId}`),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
    expect(responses[0]!.text).toContain('<meta name="robots" content="noindex, nofollow"');
    expect(responses[1]!.text).toContain('<meta name="robots" content="noindex, nofollow"');
  });

  it('turns every crawler away and lists nothing', async () => {
    const robots = await app.request().get('/robots.txt').expect(200);
    const sitemap = await app.request().get('/sitemap.xml').expect(200);

    expect(robots.text).toBe('User-agent: *\nDisallow: /\n');
    expect(sitemap.text).not.toContain('<loc>');
  });

  it('still previews a shared Sample, marked as practice', async () => {
    const html = (await app.request().get(`/tavole/${sample.sampleId}`).expect(200)).text;

    expect(html).toContain(
      '<title>DEMO — Tavola 12 · Impianto freni — Iso Grifo — Ricambi</title>',
    );
    expect(metaContent(html, 'property', 'og:image')).toBe(`${PUBLIC_URL}${sample.drawingUrl}`);
  });
});
