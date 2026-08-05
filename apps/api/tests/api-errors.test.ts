import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

describe('how the API fails', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown API path with JSON, never an HTML error page', async () => {
    const member = await givenAnEditor(app);

    const response = await member.get('/api/tavole').expect('Content-Type', /json/).expect(404);

    expect(response.body.error).toMatchObject({ code: 'not_found' });
  });

  // Signed out, the same path is a 401 rather than a 404 — the gate is in front of the whole
  // API surface, so a stranger cannot map which addresses exist by reading the refusals.
  it('does not tell a stranger which API paths exist', async () => {
    const response = await app.request().get('/api/tavole').expect(401);

    expect(response.body.error).toMatchObject({ code: 'not_signed_in' });
  });

  it('does not announce the server it runs on', async () => {
    const response = await app.request().get('/api/status').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
