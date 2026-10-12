import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readBuild } from '../src/platform/build.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/** The one place the Version is written (ADR 0016). */
const rootPackageJson = new URL('../../../package.json', import.meta.url);

describe('service status', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
  });

  it('reports which environment it is, so nobody mistakes one for another', async () => {
    const response = await app.request().get('/api/status').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      environment: 'test',
      database: 'reachable',
    });
  });

  it('calls itself non-production unless it has been told it is the real archive', async () => {
    const response = await app.request().get('/api/status').expect(200);

    expect(response.body.mode).toBe('non-production');
  });

  it('calls itself production only when the environment says so', async () => {
    const production = await startTestApp({
      env: {
        ENVIRONMENT_MODE: 'production',
        // Production refuses to point invitations at a laptop, so it has to say where it is.
        PUBLIC_URL: 'https://ricambi.example',
      },
    });
    try {
      const response = await production.request().get('/api/status').expect(200);

      expect(response.body.mode).toBe('production');
    } finally {
      await production.close();
    }
  });

  it('reports the time from the injected clock, not the system clock', async () => {
    app.clock.setTo(new Date('2027-03-04T12:30:00.000Z'));

    const response = await app.request().get('/api/status').expect(200);

    expect(response.body.time).toBe('2027-03-04T12:30:00.000Z');
  });

  it('reports the Version written in the root package.json, and no commit it was not told', async () => {
    const { version } = JSON.parse(await readFile(rootPackageJson, 'utf8')) as { version: string };

    const response = await app.request().get('/api/status').expect(200);

    expect(response.body.version).toBe(version);
    expect(response.body.commit).toBeNull();
  });

  describe('built from a known commit', () => {
    let root: string;

    beforeAll(async () => {
      root = await mkdtemp(join(tmpdir(), 'ricambi-build-'));
      await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.4.0' }));
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    async function statusOfBuildWithCommit(commit: string) {
      await writeFile(join(root, 'commit'), commit);
      const built = await startTestApp({ build: readBuild(pathToFileURL(`${root}/`)) });
      try {
        return (await built.request().get('/api/status').expect(200)).body;
      } finally {
        await built.close();
      }
    }

    it('reports the commit the image was told it was built from', async () => {
      const status = await statusOfBuildWithCommit('a86c067e4f2d0c3b5a1e9f8d7c6b5a4e3d2c1b0a\n');

      expect(status).toMatchObject({
        version: '0.4.0',
        commit: 'a86c067e4f2d0c3b5a1e9f8d7c6b5a4e3d2c1b0a',
      });
    });

    it('reports no commit rather than whatever it was told, when that is not one', async () => {
      const status = await statusOfBuildWithCommit('ref: refs/heads/main\n');

      expect(status.commit).toBeNull();
    });
  });
});
