import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAnEditor } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * Bulk paste and spreadsheet export (ticket 12, stories 113–114).
 *
 * **This is the concession that keeps spreadsheet-native Editors productive**, and the thing it
 * is not is the permanent catalog importer (ADR 0005). The difference is the whole of what is
 * asserted here: a paste **creates and matches, and never overwrites**, so a sheet run through
 * it twice cannot silently undo what an Editor has since worked out about a Part.
 *
 * Two properties carry the rest. A **preview writes nothing** — an Editor sees two hundred rows'
 * worth of consequences before any of it exists. And an **exported sheet pastes back clean**:
 * every row of it is already listed, because the columns the export writes are the columns the
 * paste reads, and identity is decided by the same rule at both ends.
 */

/** The header the archive writes, and the one it reads back without an Editor doing anything. */
const HEADER =
  'Position,Catalog Number,Name (English),Name (Italian),Quantity,Disegno Origine,Drawn';

describe('a whole catalog page at once', () => {
  let app: TestApp;
  let editor: TestAgent;
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
    editor = await givenAnEditor(app);
    modelId = (await givenModel(app.db, { brand: 'Iso', name: 'Grifo' })).id;
    tavolaId = (await givenTavola(app.db, modelId, { number: '2' })).id;
  });

  function preview(text: string, onTavola = tavolaId) {
    return editor.post(`/api/tavole/${onTavola}/paste/preview`).send({ text });
  }

  function paste(text: string, onTavola = tavolaId) {
    return editor.post(`/api/tavole/${onTavola}/paste`).send({ text });
  }

  function exportSheet(onTavola = tavolaId) {
    return editor.get(`/api/tavole/${onTavola}/export.csv`);
  }

  /** What the sheet's own index now says, with the Positions resolved to their printed numbers. */
  async function indexOf(onTavola = tavolaId) {
    const [sheet, listed] = await Promise.all([
      editor.get(`/api/tavole/${onTavola}`).expect(200),
      editor.get(`/api/tavole/${onTavola}/listings`).expect(200),
    ]);

    const numbers = new Map<string, string>(
      sheet.body.positions.map((position: { id: string; number: string }) => [
        position.id,
        position.number,
      ]),
    );

    return listed.body.listings.map(
      (listing: {
        positionId: string | null;
        quantityPerCar: number | null;
        drawn: boolean;
        part: { nameEn: string | null; nameIt: string | null; catalogNumber: string | null };
      }) => ({
        position: listing.positionId === null ? null : numbers.get(listing.positionId),
        catalogNumber: listing.part.catalogNumber,
        nameEn: listing.part.nameEn,
        nameIt: listing.part.nameIt,
        quantityPerCar: listing.quantityPerCar,
        drawn: listing.drawn,
      }),
    );
  }

  describe('what a paste does', () => {
    it('turns pasted rows into Parts and Listings on this drawing', async () => {
      const response = await paste(
        [
          HEADER,
          '207,260 03 150,Window channel guide rod,ASTA GUIDA PER CRISTALLO MONTANTE,2,208503,yes',
          '208,260 03 151,Window channel,CANALINO CRISTALLO,1,208504,yes',
        ].join('\n'),
      ).expect(201);

      expect(response.body.applied).toBe(true);
      expect(response.body.tally).toMatchObject({ newParts: 2, newPositions: 2, refused: 0 });

      expect(await indexOf()).toEqual([
        {
          position: '207',
          catalogNumber: '260 03 150',
          nameEn: 'Window channel guide rod',
          nameIt: 'ASTA GUIDA PER CRISTALLO MONTANTE',
          quantityPerCar: 2,
          drawn: true,
        },
        {
          position: '208',
          catalogNumber: '260 03 151',
          nameEn: 'Window channel',
          nameIt: 'CANALINO CRISTALLO',
          quantityPerCar: 1,
          drawn: true,
        },
      ]);
    });

    it('records the numbers the sheet did not have yet, and says which they are', async () => {
      const response = await paste([HEADER, '300,,Bracket,,,,yes'].join('\n')).expect(201);

      expect(response.body.rows[0]).toMatchObject({
        line: 2,
        outcome: 'new-part',
        positionNumber: '300',
        newPosition: true,
      });

      const sheet = await editor.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(sheet.body.positions.map((position: { number: string }) => position.number)).toEqual([
        '300',
      ]);
    });

    it('lists a Part the catalog names on the sheet without a number of its own', async () => {
      await paste([HEADER, ',260 03 999,Data plate,,,,no'].join('\n')).expect(201);

      expect(await indexOf()).toEqual([
        {
          position: null,
          catalogNumber: '260 03 999',
          nameEn: 'Data plate',
          nameIt: null,
          quantityPerCar: null,
          drawn: false,
        },
      ]);
    });

    it('reads what a spreadsheet actually puts on the clipboard, which is tab-separated', async () => {
      await paste(
        [
          'Pos.\tCodice\tName\tDenominazione\tQ.tà\tDis. Origine\tDrawn',
          '207\t260 03 150\tGuide rod\tASTA GUIDA\t2\t208503\tyes',
        ].join('\n'),
      ).expect(201);

      expect(await indexOf()).toEqual([
        {
          position: '207',
          catalogNumber: '260 03 150',
          nameEn: 'Guide rod',
          nameIt: 'ASTA GUIDA',
          quantityPerCar: 2,
          drawn: true,
        },
      ]);
    });

    it('reads a sheet saved on a machine whose decimal separator is a comma', async () => {
      await paste(
        ['Pos.;Codice;Name;Q.tà;Drawn', '207;260 03 150;Guide rod;2;yes'].join('\n'),
      ).expect(201);

      expect(await indexOf()).toMatchObject([{ position: '207', quantityPerCar: 2 }]);
    });

    it('reports the header it read each field from, so a mismapped column is visible', async () => {
      const response = await preview(
        [
          'Pos.\tCodice\tName\tDenominazione\tQ.tà\tDis. Origine\tDrawn',
          '207\t\tRod\t\t\t\tyes',
        ].join('\n'),
      ).expect(200);

      expect(response.body.columns).toEqual({
        position: 'Pos.',
        catalogNumber: 'Codice',
        nameEn: 'Name',
        nameIt: 'Denominazione',
        quantityPerCar: 'Q.tà',
        disegnoOrigine: 'Dis. Origine',
        drawn: 'Drawn',
      });
    });
  });

  describe('the preview', () => {
    it('writes nothing at all', async () => {
      const text = [HEADER, '207,260 03 150,Guide rod,ASTA GUIDA,2,208503,yes'].join('\n');

      const response = await preview(text).expect(200);
      expect(response.body.applied).toBe(false);
      expect(response.body.tally.newParts).toBe(1);

      expect(await indexOf()).toEqual([]);
      const sheet = await editor.get(`/api/tavole/${tavolaId}`).expect(200);
      expect(sheet.body.positions).toEqual([]);
    });

    it('says of every row what will be created and what will be matched', async () => {
      await paste([HEADER, '207,260 03 150,Guide rod,,,,yes'].join('\n')).expect(201);

      const response = await preview(
        [
          HEADER,
          '207,260 03 150,Guide rod,,,,yes',
          '208,260 03 150,Guide rod,,,,yes',
          '209,260 03 151,Channel,,,,yes',
        ].join('\n'),
      ).expect(200);

      expect(
        response.body.rows.map((row: { line: number; outcome: string }) => [row.line, row.outcome]),
      ).toEqual([
        [2, 'already-listed'],
        [3, 'matched-part'],
        [4, 'new-part'],
      ]);
      expect(response.body.tally).toMatchObject({
        newParts: 1,
        matchedParts: 1,
        alreadyListed: 1,
        refused: 0,
      });
    });

    it('agrees with what applying the same text then does', async () => {
      const text = [
        HEADER,
        '207,260 03 150,Guide rod,,2,,yes',
        '208,,Washer,RONDELLA,4,,no',
        '209,nonsense,Bracket,,not a number,,yes',
      ].join('\n');

      const shown = await preview(text).expect(200);
      const done = await paste(text).expect(201);

      expect(done.body.rows).toEqual(shown.body.rows);
      expect(done.body.tally).toEqual(shown.body.tally);
    });
  });

  describe('matching rather than duplicating', () => {
    /** A Part recorded the ordinary way, on a drawing of its own. */
    async function givenRecordedPart(catalogNumber: string, nameEn: string) {
      const other = await givenTavola(app.db, modelId, { number: '9' });
      const response = await editor
        .post(`/api/tavole/${other.id}/listings`)
        .send({
          drawn: true,
          part: {
            nameEn,
            nameIt: '',
            catalogNumber,
            disegnoOrigine: '',
            description: '',
            dimensions: '',
            materialFinish: '',
            catalogNote: '',
            note: '',
          },
        })
        .expect(201);
      return response.body.listing.part;
    }

    it('matches a row to the Part that already holds its Catalog Number', async () => {
      const existing = await givenRecordedPart('260 03 150', 'Guide rod');

      const response = await paste([HEADER, '207,260 03 150,Guide rod,,2,,yes'].join('\n')).expect(
        201,
      );

      expect(response.body.rows[0]).toMatchObject({ outcome: 'matched-part' });
      expect(response.body.rows[0].matched.id).toBe(existing.id);

      // One Part, listed on two drawings — which is the whole of ADR 0001.
      const read = await editor.get(`/api/parts/${existing.id}`).expect(200);
      expect(read.body.listedOn).toHaveLength(2);
    });

    it('ignores the spacing the catalog prints when it matches a number', async () => {
      const existing = await givenRecordedPart('260 03 150', 'Guide rod');

      const response = await paste([HEADER, '207,26003150,Guide rod,,,,yes'].join('\n')).expect(
        201,
      );

      expect(response.body.rows[0].matched.id).toBe(existing.id);
      const lookedUp = await editor.get('/api/parts?q=26003150').expect(200);
      expect(lookedUp.body.parts).toHaveLength(1);
    });

    it('takes one Catalog Number appearing twice in a paste as one Part at two numbers', async () => {
      const response = await paste(
        [HEADER, '207,260 03 150,Guide rod,,2,,yes', '208,260 03 150,Guide rod,,1,,yes'].join('\n'),
      ).expect(201);

      expect(response.body.rows[1]).toMatchObject({ outcome: 'matched-part', matchedLine: 2 });
      expect(response.body.tally).toMatchObject({ newParts: 1, matchedParts: 1 });

      const lookedUp = await editor.get('/api/parts?q=260 03 150').expect(200);
      expect(lookedUp.body.parts).toHaveLength(1);
      expect(lookedUp.body.parts[0].listedOn).toHaveLength(1);
    });

    it('leaves a matched Part exactly as it was, because a paste never overwrites', async () => {
      const existing = await givenRecordedPart('260 03 150', 'Guide rod');
      await editor
        .patch(`/api/parts/${existing.id}`)
        .send({
          nameEn: 'Guide rod',
          nameIt: 'ASTA GUIDA',
          catalogNumber: '260 03 150',
          disegnoOrigine: '208503',
          description: '',
          dimensions: '',
          materialFinish: '',
          catalogNote: '',
          note: 'The late cars take the longer one.',
        })
        .expect(200);

      await paste([HEADER, '207,260 03 150,Something else,,,999999,yes'].join('\n')).expect(201);

      const read = await editor.get(`/api/parts/${existing.id}`).expect(200);
      expect(read.body.part).toMatchObject({
        nameEn: 'Guide rod',
        disegnoOrigine: '208503',
        note: 'The late cars take the longer one.',
      });
    });

    it('does nothing to a Part already listed at that number on this sheet', async () => {
      const text = [HEADER, '207,260 03 150,Guide rod,,2,,yes'].join('\n');
      await paste(text).expect(201);

      const again = await paste(text).expect(201);
      expect(again.body.rows[0]).toMatchObject({ outcome: 'already-listed' });
      expect(again.body.tally).toMatchObject({ alreadyListed: 1, newParts: 0, matchedParts: 0 });
      expect(await indexOf()).toHaveLength(1);
    });

    it('refuses a row that lists the same Part twice at one number in one paste', async () => {
      const response = await paste(
        [HEADER, '207,260 03 150,Guide rod,,2,,yes', '207,260 03 150,Guide rod,,2,,yes'].join('\n'),
      ).expect(201);

      expect(response.body.rows[1]).toMatchObject({ outcome: 'refused' });
      expect(response.body.rows[1].why).toContain('2');
      expect(await indexOf()).toHaveLength(1);
    });
  });

  describe('rows that cannot be read', () => {
    it('reports them with their line and lets the rest through', async () => {
      const response = await paste(
        [
          HEADER,
          '207,260 03 150,Guide rod,,2,,yes',
          '208,260 03 151,Channel,,two,,yes',
          '209,260 03 152,Bracket,,1,,yes',
        ].join('\n'),
      ).expect(201);

      expect(response.body.rows[1]).toMatchObject({ line: 3, outcome: 'refused' });
      expect(response.body.rows[1].why).toContain('two');
      expect(response.body.tally).toMatchObject({ refused: 1, newParts: 2 });

      const index = await indexOf();
      expect(index.map((row: { position: string }) => row.position)).toEqual(['207', '209']);
    });

    it('refuses a row that says neither drawn nor undrawn', async () => {
      const response = await paste(
        [HEADER, '207,260 03 150,Guide rod,,,,perhaps'].join('\n'),
      ).expect(201);

      expect(response.body.rows[0]).toMatchObject({ outcome: 'refused' });
      expect(response.body.rows[0].why).toContain('perhaps');
      expect(await indexOf()).toEqual([]);
    });

    it('refuses a new Part with neither name', async () => {
      const response = await paste([HEADER, '207,260 03 150,,,2,,yes'].join('\n')).expect(201);

      expect(response.body.rows[0]).toMatchObject({ outcome: 'refused' });
      expect(response.body.rows[0].why).toMatch(/name/i);
    });

    it('does not ask for a name on a row whose number the archive already knows', async () => {
      await paste([HEADER, '207,260 03 150,Guide rod,,,,yes'].join('\n')).expect(201);

      const response = await paste([HEADER, '208,260 03 150,,,4,,no'].join('\n')).expect(201);
      expect(response.body.rows[0]).toMatchObject({ outcome: 'matched-part' });
    });

    it("refuses the whole paste when none of its columns are the archive's", async () => {
      const response = await paste(['Alpha,Beta,Gamma', '1,2,3'].join('\n')).expect(400);

      expect(response.body.error.code).toBe('validation_failed');
      expect(response.body.error.message).toContain('Catalog Number');
    });

    it('refuses a paste with nothing in it', async () => {
      await paste('   ').expect(400);
    });

    it('refuses a paste of nothing but a header row', async () => {
      const response = await paste(HEADER).expect(400);
      expect(response.body.error.message).toMatch(/row/i);
    });
  });

  describe('what the Drawn column means', () => {
    it('takes a blank cell in a Drawn column as not drawn, the way a tick column reads', async () => {
      await paste([HEADER, '207,,Guide rod,,,,yes', '208,,Washer,,4,,'].join('\n')).expect(201);

      const index = await indexOf();
      expect(
        index.map((row: { position: string; drawn: boolean }) => [row.position, row.drawn]),
      ).toEqual([
        ['207', true],
        ['208', false],
      ]);
    });

    it('takes every row as drawn where the sheet has no Drawn column at all', async () => {
      await paste(
        ['Position,Catalog Number,Name (English)', '207,,Guide rod', '208,,Washer'].join('\n'),
      ).expect(201);

      const index = await indexOf();
      expect(index.every((row: { drawn: boolean }) => row.drawn)).toBe(true);
    });
  });

  describe('the export', () => {
    it("writes the drawing out as a spreadsheet, in the catalog's own order", async () => {
      await paste(
        [
          HEADER,
          '208,260 03 151,Channel,CANALINO,1,208504,yes',
          '207,260 03 150,Guide rod,ASTA GUIDA,2,208503,yes',
          '207,,Washer,RONDELLA,4,,no',
        ].join('\n'),
      ).expect(201);

      const response = await exportSheet().expect(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('tavola-2');

      expect(response.text.replace(/^\uFEFF/, '').split('\r\n')).toEqual([
        HEADER,
        '207,260 03 150,Guide rod,ASTA GUIDA,2,208503,yes',
        '207,,Washer,RONDELLA,4,,no',
        '208,260 03 151,Channel,CANALINO,1,208504,yes',
      ]);
    });

    it('writes a header even for a drawing with nothing listed on it', async () => {
      const response = await exportSheet().expect(200);
      expect(response.text.replace(/^\uFEFF/, '')).toBe(HEADER);
    });

    it('quotes a cell that holds the delimiter', async () => {
      await paste([HEADER, '207,,"Rod, upper",,,,yes'].join('\n')).expect(201);

      const response = await exportSheet().expect(200);
      expect(response.text).toContain('"Rod, upper"');
    });
  });

  describe('a Part the catalog gave no number', () => {
    /**
     * **The case the round trip most needed and could most easily have got wrong.** Two washers
     * at one number, neither carrying a Catalog Number, both called the same thing: nothing in the
     * archive tells them apart, so a paste matching by name and number has to match them *one to
     * one* rather than collapsing both onto whichever it saw last.
     */
    it('matches two identically named unnumbered Parts at one number one to one', async () => {
      const listUnnumbered = async (positionId: string, nameEn: string) =>
        editor
          .post(`/api/tavole/${tavolaId}/listings`)
          .send({
            positionId,
            drawn: false,
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

      const sheet = await editor
        .post(`/api/tavole/${tavolaId}/positions`)
        .send({ number: '207' })
        .expect(201);
      const positionId = sheet.body.positions[0].id;

      // Two Parts, indistinguishable but for their ids — which the archive allows, because
      // several Parts at one Position is an ordinary state.
      await listUnnumbered(positionId, 'Washer');
      await listUnnumbered(positionId, 'Washer');

      const exported = await exportSheet().expect(200);
      const again = await paste(exported.text).expect(201);

      expect(again.body.rows.map((row: { outcome: string }) => row.outcome)).toEqual([
        'already-listed',
        'already-listed',
      ]);
      expect(await indexOf()).toHaveLength(2);
    });

    it('records a third row of the same name, because the sheet has one more than the archive', async () => {
      await paste([HEADER, '207,,Washer,,,,no'].join('\n')).expect(201);

      const response = await paste(
        [HEADER, '207,,Washer,,,,no', '207,,Washer,,,,no'].join('\n'),
      ).expect(201);

      expect(response.body.rows.map((row: { outcome: string }) => row.outcome)).toEqual([
        'already-listed',
        'new-part',
      ]);
      expect(await indexOf()).toHaveLength(2);
    });
  });

  describe('a row that disagrees with what is recorded', () => {
    /**
     * **The one thing a paste would otherwise swallow in silence.** An Editor exports a drawing,
     * corrects a quantity in the spreadsheet they are comfortable in, and pastes it back. Nothing
     * is written — a bulk write over curated records is what this archive does not do (ADR 0005) —
     * and the Editor has to be told, or they will believe the correction landed.
     */
    it('says so rather than applying it, and rather than saying nothing', async () => {
      await paste([HEADER, '207,260 03 150,Guide rod,,2,,yes'].join('\n')).expect(201);

      const response = await paste([HEADER, '207,260 03 150,Guide rod,,4,,yes'].join('\n')).expect(
        201,
      );

      expect(response.body.rows[0]).toMatchObject({ outcome: 'already-listed' });
      expect(response.body.rows[0].why).toContain('4');
      expect(response.body.rows[0].why).toContain('2');

      const index = await indexOf();
      expect(index[0].quantityPerCar).toBe(2);
    });

    it('says nothing about a blank quantity, which is a sheet saying nothing rather than none', async () => {
      await paste([HEADER, '207,260 03 150,Guide rod,,2,,yes'].join('\n')).expect(201);

      const response = await paste([HEADER, '207,260 03 150,Guide rod,,,,yes'].join('\n')).expect(
        201,
      );
      expect(response.body.rows[0].why).toBeUndefined();
    });

    it('says nothing about the drawn flag where the sheet has no column for it', async () => {
      await paste([HEADER, '207,260 03 150,Guide rod,,,,no'].join('\n')).expect(201);

      const response = await paste(
        ['Position,Catalog Number,Name (English)', '207,260 03 150,Guide rod'].join('\n'),
      ).expect(201);
      expect(response.body.rows[0]).toMatchObject({ outcome: 'already-listed' });
      expect(response.body.rows[0].why).toBeUndefined();
    });
  });

  describe('the round trip', () => {
    it('pastes an exported sheet back without creating anything', async () => {
      await paste(
        [
          HEADER,
          '207,260 03 150,Guide rod,ASTA GUIDA,2,208503,yes',
          '207,,Washer,RONDELLA,4,,no',
          ',260 03 999,Data plate,,,,no',
          '208,,Channel,CANALINO,1,,yes',
        ].join('\n'),
      ).expect(201);

      const before = await indexOf();
      const exported = await exportSheet().expect(200);

      const again = await paste(exported.text).expect(201);
      expect(again.body.rows.map((row: { outcome: string }) => row.outcome)).toEqual([
        'already-listed',
        'already-listed',
        'already-listed',
        'already-listed',
      ]);
      expect(again.body.tally).toMatchObject({ newParts: 0, matchedParts: 0, refused: 0 });
      expect(await indexOf()).toEqual(before);
    });
  });

  describe('who may do it, and to what', () => {
    it('admits nobody who is not signed in', async () => {
      await app.request().post(`/api/tavole/${tavolaId}/paste`).send({ text: HEADER }).expect(401);
      await app
        .request()
        .post(`/api/tavole/${tavolaId}/paste/preview`)
        .send({ text: HEADER })
        .expect(401);
      await app.request().get(`/api/tavole/${tavolaId}/export.csv`).expect(401);
    });

    it('answers for a drawing the archive does not have', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      await paste([HEADER, '207,,Rod,,,,yes'].join('\n'), missing).expect(404);
      await preview([HEADER, '207,,Rod,,,,yes'].join('\n'), missing).expect(404);
      await exportSheet(missing).expect(404);
    });
  });
});
