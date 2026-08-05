import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * What belongs with a number: the Sub-assembly it sits in, and the one part it works against.
 *
 * **Two mechanisms, because they answer two different questions.** A Sub-assembly is the broad
 * one — *Window Slider*, eleven numbers — and a Related Position is the narrow, hand-picked
 * pointer from the guide rod to the single channel it runs in. A member taking a door apart wants
 * the first; a member deciding what else to order wants the second, and neither substitutes for
 * the other.
 *
 * Two rules run through everything below. A Position belongs to **at most one**, so naming it into
 * a second moves it rather than adding it. And a link is **symmetric and is one row**,
 * so recording it from either end makes it visible from both — which is what "nobody has to
 * remember to enter it twice" means at the point of entry as well as at the point of reading.
 */
describe('what belongs with a number', () => {
  let app: TestApp;
  let editor: TestAgent;
  let tavolaId: string;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await givenAnEditor(app);
    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    tavolaId = (await givenTavola(app.db, model.id, { number: '12 bis' })).id;
  });

  interface Sheet {
    positions: {
      id: string;
      number: string;
      subAssemblyId: string | null;
      related: { id: string; positionId: string }[];
    }[];
    subAssemblies: { id: string; name: string }[];
  }

  /** Numbers on the sheet, recorded the way an Editor records one the drawing does not show. */
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

  /** The sheet as a member reading the drawing gets it — the whole of what a write answers with. */
  async function sheetOf(id = tavolaId): Promise<Sheet> {
    const response = await editor.get(`/api/tavole/${id}`).expect(200);
    const { positions, subAssemblies } = response.body as Sheet;
    return { positions, subAssemblies };
  }

  function positionNumbered(sheet: Sheet, number: string) {
    const found = sheet.positions.find((position) => position.number === number);
    if (!found) {
      throw new Error(`The sheet has no number ${number} on it.`);
    }
    return found;
  }

  /** The numbers in one, read the way a screen reads them: off the sheet's own Positions. */
  function numbersIn(sheet: Sheet, subAssemblyId: string): string[] {
    return sheet.positions
      .filter((position) => position.subAssemblyId === subAssemblyId)
      .map((position) => position.number);
  }

  function putIn(tavola: string, name: string, positionIds: string[]) {
    return editor.post(`/api/tavole/${tavola}/sub-assemblies`).send({ name, positionIds });
  }

  function relate(tavola: string, positionId: string, otherPositionId: string) {
    return editor
      .post(`/api/tavole/${tavola}/related-positions`)
      .send({ positionId, otherPositionId });
  }

  describe('a Sub-assembly', () => {
    it('holds the numbers an Editor named it with, and answers with the sheet', async () => {
      const numbers = await givenPositions('30', '31', '32', '40');

      const response = await putIn(tavolaId, 'Window Slider', [
        numbers.get('30') ?? '',
        numbers.get('31') ?? '',
        numbers.get('32') ?? '',
      ]).expect(201);

      const sheet = response.body as Sheet;
      expect(sheet.subAssemblies).toEqual([{ id: expect.any(String), name: 'Window Slider' }]);
      expect(numbersIn(sheet, sheet.subAssemblies[0]?.id ?? '')).toEqual(['30', '31', '32']);
      expect(sheet).toEqual(await sheetOf());
    });

    /**
     * **It is a name and not a bill of materials** (spec, Out of Scope). There is no number on it,
     * nothing to order it by, and no way to nest one inside another — a Sub-assembly holds
     * Positions and a Position holds nothing. The shape is the enforcement: no field to sort by.
     */
    it('carries a name and nothing else — no number, and nothing to order it by', async () => {
      const numbers = await givenPositions('30');

      const response = await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '']).expect(201);

      const [subAssembly] = (response.body as Sheet).subAssemblies;
      expect(Object.keys(subAssembly ?? {}).sort()).toEqual(['id', 'name']);
    });

    // A number is in one Sub-assembly or in none. Membership is a column and not a join table, so
    // the second claim on a number is a move rather than a second membership.
    it('takes a number out of the one it was in when it is named into another', async () => {
      const numbers = await givenPositions('30', '31');
      await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '', numbers.get('31') ?? '']).expect(
        201,
      );

      const response = await putIn(tavolaId, 'Window Slider', [numbers.get('31') ?? '']).expect(
        201,
      );

      const sheet = response.body as Sheet;
      const named = (name: string) =>
        sheet.subAssemblies.find((one) => one.name === name)?.id ?? '';
      expect(numbersIn(sheet, named('Door Lock'))).toEqual(['30']);
      expect(numbersIn(sheet, named('Window Slider'))).toEqual(['31']);
    });

    // Two *Door Lock*s on one sheet would be one Sub-assembly somebody recorded twice, and reading
    // them as two would split the very numbers it exists to hold together.
    it('is one Sub-assembly however many times its name is typed', async () => {
      const numbers = await givenPositions('30', '31');
      await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '']).expect(201);

      const response = await putIn(tavolaId, 'Door Lock', [numbers.get('31') ?? '']).expect(201);

      const sheet = response.body as Sheet;
      expect(sheet.subAssemblies).toHaveLength(1);
      expect(numbersIn(sheet, sheet.subAssemblies[0]?.id ?? '')).toEqual(['30', '31']);
    });

    /**
     * One with nothing in it is a name pointing at nothing. Sweeping it is what makes renaming
     * possible at all: record the same numbers under the right name, and the wrong one goes by
     * itself.
     */
    it('stops existing when its last number leaves it', async () => {
      const numbers = await givenPositions('30');
      await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '']).expect(201);

      const response = await putIn(tavolaId, 'Window Slider', [numbers.get('30') ?? '']).expect(
        201,
      );

      expect((response.body as Sheet).subAssemblies).toEqual([
        { id: expect.any(String), name: 'Window Slider' },
      ]);
    });

    it('lets a number be taken out of it on its own', async () => {
      const numbers = await givenPositions('30', '31');
      await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '', numbers.get('31') ?? '']).expect(
        201,
      );

      const response = await editor
        .delete(`/api/positions/${numbers.get('30') ?? ''}/sub-assembly`)
        .expect(200);

      const sheet = response.body as Sheet;
      expect(positionNumbered(sheet, '30').subAssemblyId).toBeNull();
      expect(numbersIn(sheet, sheet.subAssemblies[0]?.id ?? '')).toEqual(['31']);
    });

    // Dissolving one is not deleting the numbers that were in it.
    it('is dissolved without taking its numbers with it', async () => {
      const numbers = await givenPositions('30', '31');
      const created = await putIn(tavolaId, 'Door Lock', [
        numbers.get('30') ?? '',
        numbers.get('31') ?? '',
      ]).expect(201);
      const [subAssembly] = (created.body as Sheet).subAssemblies;

      const response = await editor
        .delete(`/api/sub-assemblies/${subAssembly?.id ?? ''}`)
        .expect(200);

      const sheet = response.body as Sheet;
      expect(sheet.subAssemblies).toEqual([]);
      expect(sheet.positions.map((position) => position.number)).toEqual(['30', '31']);
      expect(sheet.positions.every((position) => position.subAssemblyId === null)).toBe(true);
    });

    it('is a 404 once it is dissolved', async () => {
      const numbers = await givenPositions('30');
      const created = await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '']).expect(201);
      const id = (created.body as Sheet).subAssemblies[0]?.id ?? '';

      await editor.delete(`/api/sub-assemblies/${id}`).expect(200);
      await editor.delete(`/api/sub-assemblies/${id}`).expect(404);
    });

    it('refuses one with no numbers in it', async () => {
      await givenPositions('30');

      const response = await putIn(tavolaId, 'Door Lock', []).expect(400);
      expect(response.body.error).toMatchObject({ code: 'validation_failed' });
    });

    it('refuses one with no name at all', async () => {
      const numbers = await givenPositions('30');

      await putIn(tavolaId, '   ', [numbers.get('30') ?? '']).expect(400);
    });

    // A Sub-assembly holds numbers **within one Tavola**. One reaching across sheets would be a
    // claim about two drawings that neither of them could show.
    it('cannot reach a number on another sheet', async () => {
      const numbers = await givenPositions('30');
      const other = await givenTavola(
        app.db,
        (await givenModel(app.db, { brand: 'Iso', name: 'Fidia' })).id,
        { number: '3' },
      );
      const elsewhere = await editor
        .post(`/api/tavole/${other.id}/positions`)
        .send({ number: '90' })
        .expect(201);

      await putIn(tavolaId, 'Door Lock', [
        numbers.get('30') ?? '',
        (elsewhere.body as Sheet).positions[0]?.id ?? '',
      ]).expect(404);

      // And nothing was written on the way to refusing.
      expect((await sheetOf()).subAssemblies).toEqual([]);
    });

    it('cannot be recorded or dissolved by someone who has not signed in', async () => {
      const numbers = await givenPositions('30');
      const created = await putIn(tavolaId, 'Door Lock', [numbers.get('30') ?? '']).expect(201);
      const id = (created.body as Sheet).subAssemblies[0]?.id ?? '';

      await app
        .request()
        .post(`/api/tavole/${tavolaId}/sub-assemblies`)
        .send({ name: 'Window Slider', positionIds: [numbers.get('30')] })
        .expect(401);
      await app.request().delete(`/api/sub-assemblies/${id}`).expect(401);
    });
  });

  /**
   * **A number in no Sub-assembly shows nothing** — it does not fall back to every other number
   * on the drawing, which is what a null read as "all of them" would amount to on a sheet carrying
   * two hundred.
   */
  describe('a number in no Sub-assembly', () => {
    it('says so, rather than pointing at the rest of the sheet', async () => {
      await givenPositions('30', '31');

      const sheet = await sheetOf();
      expect(sheet.subAssemblies).toEqual([]);
      expect(sheet.positions.map((position) => position.subAssemblyId)).toEqual([null, null]);
    });
  });

  describe('a Related Position', () => {
    /**
     * **The rule the whole thing turns on** (spec, Testing Decisions): recorded once, visible from
     * both ends. The link is one row in ascending order because a check constraint refuses any
     * other arrangement, so there is no second row to forget to write or to let drift.
     */
    it('is recorded once and read from both ends', async () => {
      const numbers = await givenPositions('30', '44');

      const response = await relate(
        tavolaId,
        numbers.get('30') ?? '',
        numbers.get('44') ?? '',
      ).expect(201);

      const sheet = response.body as Sheet;
      const guide = positionNumbered(sheet, '30');
      const channel = positionNumbered(sheet, '44');

      expect(guide.related).toEqual([{ id: expect.any(String), positionId: channel.id }]);
      expect(channel.related).toEqual([{ id: guide.related[0]?.id, positionId: guide.id }]);
      expect(sheet).toEqual(await sheetOf());
    });

    // Whichever way round it was entered. The pair is the link, and the order the ids arrived in
    // is the Editor's typing rather than anything about the two parts.
    it('is the same link entered from the other end, and is refused as already recorded', async () => {
      const numbers = await givenPositions('30', '44');
      await relate(tavolaId, numbers.get('30') ?? '', numbers.get('44') ?? '').expect(201);

      const response = await relate(
        tavolaId,
        numbers.get('44') ?? '',
        numbers.get('30') ?? '',
      ).expect(409);

      expect(response.body.error).toMatchObject({ code: 'conflict' });
      expect(positionNumbered(await sheetOf(), '30').related).toHaveLength(1);
    });

    /**
     * The link is one row **in ascending order**, and what "ascending" means is Postgres's
     * opinion about two `uuid` values — not this process's about two strings. A `uuid` is a value
     * and not the text somebody typed, so `B1…` sorts below `a2…` there and above it in
     * JavaScript; ordering the pair here and letting the check constraint disagree would refuse a
     * perfectly ordinary link, for no better reason than a client sending its hex in capitals.
     *
     * So the ids are handed over as they arrived and `least`/`greatest` decide. What this asserts
     * is the consequence a client can see: the case they send in is not something they have to
     * think about, and the row that comes back is canonical either way.
     */
    it('is recorded whatever case the ids arrive in', async () => {
      const numbers = await givenPositions('30', '44');
      const guide = numbers.get('30') ?? '';
      const channel = numbers.get('44') ?? '';

      await relate(tavolaId, guide.toUpperCase(), channel).expect(201);

      const sheet = await sheetOf();
      // Canonical, and the same one row from both ends — whatever was typed at it.
      expect(positionNumbered(sheet, '30').related).toEqual([
        { id: expect.any(String), positionId: channel },
      ]);
      expect(positionNumbered(sheet, '44').related).toEqual([
        { id: expect.any(String), positionId: guide },
      ]);
    });

    it('lists what a number is linked to in the catalog’s own order', async () => {
      const numbers = await givenPositions('30', '44', '7', '100');
      await relate(tavolaId, numbers.get('30') ?? '', numbers.get('100') ?? '').expect(201);
      await relate(tavolaId, numbers.get('30') ?? '', numbers.get('7') ?? '').expect(201);
      await relate(tavolaId, numbers.get('44') ?? '', numbers.get('30') ?? '').expect(201);

      const sheet = await sheetOf();
      const byId = new Map(sheet.positions.map((position) => [position.id, position.number]));
      expect(
        positionNumbered(sheet, '30').related.map((link) => byId.get(link.positionId)),
      ).toEqual(['7', '44', '100']);
    });

    it('is removed from both ends at once', async () => {
      const numbers = await givenPositions('30', '44');
      const created = await relate(
        tavolaId,
        numbers.get('30') ?? '',
        numbers.get('44') ?? '',
      ).expect(201);
      const linkId = positionNumbered(created.body as Sheet, '30').related[0]?.id ?? '';

      const response = await editor.delete(`/api/related-positions/${linkId}`).expect(200);

      const sheet = response.body as Sheet;
      expect(positionNumbered(sheet, '30').related).toEqual([]);
      expect(positionNumbered(sheet, '44').related).toEqual([]);
    });

    it('is a 404 once it is gone', async () => {
      const numbers = await givenPositions('30', '44');
      const created = await relate(
        tavolaId,
        numbers.get('30') ?? '',
        numbers.get('44') ?? '',
      ).expect(201);
      const linkId = positionNumbered(created.body as Sheet, '30').related[0]?.id ?? '';

      await editor.delete(`/api/related-positions/${linkId}`).expect(200);
      await editor.delete(`/api/related-positions/${linkId}`).expect(404);
    });

    it('cannot link a number to itself', async () => {
      const numbers = await givenPositions('30');

      const response = await relate(
        tavolaId,
        numbers.get('30') ?? '',
        numbers.get('30') ?? '',
      ).expect(400);
      expect(response.body.error).toMatchObject({ code: 'validation_failed' });
    });

    // A link is between two numbers on **one** sheet — a curated pointer at the part this one
    // works against, which is a thing only the drawing they share can show.
    it('cannot reach a number on another sheet', async () => {
      const numbers = await givenPositions('30');
      const other = await givenTavola(
        app.db,
        (await givenModel(app.db, { brand: 'Iso', name: 'Fidia' })).id,
        { number: '3' },
      );
      const elsewhere = await editor
        .post(`/api/tavole/${other.id}/positions`)
        .send({ number: '90' })
        .expect(201);

      await relate(
        tavolaId,
        numbers.get('30') ?? '',
        (elsewhere.body as Sheet).positions[0]?.id ?? '',
      ).expect(404);
    });

    // A mistyped number is cheap to undo, and it must not leave a link pointing at nothing.
    it('goes when either of its numbers is removed', async () => {
      const numbers = await givenPositions('30', '44');
      await relate(tavolaId, numbers.get('30') ?? '', numbers.get('44') ?? '').expect(201);

      const response = await editor.delete(`/api/positions/${numbers.get('44') ?? ''}`).expect(200);

      expect(positionNumbered(response.body as Sheet, '30').related).toEqual([]);
    });

    it('cannot be recorded or removed by someone who has not signed in', async () => {
      const numbers = await givenPositions('30', '44');
      const created = await relate(
        tavolaId,
        numbers.get('30') ?? '',
        numbers.get('44') ?? '',
      ).expect(201);
      const linkId = positionNumbered(created.body as Sheet, '30').related[0]?.id ?? '';

      await app
        .request()
        .post(`/api/tavole/${tavolaId}/related-positions`)
        .send({ positionId: numbers.get('30'), otherPositionId: numbers.get('44') })
        .expect(401);
      await app.request().delete(`/api/related-positions/${linkId}`).expect(401);
    });
  });

  /**
   * Both are read with the drawing rather than behind a request of their own. What belongs with a
   * number is part of what a member opened the Tavola to see, and a second request for it is a
   * second chance to arrive late.
   */
  describe('the sheet a member opens', () => {
    it('carries its Sub-assemblies and its links with the drawing', async () => {
      const numbers = await givenPositions('30', '31', '44');
      await putIn(tavolaId, 'Window Slider', [
        numbers.get('30') ?? '',
        numbers.get('31') ?? '',
      ]).expect(201);
      await relate(tavolaId, numbers.get('30') ?? '', numbers.get('44') ?? '').expect(201);

      const sheet = await sheetOf();

      expect(sheet.subAssemblies).toEqual([{ id: expect.any(String), name: 'Window Slider' }]);
      expect(numbersIn(sheet, sheet.subAssemblies[0]?.id ?? '')).toEqual(['30', '31']);
      expect(positionNumbered(sheet, '44').related).toHaveLength(1);
    });
  });
});
