import type { MarkPoint, Sheet, TavolaScan } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Sub-assembly drawn round on the Scan** (issue #113): an ordered list of corners, in the
 * same fractions of the drawing a Mark is placed in, so it survives a re-scan at another
 * resolution and turns with the sheet.
 *
 * It is optional, at most one, and an Editor's: every Sub-assembly recorded before there were
 * outlines stays exactly as valid as it was.
 */
describe('a Sub-assembly’s outline', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let member: TestAgent;
  let tavolaId: string;
  let subAssemblyId: string;

  const triangle: MarkPoint[] = [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.3, y: 0.4 },
  ];

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
    editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12' })).id;

    const placed = await editor
      .post(`/api/tavole/${tavolaId}/marks`)
      .send({ number: '30', x: 0.3, y: 0.2 })
      .expect(201);
    const positionId = (placed.body as Sheet).positions[0]?.id ?? '';
    const grouped = await editor
      .post(`/api/tavole/${tavolaId}/sub-assemblies`)
      .send({ name: 'Door Lock', positionIds: [positionId] })
      .expect(201);
    subAssemblyId = (grouped.body as Sheet).subAssemblies[0]?.id ?? '';
  });

  function outline(corners: unknown, as: TestAgent = editor, id = subAssemblyId) {
    return as.put(`/api/sub-assemblies/${id}/outline`).send({ corners });
  }

  async function outlineOnTheSheet(as: TestAgent = member): Promise<MarkPoint[] | null> {
    const response = await as.get(`/api/tavole/${tavolaId}`).expect(200);
    const found = (response.body as Sheet).subAssemblies.find((one) => one.id === subAssemblyId);
    if (!found) {
      throw new Error('The Sub-assembly is not on the sheet.');
    }
    return found.outline;
  }

  it('is none until an Editor draws one, and the Sub-assembly is as valid without it', async () => {
    expect(await outlineOnTheSheet()).toBeNull();
    const page = await member.get(`/api/tavole/${tavolaId}/sub-assemblies/${subAssemblyId}`);
    expect(page.status).toBe(200);
  });

  it('is accepted with three corners inside the Scan, in order, and read by a Member', async () => {
    const response = await outline(triangle).expect(200);

    // Answered with the sheet, like every other write to what is drawn on it.
    const answered = (response.body as Sheet).subAssemblies[0];
    expect(answered?.outline).toEqual(triangle);
    expect(await outlineOnTheSheet()).toEqual(triangle);
  });

  it('takes corners on the very edges of the Scan', async () => {
    const edges = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    await outline(edges).expect(200);
    expect(await outlineOnTheSheet()).toEqual(edges);
  });

  it('is refused with fewer than three corners', async () => {
    const response = await outline(triangle.slice(0, 2)).expect(400);
    expect(JSON.stringify(response.body.error)).toMatch(/at least three corners/);
    await outline([]).expect(400);
    expect(await outlineOnTheSheet()).toBeNull();
  });

  it('is refused with a corner outside the Scan', async () => {
    await outline([...triangle, { x: 1.2, y: 0.5 }]).expect(400);
    await outline([...triangle, { x: 0.5, y: -0.01 }]).expect(400);
    await outline([{ x: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.3, y: 0.4 }]).expect(400);
    expect(await outlineOnTheSheet()).toBeNull();
  });

  it('is replaced by the next one drawn, so there is never more than one', async () => {
    await outline(triangle).expect(200);
    const square = [
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.6, y: 0.6 },
      { x: 0.2, y: 0.6 },
    ];
    await outline(square).expect(200);
    expect(await outlineOnTheSheet()).toEqual(square);
  });

  it('is removed by an Editor, and the Sub-assembly stays', async () => {
    await outline(triangle).expect(200);

    const response = await editor.delete(`/api/sub-assemblies/${subAssemblyId}/outline`);
    expect(response.status).toBe(200);
    expect((response.body as Sheet).subAssemblies[0]?.outline).toBeNull();
    expect(await outlineOnTheSheet()).toBeNull();
  });

  it('may overlap another Sub-assembly’s', async () => {
    const placed = await editor
      .post(`/api/tavole/${tavolaId}/marks`)
      .send({ number: '31', x: 0.35, y: 0.25 })
      .expect(201);
    const position = (placed.body as Sheet).positions.find((one) => one.number === '31');
    const grouped = await editor
      .post(`/api/tavole/${tavolaId}/sub-assemblies`)
      .send({ name: 'Window Slider', positionIds: [position?.id] })
      .expect(201);
    const other = (grouped.body as Sheet).subAssemblies.find((one) => one.name !== 'Door Lock');

    await outline(triangle).expect(200);
    await outline(triangle, editor, other?.id).expect(200);
  });

  it('is a 404 for a Sub-assembly there is not', async () => {
    await outline(triangle, editor, '00000000-0000-4000-8000-000000000000').expect(404);
    await editor
      .delete('/api/sub-assemblies/00000000-0000-4000-8000-000000000000/outline')
      .expect(404);
  });

  it('is refused a Member, drawn or removed', async () => {
    await outline(triangle, member).expect(403);
    await outline(triangle).expect(200);
    await member.delete(`/api/sub-assemblies/${subAssemblyId}/outline`).expect(403);
    expect(await outlineOnTheSheet()).toEqual(triangle);
  });

  it('is not given to a lapsed Account, nor to a browser that has not signed in', async () => {
    await outline(triangle).expect(200);
    const lapsed = (await givenAMember(app, administrator, { paidThrough: '2025-12-31' })).agent;

    const refused = await lapsed.get(`/api/tavole/${tavolaId}`).expect(403);
    expect(refused.body.error?.code).toBe('membership_lapsed');
    expect(JSON.stringify(refused.body)).not.toContain('outline');

    await app.request().get(`/api/tavole/${tavolaId}`).expect(401);
    await app
      .request()
      .put(`/api/sub-assemblies/${subAssemblyId}/outline`)
      .send({ corners: triangle })
      .expect(401);
  });

  it('turns with the drawing, as its Marks do', async () => {
    const scan = await givenScanImage({ width: 600, height: 400 });
    await editor
      .put(`/api/tavole/${tavolaId}/scan`)
      .set('Content-Type', 'image/png')
      .send(scan)
      .expect(201);
    await outline(triangle).expect(200);

    const turned = await editor
      .post(`/api/tavole/${tavolaId}/scan/turns`)
      .send({ direction: 'clockwise' })
      .expect(200);
    expect((turned.body.scan as TavolaScan).width).toBe(400);

    // (x, y) → (1 − y, x), corner by corner and in the same order.
    const clockwise = (await outlineOnTheSheet(editor)) ?? [];
    expect(clockwise.map((corner) => [corner.x, corner.y])).toEqual([
      [expect.closeTo(0.9), expect.closeTo(0.1)],
      [expect.closeTo(0.9), expect.closeTo(0.5)],
      [expect.closeTo(0.6), expect.closeTo(0.3)],
    ]);

    await editor
      .post(`/api/tavole/${tavolaId}/scan/turns`)
      .send({ direction: 'anticlockwise' })
      .expect(200);
    const back = (await outlineOnTheSheet(editor)) ?? [];
    expect(back.map((corner) => [corner.x, corner.y])).toEqual(
      triangle.map((corner) => [expect.closeTo(corner.x), expect.closeTo(corner.y)]),
    );
  });

  it('goes when its Sub-assembly is dissolved', async () => {
    await outline(triangle).expect(200);
    await editor.delete(`/api/sub-assemblies/${subAssemblyId}`).expect(200);
    await outline(triangle).expect(404);
  });
});
