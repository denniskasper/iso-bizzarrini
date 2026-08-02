import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { Router, type RequestHandler } from 'express';

/**
 * The built single-page app, served by the API — one deployable, not a service split (ADR 0008).
 *
 * Unset in development, where Vite serves the app instead. Returns `undefined` rather than
 * throwing so the API is usable on its own.
 */
export function createStaticSiteHandler(
  webDistPath: string | undefined,
): RequestHandler | undefined {
  if (!webDistPath) {
    return undefined;
  }

  const root = path.resolve(webDistPath);
  if (!existsSync(path.join(root, 'index.html'))) {
    throw new Error(
      `WEB_DIST_PATH is set to "${root}" but there is no index.html there. Build the web app first.`,
    );
  }

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
    response.sendFile(path.join(root, 'index.html'));
  });

  return router;
}
