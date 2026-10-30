import type { SubAssemblyResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **A Sub-assembly read as one thing** (issue #110): its name, the Note an Editor wrote about it,
 * and its numbers, each with what sits at it.
 *
 * It is addressed under its Tavola, because that is the only place it exists: a *Door Lock* is
 * the door lock on this drawing, and an address that did not say which drawing would be one the
 * archive had to guess at. That also puts it behind everything a Tavola's address is behind — a
 * live Membership, and an Unchecked sheet being an Editor's alone.
 */
describe('a Sub-assembly’s page', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let editor: TestAgent;
  let member: TestAgent;
  let modelId: string;
  let tavolaId: string;

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
    modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
    tavolaId = (await givenTavola(app.db, modelId, { number: '12 bis' })).id;
  });

  interface Sheet {
    positions: { id: string; number: string }[];
    subAssemblies: { id: string; name: string }[];
  }

  async function givenPositions(...numbers: string[]): Promise<Map<string, string>> {
    let sheet: Sheet = { positions: [], subAssemblies: [] };
    for (const number of numbers) {
      const response = await editor
        .post(`/api/tavole/${tavolaId}/positions`)
        .send({ number })
        .expect(201);
      sheet = response.body as Sheet;
    }
    return new Map(sheet.positions.map((position) => [position.number, position.id]));
  }

  async function givenSubAssembly(name: string, positionIds: string[]): Promise<string> {
    const response = await editor
      .post(`/api/tavole/${tavolaId}/sub-assemblies`)
      .send({ name, positionIds })
      .expect(201);
    const found = (response.body as Sheet).subAssemblies.find((one) => one.name === name);
    if (!found) {
      throw new Error(`No Sub-assembly called ${name} came back.`);
    }
    return found.id;
  }

  async function givenListing(positionId: string, nameEn: string, drawn = true): Promise<void> {
    await editor
      .post(`/api/tavole/${tavolaId}/listings`)
      .send({
        positionId,
        drawn,
        part: {
          nameEn,
          nameIt: '',
          catalogNumber: '',
          disegnoOrigine: '',
          description: '',
          dimensions: '',
          materialFinish: '',
          catalogNote: '',
          note: '',
        },
      })
      .expect(201);
  }

  function pageOf(subAssemblyId: string, as: TestAgent = member, tavola = tavolaId) {
    return as.get(`/api/tavole/${tavola}/sub-assemblies/${subAssemblyId}`);
  }

  function writeNote(subAssemblyId: string, note: string | null, as: TestAgent = editor) {
    return as.put(`/api/sub-assemblies/${subAssemblyId}/note`).send({ note });
  }

  it('lists its numbers in the catalog’s order, each with the Parts at it', async () => {
    const numbers = await givenPositions('32', '30', '31', '40');
    const id = await givenSubAssembly('Window Slider', [
      numbers.get('32') ?? '',
      numbers.get('30') ?? '',
      numbers.get('31') ?? '',
    ]);
    await givenListing(numbers.get('30') ?? '', 'Guide rod');
    await givenListing(numbers.get('30') ?? '', 'Washer', false);
    await givenListing(numbers.get('32') ?? '', 'Channel');
    // Not in it, so not on its page.
    await givenListing(numbers.get('40') ?? '', 'Door handle');

    const response = await pageOf(id).expect(200);
    const page = response.body as SubAssemblyResponse;

    expect(page.subAssembly).toEqual({ id, name: 'Window Slider', note: null, photographs: [] });
    expect(
      page.positions.map((position) => ({
        number: position.number,
        parts: position.parts.map((part) => part.nameEn),
      })),
    ).toEqual([
      { number: '30', parts: ['Guide rod', 'Washer'] },
      // A number nobody has recorded anything at yet is still one of its numbers.
      { number: '31', parts: [] },
      { number: '32', parts: ['Channel'] },
    ]);
    expect(page.positions[0]?.id).toBe(numbers.get('30'));
  });

  describe('its Note', () => {
    it('is written, changed and cleared by an Editor, and read by a Member', async () => {
      const numbers = await givenPositions('30');
      const id = await givenSubAssembly('Door Lock', [numbers.get('30') ?? '']);

      const written = await writeNote(id, '  Rebuilt with the later striker plate.  ').expect(200);
      expect((written.body as SubAssemblyResponse).subAssembly.note).toBe(
        'Rebuilt with the later striker plate.',
      );
      expect(((await pageOf(id).expect(200)).body as SubAssemblyResponse).subAssembly.note).toBe(
        'Rebuilt with the later striker plate.',
      );

      await writeNote(id, 'The striker plate changed from chassis 310.').expect(200);
      expect(((await pageOf(id).expect(200)).body as SubAssemblyResponse).subAssembly.note).toBe(
        'The striker plate changed from chassis 310.',
      );

      // Blank is "not recorded", exactly as it is for a Part's Note.
      await writeNote(id, '   ').expect(200);
      expect(
        ((await pageOf(id).expect(200)).body as SubAssemblyResponse).subAssembly.note,
      ).toBeNull();
      await writeNote(id, 'Again.').expect(200);
      await writeNote(id, null).expect(200);
      expect(
        ((await pageOf(id).expect(200)).body as SubAssemblyResponse).subAssembly.note,
      ).toBeNull();
    });

    it('stays when more numbers are put into the Sub-assembly', async () => {
      const numbers = await givenPositions('30', '31');
      const id = await givenSubAssembly('Door Lock', [numbers.get('30') ?? '']);
      await writeNote(id, 'Fitted from the inside.').expect(200);

      await givenSubAssembly('Door Lock', [numbers.get('31') ?? '']);

      const page = (await pageOf(id).expect(200)).body as SubAssemblyResponse;
      expect(page.subAssembly.note).toBe('Fitted from the inside.');
      expect(page.positions.map((position) => position.number)).toEqual(['30', '31']);
    });

    it('is refused a Member', async () => {
      const numbers = await givenPositions('30');
      const id = await givenSubAssembly('Door Lock', [numbers.get('30') ?? '']);

      const response = await writeNote(id, 'Mine.', member).expect(403);
      expect(response.body.error?.code).toBe('forbidden');
      expect(
        ((await pageOf(id).expect(200)).body as SubAssemblyResponse).subAssembly.note,
      ).toBeNull();
    });

    it('is a 404 for a Sub-assembly there is not', async () => {
      await writeNote('00000000-0000-4000-8000-000000000000', 'Nothing.').expect(404);
    });
  });

  it('is a 404 under a Tavola it is not on, and once it is dissolved', async () => {
    const numbers = await givenPositions('30');
    const id = await givenSubAssembly('Door Lock', [numbers.get('30') ?? '']);
    const other = (await givenTavola(app.db, modelId, { number: '13' })).id;

    await pageOf(id, member, other).expect(404);

    await editor.delete(`/api/sub-assemblies/${id}`).expect(200);
    await pageOf(id).expect(404);
  });

  it('is an Editor’s alone while its Tavola is Unchecked', async () => {
    tavolaId = (await givenTavola(app.db, modelId, { number: '14', state: 'unchecked' })).id;
    const numbers = await givenPositions('30');
    const id = await givenSubAssembly('Door Lock', [numbers.get('30') ?? '']);

    await pageOf(id, editor).expect(200);
    await pageOf(id, member).expect(404);
  });

  it('is refused a lapsed Account, and a browser that has not signed in', async () => {
    const numbers = await givenPositions('30');
    const id = await givenSubAssembly('Door Lock', [numbers.get('30') ?? '']);
    await writeNote(id, 'Members only.').expect(200);
    const lapsed = (await givenAMember(app, administrator, { paidThrough: '2025-12-31' })).agent;

    const refused = await pageOf(id, lapsed).expect(403);
    expect(refused.body.error?.code).toBe('membership_lapsed');
    expect(JSON.stringify(refused.body)).not.toContain('Members only.');

    await app.request().get(`/api/tavole/${tavolaId}/sub-assemblies/${id}`).expect(401);
    await app.request().put(`/api/sub-assemblies/${id}/note`).send({ note: 'x' }).expect(401);
  });
});
