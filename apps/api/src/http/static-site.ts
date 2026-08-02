import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { EnvironmentMode } from '@ricambi/contracts';
import express, { Router, type RequestHandler } from 'express';

/**
 * The built single-page app, served by the API — one deployable, not a service split (ADR 0008).
 *
 * Unset in development, where Vite serves the app instead. Returns `undefined` rather than
 * throwing so the API is usable on its own.
 */
export function createStaticSiteHandler(options: {
  webDistPath: string | undefined;
  environmentMode: EnvironmentMode;
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

  router.use(express.static(root, { index: false, maxAge: '1h' }));

  // A deep link to a Position must survive a page reload, so unknown paths get the app itself.
  router.get('/{*path}', (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      next();
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.type('html').send(index);
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
function stampEnvironment(html: string, mode: EnvironmentMode): string {
  const htmlTag = /<html\b([^>]*)>/i;
  const titleTag = /<title>([\s\S]*?)<\/title>/i;

  if (!htmlTag.test(html) || !titleTag.test(html)) {
    throw new Error(
      'index.html must carry an <html> element and a <title>: they are where the environment ' +
        'is declared, and an unmarked non-production system is the failure this prevents.',
    );
  }

  const stamped = html.replace(htmlTag, `<html$1 data-environment-mode="${mode}">`);
  if (mode === 'production') {
    return stamped;
  }

  // DEMO first, because a browser tab truncates from the right.
  return stamped.replace(titleTag, (_match, title: string) => `<title>DEMO — ${title}</title>`);
}
