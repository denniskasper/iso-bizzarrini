import type { TavolaResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Typed numbers** (issue #250): a drawing that stands upright while the factory printed its
 * numbers sideways to it. An Editor has every Mark's number typed upright over the print, for the
 * whole Tavola, and every reader sees it the same way. Nothing is turned and the Scan is never
 * touched, so all the archive keeps is a yes or a no on the Tavola.
 */
describe('typed numbers on a Tavola', () => {
  let app: TestApp;
  let editor: TestAgent;
  let member: TestAgent;
  let tavolaId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    const administrator = await givenAnAdministrator(app);
    editor = (await givenAMember(app, administrator.agent, { name: 'An Editor', role: 'editor' }))
      .agent;
    member = (await givenAMember(app, administrator.agent)).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12' })).id;
  });

  function typedNumbers(typed: unknown, as: TestAgent = editor) {
    return as.put(`/api/tavole/${tavolaId}/typed-numbers`).send({ typedNumbers: typed });
  }

  async function readAs(as: TestAgent): Promise<TavolaResponse> {
    return (await as.get(`/api/tavole/${tavolaId}`).expect(200)).body as TavolaResponse;
  }

  it('is off until an Editor turns it on', async () => {
    expect((await readAs(member)).tavola.typedNumbers).toBe(false);
  });

  it('is turned on by an Editor, and then every reader sees it', async () => {
    const response = await typedNumbers(true).expect(200);
    expect(response.body).toEqual({ typedNumbers: true });

    expect((await readAs(member)).tavola.typedNumbers).toBe(true);
    expect((await readAs(editor)).tavola.typedNumbers).toBe(true);
  });

  it('is turned off again on a Published Tavola, and the factory print is back for everybody', async () => {
    await typedNumbers(true).expect(200);
    await typedNumbers(false).expect(200);

    expect((await readAs(member)).tavola.typedNumbers).toBe(false);
  });

  it('can be chosen while the Tavola is still Unchecked', async () => {
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Rivolta' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '3', state: 'unchecked' })).id;

    await typedNumbers(true).expect(200);
    expect((await readAs(editor)).tavola.typedNumbers).toBe(true);
  });

  it('leaves each Mark’s own legibility as it was', async () => {
    const placed = await editor
      .post(`/api/tavole/${tavolaId}/marks`)
      .send({ number: '1', x: 0.2, y: 0.2 })
      .expect(201);
    const [mark] = placed.body.positions[0].marks;
    await editor.put(`/api/marks/${mark.id}/legibility`).send({ illegible: true }).expect(200);

    await typedNumbers(true).expect(200);
    await typedNumbers(false).expect(200);

    expect((await readAs(member)).positions[0]?.marks[0]?.illegible).toBe(true);
  });

  it('is an Editor’s to change, and refused to a Member', async () => {
    await typedNumbers(true, member).expect(403);
    await app
      .request()
      .put(`/api/tavole/${tavolaId}/typed-numbers`)
      .send({ typedNumbers: true })
      .expect(401);

    expect((await readAs(member)).tavola.typedNumbers).toBe(false);
  });

  it('is a yes or a no', async () => {
    await typedNumbers('sideways').expect(400);
    await typedNumbers(undefined).expect(400);
  });

  it('answers that there is no such Tavola', async () => {
    tavolaId = '00000000-0000-4000-8000-000000000000';
    await typedNumbers(true).expect(404);
  });
});
