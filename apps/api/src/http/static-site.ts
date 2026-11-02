import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EnvironmentMode } from '@ricambi/contracts';
import express, { Router, type RequestHandler } from 'express';
import type { Indexing } from './indexing.js';
import { escapeMarkup, type VisitorPage, type VisitorPages } from './visitor-pages.js';

/**
 * The built single-page app, served by the API — one deployable, not a service split (ADR 0008).
 *
 * Unset in development, where Vite serves the app instead. Returns `undefined` rather than
 * throwing so the API is usable on its own.
 */
export function createStaticSiteHandler(options: {
  webDistPath: string | undefined;
  environmentMode: EnvironmentMode;
  visitorPages: Pick<VisitorPages, 'describe'>;
  indexing: Indexing;
}): RequestHandler | undefined {
  if (!options.webDistPath) {
    return undefined;
  }

  const root = path.resolve(options.webDistPath);
  const indexPath = path.join(root, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(
      `WEB_DIST_PATH is set to "${root}" but there is no index.html there. Build the web app first.`,
    );
  }

  // Read and stamped once: the file does not change while the process lives, and the answer to
  // "which environment is this" changes even less.
  const index = stampEnvironment(readFileSync(indexPath, 'utf8'), options.environmentMode);
  const { visitorPages, indexing } = options;

  const router = Router();

  // Everything Vite emits under /assets carries a content hash, so it can be cached forever.
  router.use(
    '/assets',
    express.static(path.join(root, 'assets'), {
      immutable: true,
      maxAge: '1y',
      fallthrough: false,
    }),
  );

  // Never redirected to a folder: `/club` is the Administrator's Club screen as well as where the
  // Club's wordmark is kept (issue #209), and a reload there is owed the app, not `/club/`.
  router.use(express.static(root, { index: false, redirect: false, maxAge: '1h' }));

  // A deep link to a Position must survive a page reload, so unknown paths get the app itself.
  // A Visitor page says what it is in the markup, since a link preview runs no script (issue #133).
  router.get('/{*path}', async (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next();
      return;
    }
    const page = await visitorPages.describe(request.path);
    response.setHeader('Cache-Control', 'no-store');
    if (!page) {
      response.type('html').send(index.html(null));
      return;
    }
    const indexed = indexing.lift(response);
    response.type('html').send(describePage(index.html(page.title), page, indexed));
  });

  return router;
}

/**
 * Writes the environment into the document the browser is handed.
 *
 * It goes in the markup rather than into a fetch on purpose. A member deciding whether to trust
 * what they are reading should not have to wait for a request to find out it is practice data,
 * the banner must not flash in a moment after first paint, and an environment whose database is
 * unreachable must still say what it is. The app reads the answer off the document, exactly as
 * it does with the theme.
 *
 * Both markers are required. If the document has no `<html>` element or no `<title>`, this
 * refuses to serve rather than quietly serving an unmarked demo.
 */
function stampEnvironment(
  html: string,
  mode: EnvironmentMode,
): { html: (pageTitle: string | null) => string } {
  const htmlTag = /<html\b([^>]*)>/i;
  const titleTag = /<title>([\s\S]*?)<\/title>/i;

  if (!htmlTag.test(html) || !titleTag.test(html)) {
    throw new Error(
      'index.html must carry an <html> element and a <title>: they are where the environment ' +
        'is declared, and an unmarked non-production system is the failure this prevents.',
    );
  }

  const stamped = html.replace(htmlTag, `<html$1 data-environment-mode="${mode}">`);

  return {
    // A page's own title goes before the app's name, which is what a reader recognises it by.
    html: (pageTitle) =>
      stamped.replace(titleTag, (_match, title: string) => {
        const titled = pageTitle === null ? title : `${escapeMarkup(pageTitle)} — ${title}`;
        // DEMO first, because a browser tab truncates from the right.
        return `<title>${mode === 'production' ? titled : `DEMO — ${titled}`}</title>`;
      }),
  };
}

/**
 * **The head a link preview reads**: the title already set, and the description and picture in
 * the words both the Open Graph previews and search engines read. The built app's own `noindex`
 * goes only where the response itself was let into the index.
 */
function describePage(html: string, page: VisitorPage, indexed: boolean): string {
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const description = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i;
  const ownDescription = description.exec(html)?.[1] ?? null;
  const said = page.description === null ? ownDescription : escapeMarkup(page.description);

  const meta = (attribute: 'name' | 'property', key: string, content: string | null) =>
    content === null ? [] : [`<meta ${attribute}="${key}" content="${content}" />`];
  const image = page.image;
  const tags = [
    ...meta('property', 'og:type', 'website'),
    ...meta('property', 'og:title', title),
    ...meta('property', 'og:description', said),
    ...meta('property', 'og:url', escapeMarkup(page.url)),
    ...meta('property', 'og:image', image ? escapeMarkup(image.url) : null),
    ...meta('property', 'og:image:width', image?.width ? String(image.width) : null),
    ...meta('property', 'og:image:height', image?.height ? String(image.height) : null),
    ...meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
  ];

  let described = html;
  if (said !== null && ownDescription !== null) {
    described = described.replace(description, `<meta name="description" content="${said}" />`);
  } else if (said !== null) {
    tags.unshift(...meta('name', 'description', said));
  }
  if (indexed) {
    described = described.replace(/\s*<meta\s+name="robots"[^>]*>/i, '');
  }
  return described.replace(/<\/head>/i, `  ${tags.join('\n    ')}\n  </head>`);
}
