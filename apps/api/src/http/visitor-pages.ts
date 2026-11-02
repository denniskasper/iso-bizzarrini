import type { EnvironmentMode, VisitorSampleListed } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { VisitorService } from '../services/visitor-service.js';

/**
 * **The pages a search engine and a link preview may read** (issue #133, ADR 0019): the landing
 * and each Sample, at the same addresses the web app answers them on. This is where those two
 * are listed for a crawler, in `robots.txt` and the sitemap, and where what a forum shows of a
 * shared link is decided.
 */
export interface VisitorPages {
  /** `/robots.txt`. */
  robots: RequestHandler;
  /** `/sitemap.xml`. */
  sitemap: RequestHandler;
  /**
   * What the served page says about itself before any script runs, or `null` for a page that is
   * not a Visitor page — which is then served as it always was, saying nothing of what it is.
   */
  describe(pagePath: string): Promise<VisitorPage | null>;
}

/** Written into the page's head. Absent fields keep what the built app already says. */
export interface VisitorPage {
  /** Before the app's own name, which follows it. `null` on the landing, which is that name. */
  title: string | null;
  description: string | null;
  /** The address it is shared at, without whatever is after `?`. */
  url: string;
  image: { url: string; width: number | null; height: number | null } | null;
}

/**
 * **The landing's preview is the archive's large icon**, which the web app ships (ADR 0020): the
 * Club's emblem on graphite in production, and on a practice system the tinted roundel it wears
 * instead, so a shared link to one can never pass for the archive. An opaque square, legible on a
 * preview card of either colour, where the Club's white wordmark would vanish on a white one.
 * Nothing is dropped into the built app at deploy time.
 */
const LANDING_IMAGE = {
  production: '/icon-512.png',
  practice: '/practice/integration/icon-512.png',
};
const LANDING_IMAGE_SIZE = 512;

const samplePath = /^\/tavole\/([^/]+)\/?$/;
const tavolaId = z.uuid();

/**
 * What a renderer has to fetch to draw a Visitor page as a Visitor sees it. Crawlable and still
 * `noindex`: every answer under these is marked so, which keeps them out of the index while
 * letting the page they draw into it.
 */
const RENDERED_WITH = ['/assets/', '/theme.js', '/api/'];

export function createVisitorPages(dependencies: {
  visitorService: VisitorService;
  environmentMode: EnvironmentMode;
  publicUrl: string;
}): VisitorPages {
  const { visitorService, environmentMode } = dependencies;
  const origin = dependencies.publicUrl.replace(/\/+$/, '');
  const landingImage =
    environmentMode === 'production' ? LANDING_IMAGE.production : LANDING_IMAGE.practice;

  const addressOf = (sample: VisitorSampleListed) => `/tavole/${sample.tavola.id}`;

  const robots: RequestHandler = async (_request, response) => {
    response.type('text/plain');
    // A practice archive asks every crawler to keep away, as well as being `noindex` (ADR 0012).
    if (environmentMode !== 'production') {
      response.send('User-agent: *\nDisallow: /\n');
      return;
    }

    const samples = await visitorService.samples();
    const lines = [
      'User-agent: *',
      'Allow: /$',
      ...samples.flatMap((sample) => [
        `Allow: ${addressOf(sample)}$`,
        `Allow: ${sample.drawing.url}$`,
      ]),
      'Allow: /sitemap.xml$',
      ...RENDERED_WITH.map((prefix) => `Allow: ${prefix}`),
      'Disallow: /',
      '',
      `Sitemap: ${origin}/sitemap.xml`,
    ];
    response.send(`${lines.join('\n')}\n`);
  };

  const sitemap: RequestHandler = async (_request, response) => {
    // A practice archive lists nothing, for the same reason its `robots.txt` turns crawlers away.
    const entries =
      environmentMode === 'production'
        ? [
            `  <url><loc>${escapeMarkup(`${origin}/`)}</loc></url>`,
            ...(await visitorService.samples()).map(
              (sample) =>
                `  <url><loc>${escapeMarkup(`${origin}${addressOf(sample)}`)}</loc>` +
                `<image:image><image:loc>${escapeMarkup(`${origin}${sample.drawing.url}`)}` +
                `</image:loc></image:image></url>`,
            ),
          ]
        : [];

    response
      .type('application/xml')
      .send(
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
            'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
          ...entries,
          '</urlset>',
          '',
        ].join('\n'),
      );
  };

  return {
    robots,
    sitemap,

    async describe(pagePath) {
      if (pagePath === '/') {
        return {
          title: null,
          description: null,
          url: `${origin}/`,
          image: {
            url: `${origin}${landingImage}`,
            width: LANDING_IMAGE_SIZE,
            height: LANDING_IMAGE_SIZE,
          },
        };
      }

      const id = tavolaId.safeParse(samplePath.exec(pagePath)?.[1]);
      if (!id.success) {
        return null;
      }
      const sample = await visitorService.listedSample(id.data);
      if (!sample) {
        return null;
      }

      const { tavola, drawing } = sample;
      const car = `${tavola.model.brand} ${tavola.model.name}`;
      const fullCar = [
        car,
        tavola.model.series,
        tavola.model.modelYears ? `(${tavola.model.modelYears})` : null,
      ]
        .filter(Boolean)
        .join(' ');
      return {
        title: `Tavola ${tavola.number} · ${tavola.nameIt} — ${car}`,
        description:
          `${tavola.nameEn}: a factory parts drawing for the ${fullCar}, from the Club’s ` +
          'archive. Members read the Parts at every number.',
        url: `${origin}${addressOf(sample)}`,
        image: { url: `${origin}${drawing.url}`, width: drawing.width, height: drawing.height },
      };
    },
  };
}

/** For text and attribute values alike, in HTML and in XML. */
export function escapeMarkup(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
