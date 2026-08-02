import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/test-app.js';

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

  it('reports the time from the injected clock, not the system clock', async () => {
    app.clock.setTo(new Date('2027-03-04T12:30:00.000Z'));

    const response = await app.request().get('/api/status').expect(200);

    expect(response.body.time).toBe('2027-03-04T12:30:00.000Z');
  });
});
