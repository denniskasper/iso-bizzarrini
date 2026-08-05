import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * What the browser is handed before a single line of JavaScript has run.
 *
 * The environment has to be on the page itself, not fetched afterwards: a member who is about
 * to trust what they are reading should not have to wait for a request to find out that they
 * are looking at practice data, and an environment whose API is down must still say so.
 */
const indexHtml = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <title>Ricambi</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

describe('the app as it is served', () => {
  let distPath: string;

  beforeAll(() => {
    distPath = mkdtempSync(path.join(tmpdir(), 'ricambi-web-dist-'));
    mkdirSync(path.join(distPath, 'assets'), { recursive: true });
    writeFileSync(path.join(distPath, 'index.html'), indexHtml);
  });

  afterAll(() => {
    rmSync(distPath, { recursive: true, force: true });
  });

  describe('a non-production environment', () => {
    let app: TestApp;

    beforeAll(async () => {
      app = await startTestApp({ env: { WEB_DIST_PATH: distPath } });
    });

    afterAll(async () => {
      await app.close();
    });

    it('says so in the page itself, before anything is fetched', async () => {
      const response = await app.request().get('/').expect(200);

      expect(response.text).toContain('data-environment-mode="non-production"');
    });

    it('puts DEMO in the title, so a browser tab is identifiable at a glance', async () => {
      const response = await app.request().get('/').expect(200);

      expect(response.text).toContain('<title>DEMO — Ricambi</title>');
    });

    it('says it on a deep link too, since that is how a shared address arrives', async () => {
      const response = await app.request().get('/tavola/207').expect(200);

      expect(response.text).toContain('data-environment-mode="non-production"');
      expect(response.text).toContain('DEMO');
    });
  });

  describe('production', () => {
    let app: TestApp;

    beforeAll(async () => {
      app = await startTestApp({
        env: {
          WEB_DIST_PATH: distPath,
          ENVIRONMENT_MODE: 'production',
          EDITOR_PASSWORD: '',
          // Production refuses to point invitations at a laptop, so it has to say where it is.
          PUBLIC_URL: 'https://ricambi.example',
        },
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('is the real archive and says nothing else', async () => {
      const response = await app.request().get('/').expect(200);

      expect(response.text).toContain('data-environment-mode="production"');
      expect(response.text).toContain('<title>Ricambi</title>');
      expect(response.text).not.toContain('DEMO');
    });
  });
});

describe('every response', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses to be indexed, because this archive is for members and no one else', async () => {
    const response = await app.request().get('/api/status').expect(200);

    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});
