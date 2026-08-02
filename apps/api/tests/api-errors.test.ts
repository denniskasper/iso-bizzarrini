import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    const response = await app
      .request()
      .get('/api/tavole')
      .expect('Content-Type', /json/)
      .expect(404);

    expect(response.body.error).toMatchObject({ code: 'not_found' });
  });

  it('does not announce the server it runs on', async () => {
    const response = await app.request().get('/api/status').expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
