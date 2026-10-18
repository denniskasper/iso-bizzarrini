import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  PartResponse,
  PositionListingsResponse,
  SearchResponse,
  TavolaResponse,
  TavolaSummary,
} from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadReading } from '../src/migration/load-reading.js';
import { readCatalog } from '../src/reading/read-catalog.js';
import { readSheet } from '../src/sheets/csv.js';
import { createFileStore } from '../src/storage/file-store.js';
import {
  aDrawing,
  aRow,
  aTable,
  aTableSheet,
  fakePages,
  fakeReadingMethod,
  givenOutputDirectory,
  type FakeMethodOptions,
  type InventedPage,
  type OutputDirectory,
} from './support/catalog-reading.js';
import { givenModel, givenTavola } from './support/fixtures.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Machine translation: English names labelled until an Editor confirms them** (ADR 0017,
 * issue #32).
 *
 * The read command is run against a fake Reading method whose English each test chooses, and
 * what it writes is read back; then the directory is loaded and read over HTTP, as an Editor and
 * as a Member, because "labelled until an Editor confirms it" is a claim about what each sees.
 */
const ENGLISH: Record<string, string> = {
  'ASSALE POSTERIORE': 'Rear axle',
  'SCATOLA DIFFERENZIALE': 'Differential case',
  VITE: 'Screw',
  SEMIASSE: 'Half shaft',
  'RIV {{1}} ATTACCO {{2}}': 'RIV {{1}} mounting {{2}}',
};

const TAVOLA_84: InventedPage[] = [
  aDrawing('84', { titleIt: 'ASSALE POSTERIORE' }),
  aTableSheet('84', [
    aTable([
      aRow('1', '208501', 'SCATOLA DIFFERENZIALE', { note: 'RIV 6006-2Z ATTACCO 12x1,5' }),
      aRow('-', '208900', 'VITE', { quantity: '6' }),
      aRow('2', '208502', 'SEMIASSE'),
    ]),
  ]),
];

describe('machine translation', () => {
  const opened: OutputDirectory[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((directory) => directory.remove()));
  });

  async function givenRead(
    pages: InventedPage[] = TAVOLA_84,
    options: FakeMethodOptions & { limit?: number; out?: string; resume?: boolean } = {},
  ) {
    let out = options.out;
    if (!out) {
      const directory = await givenOutputDirectory();
      opened.push(directory);
      out = directory.path;
    }
    const method = fakeReadingMethod(pages, { english: ENGLISH, ...options });
    const printed: string[] = [];
    const result = await readCatalog({
      pdf: 'catalog.pdf',
      out,
      model: { brand: 'Iso', name: 'Rivolta' },
      method,
      pages: fakePages(pages),
      limit: options.limit ?? 100,
      resume: options.resume,
      print: (line) => printed.push(line),
    });
    return { out, method, result, printed };
  }

  async function listingsOf(out: string, tavola: string) {
    const text = await readFile(join(out, `tavola-${tavola}`, 'listings.csv'), 'utf8');
    return readSheet('listings.csv', text).rows.map((row) => ({
      nameIt: row.get('Denominazione'),
      nameEn: row.get('Name (English)'),
      catalogNote: row.get('Catalog Note'),
      catalogNoteEn: row.get('Catalog Note (English)'),
    }));
  }

  async function manifestOf(out: string, tavola: string) {
    return JSON.parse(await readFile(join(out, `tavola-${tavola}`, 'tavola.json'), 'utf8'));
  }

  describe('when a catalog is read', () => {
    it('writes the English beside the Italian, which stays verbatim', async () => {
      const { out } = await givenRead();

      expect(await listingsOf(out, '84')).toEqual([
        {
          nameIt: 'SCATOLA DIFFERENZIALE',
          nameEn: 'Differential case',
          catalogNote: 'RIV 6006-2Z ATTACCO 12x1,5',
          catalogNoteEn: 'RIV 6006-2Z mounting 12x1,5',
        },
        { nameIt: 'VITE', nameEn: 'Screw', catalogNote: '', catalogNoteEn: '' },
        { nameIt: 'SEMIASSE', nameEn: 'Half shaft', catalogNote: '', catalogNoteEn: '' },
      ]);
      expect(await manifestOf(out, '84')).toMatchObject({
        titleIt: 'ASSALE POSTERIORE',
        titleEn: 'Rear axle',
      });
    });

    it('never sends a code or a number to be translated', async () => {
      const { method } = await givenRead();

      const sent = method.translated.flat();
      expect(sent).toContain('RIV {{1}} ATTACCO {{2}}');
      expect(sent.join(' ').replace(/\{\{\d+\}\}/g, '')).not.toMatch(/\d/);
    });

    it('leaves a text untranslated rather than keep an English that altered its codes', async () => {
      const { out } = await givenRead(TAVOLA_84, {
        english: { ...ENGLISH, 'RIV {{1}} ATTACCO {{2}}': 'RIV {{1}} mounting' },
      });

      const [first] = await listingsOf(out, '84');
      expect(first).toMatchObject({ catalogNote: 'RIV 6006-2Z ATTACCO 12x1,5', catalogNoteEn: '' });
    });

    it('translates the same Italian once, so it reads the same on every Tavola', async () => {
      const { out, method } = await givenRead([
        ...TAVOLA_84,
        aDrawing('85', { titleIt: 'ASSALE POSTERIORE' }),
        aTableSheet('85', [aTable([aRow('3', '208900', 'VITE')])]),
      ]);

      expect(method.translated.flat().filter((text) => text === 'VITE')).toHaveLength(1);
      expect(method.translated).toHaveLength(1);
      expect((await listingsOf(out, '85'))[0]?.nameEn).toBe('Screw');
      expect((await manifestOf(out, '85')).titleEn).toBe('Rear axle');
    });

    it('carries on with the translations of the Tavole read before', async () => {
      const pages = [
        ...TAVOLA_84,
        aTableSheet('85', [aTable([aRow('3', '208900', 'VITE')])], { titleIt: 'MOZZO' }),
      ];
      // Estimated at $0.36. With $0.20 spent, Tavola 85's sheet could cost up to $0.20 more.
      const first = await givenRead(pages, { limit: 0.38 });
      expect(first.result.notRead).toEqual(['85']);

      const again = await givenRead(pages, { out: first.out, resume: true });
      expect(again.method.translated).toEqual([['MOZZO']]);
      expect((await listingsOf(first.out, '85'))[0]?.nameEn).toBe('Screw');
    });

    it('counts what translating costs, and allows for it before each sheet', async () => {
      // $0.04 a request: 5,000 in and 1,000 out, at $4 and $20 a million.
      const { out, printed } = await givenRead(TAVOLA_84, {
        translationTokens: { input: 5000, output: 1000 },
        translationEstimate: { input: 5000, output: 1000, outputAtMost: 4000 },
      });

      expect(printed[1]).toMatch(/^Estimated at \$0\.32 for 2 pages/);
      expect(printed).toContain('  Translated 5 Italian texts into English. $0.04, $0.20 so far.');
      expect(printed).toContain('  3 Listings, 0 in doubt. Tavola 84 cost $0.20.');

      const record = JSON.parse(await readFile(join(out, 'cost.json'), 'utf8'));
      expect(record.tavole[0]).toMatchObject({
        number: '84',
        cost: 0.2,
        translation: { tokens: { input: 5000, output: 1000 }, cost: 0.04 },
      });
    });

    it('stops before a translation that could pass the limit, and keeps nothing of the Tavola', async () => {
      // The pages and Readings take $0.16 of $0.30, and then translating these texts turns out
      // to be able to cost up to $0.22.
      const pages = TAVOLA_84;
      const out = await givenOutputDirectory();
      opened.push(out);
      const method = fakeReadingMethod(pages, { english: ENGLISH });
      method.estimateTranslation = async () => ({
        input: 5000,
        output: 1000,
        outputAtMost: 10_000,
      });
      const printed: string[] = [];
      const result = await readCatalog({
        pdf: 'catalog.pdf',
        out: out.path,
        model: { brand: 'Iso', name: 'Rivolta' },
        method,
        pages: fakePages(pages),
        limit: 0.3,
        print: (line) => printed.push(line),
      });

      expect(result.notRead).toEqual(['84']);
      expect(method.translated).toEqual([]);
      expect(printed).toContain(
        'Stopped: translating Tavola 84 could cost up to $0.22, which would pass the limit of ' +
          '$0.30 ' +
          'with $0.16 spent.',
      );
    });
  });

  describe('once loaded', () => {
    let app: TestApp;
    let editor: TestAgent;
    let member: TestAgent;

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
    });

    async function load(source: string) {
      const report = await loadReading({
        db: app.db,
        fileStore: createFileStore(app.filesPath),
        clock: app.clock,
        logger: app.logger,
        source,
      });
      expect(report.rejected).toEqual([]);
      return report;
    }

    async function tavola84(agent: TestAgent): Promise<TavolaSummary> {
      const { models } = (await agent.get('/api/models').expect(200)).body;
      const rivolta = models.find((model: { name: string }) => model.name === 'Rivolta');
      const { tavole } = (await agent.get(`/api/models/${rivolta.id}`).expect(200)).body;
      return tavole.find((tavola: TavolaSummary) => tavola.number === '84');
    }

    async function partNumbered(agent: TestAgent, tavolaId: string, number: string) {
      const drawing = (await agent.get(`/api/tavole/${tavolaId}`).expect(200))
        .body as TavolaResponse;
      for (const position of drawing.positions) {
        const { listings } = (await agent.get(`/api/positions/${position.id}/listings`).expect(200))
          .body as PositionListingsResponse;
        const found = listings.find((listing) => listing.part.catalogNumber === number);
        if (found) {
          return found;
        }
      }
      throw new Error(`No Part ${number} on Tavola ${tavolaId}.`);
    }

    async function loadedAndPublished(source?: string) {
      await load(source ?? (await givenRead()).out);
      const tavola = await tavola84(editor);
      await editor.post(`/api/tavole/${tavola.id}/publication`).expect(200);
      return tavola.id;
    }

    it('keeps the Italian verbatim and marks the English as a Machine translation', async () => {
      await load((await givenRead()).out);
      const tavola = await tavola84(editor);

      expect(tavola).toMatchObject({
        nameIt: 'ASSALE POSTERIORE',
        nameEn: 'Rear axle',
        nameEnMachineTranslated: true,
      });
      const { part } = await partNumbered(editor, tavola.id, '208501');
      expect(part).toMatchObject({
        nameIt: 'SCATOLA DIFFERENZIALE',
        nameEn: 'Differential case',
        nameEnMachineTranslated: true,
        catalogNote: 'RIV 6006-2Z ATTACCO 12x1,5',
        catalogNoteEn: 'RIV 6006-2Z mounting 12x1,5',
      });
    });

    it('is still labelled once the Tavola is Published, wherever a Member reads the name', async () => {
      const tavolaId = await loadedAndPublished();

      expect(await tavola84(member)).toMatchObject({ nameEnMachineTranslated: true });
      const { part } = await partNumbered(member, tavolaId, '208501');
      expect(part).toMatchObject({ nameEn: 'Differential case', nameEnMachineTranslated: true });

      const { listings } = (await member.get(`/api/tavole/${tavolaId}/listings`).expect(200))
        .body as {
        listings: { part: { catalogNumber: string; nameEnMachineTranslated: boolean } }[];
      };
      expect(listings.every((listing) => listing.part.nameEnMachineTranslated)).toBe(true);

      const { matches } = (await member.get('/api/search').query({ q: '208501' }).expect(200))
        .body as SearchResponse;
      expect(matches[0]?.part).toMatchObject({ nameEnMachineTranslated: true });
      expect(matches[0]?.listings[0]).toMatchObject({
        nameEn: 'Rear axle',
        nameIt: 'ASSALE POSTERIORE',
        nameEnMachineTranslated: true,
      });
    });

    it('names a Machine-translated sheet in Italian too, where else a Part appears', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      const published = await givenTavola(app.db, grifo.id, { number: '2', nameEn: 'Rear axle' });
      const { positions } = (
        await editor.post(`/api/tavole/${published.id}/positions`).send({ number: '5' }).expect(201)
      ).body as { positions: { id: string }[] };
      const tavolaId = await loadedAndPublished();
      const { part } = await partNumbered(editor, tavolaId, '208900');
      await editor
        .post(`/api/tavole/${published.id}/listings`)
        .send({ positionId: positions[0]?.id, quantityPerCar: 4, drawn: true, partId: part.id })
        .expect(201);

      const onGrifo = (
        (await member.get(`/api/positions/${positions[0]?.id}/listings`).expect(200))
          .body as PositionListingsResponse
      ).listings[0];
      expect(onGrifo?.elsewhere).toEqual([
        expect.objectContaining({
          nameEn: 'Rear axle',
          nameIt: 'ASSALE POSTERIORE',
          nameEnMachineTranslated: true,
        }),
      ]);
    });

    it('takes an English name an Editor rewrote in the files as theirs', async () => {
      const { out } = await givenRead();
      const file = join(out, 'tavola-84', 'listings.csv');
      await writeFile(file, (await readFile(file, 'utf8')).replace('Half shaft', 'Axle shaft'));
      const manifest = join(out, 'tavola-84', 'tavola.json');
      await writeFile(
        manifest,
        (await readFile(manifest, 'utf8')).replace(
          '"titleEn": "Rear axle"',
          '"titleEn": "Back axle"',
        ),
      );

      await load(out);
      const tavola = await tavola84(editor);
      expect(tavola).toMatchObject({ nameEn: 'Back axle', nameEnMachineTranslated: false });
      expect((await partNumbered(editor, tavola.id, '208502')).part).toMatchObject({
        nameEn: 'Axle shaft',
        nameEnMachineTranslated: false,
      });
      expect((await partNumbered(editor, tavola.id, '208501')).part).toMatchObject({
        nameEnMachineTranslated: true,
      });
    });

    it('labels a title left without English, so the Italian standing in is not taken as checked', async () => {
      const { out } = await givenRead();
      const manifest = join(out, 'tavola-84', 'tavola.json');
      await writeFile(
        manifest,
        (await readFile(manifest, 'utf8')).replace('"titleEn": "Rear axle"', '"titleEn": ""'),
      );

      await load(out);
      expect(await tavola84(editor)).toMatchObject({
        nameEn: 'ASSALE POSTERIORE',
        nameEnMachineTranslated: true,
      });
    });

    describe('an Editor vouching for it', () => {
      it('confirms a Part’s English name as it stands, and the label goes', async () => {
        const tavolaId = await loadedAndPublished();
        const { part } = await partNumbered(editor, tavolaId, '208501');

        const confirmed = (
          await editor
            .put(`/api/parts/${part.id}/english-name`)
            .send({ nameEn: 'Differential case' })
            .expect(200)
        ).body as PartResponse;

        expect(confirmed.part).toMatchObject({
          nameEn: 'Differential case',
          nameEnMachineTranslated: false,
        });
        expect((await partNumbered(member, tavolaId, '208501')).part).toMatchObject({
          nameEnMachineTranslated: false,
        });
      });

      it('takes the label off a name rewritten in a correction, and keeps it on one left alone', async () => {
        const tavolaId = await loadedAndPublished();
        const differential = (await partNumbered(editor, tavolaId, '208501')).part;
        const screw = (await partNumbered(editor, tavolaId, '208900')).part;
        const asTyped = (part: typeof screw) => ({
          nameEn: part.nameEn ?? '',
          nameIt: part.nameIt ?? '',
          catalogNumber: part.catalogNumber ?? '',
          disegnoOrigine: '',
          description: '',
          dimensions: '',
          materialFinish: '',
          catalogNote: part.catalogNote ?? '',
          note: '',
        });

        const rewritten = (
          await editor
            .patch(`/api/parts/${screw.id}`)
            .send({ ...asTyped(screw), nameEn: 'Hexagon head screw' })
            .expect(200)
        ).body as PartResponse;
        const leftAlone = (
          await editor
            .patch(`/api/parts/${differential.id}`)
            .send({ ...asTyped(differential), note: 'Same as the Grifo’s.' })
            .expect(200)
        ).body as PartResponse;

        expect(rewritten.part).toMatchObject({ nameEnMachineTranslated: false });
        expect(leftAlone.part).toMatchObject({
          nameEnMachineTranslated: true,
          catalogNoteEn: 'RIV 6006-2Z mounting 12x1,5',
        });
      });

      it('drops the English of a Catalog Note once the note itself is corrected', async () => {
        const tavolaId = await loadedAndPublished();
        const { part } = await partNumbered(editor, tavolaId, '208501');

        const corrected = (
          await editor
            .patch(`/api/parts/${part.id}`)
            .send({
              nameEn: part.nameEn,
              nameIt: part.nameIt,
              catalogNumber: part.catalogNumber,
              disegnoOrigine: '',
              description: '',
              dimensions: '',
              materialFinish: '',
              catalogNote: 'RIV 6007',
              note: '',
            })
            .expect(200)
        ).body as PartResponse;

        expect(corrected.part).toMatchObject({ catalogNote: 'RIV 6007', catalogNoteEn: null });
      });

      it('confirms or rewrites a Tavola’s English name, which publishing never does', async () => {
        const tavolaId = await loadedAndPublished();
        expect(await tavola84(editor)).toMatchObject({ nameEnMachineTranslated: true });

        const { tavola } = (
          await editor
            .put(`/api/tavole/${tavolaId}/english-name`)
            .send({ nameEn: 'Rear axle assembly' })
            .expect(200)
        ).body as { tavola: TavolaSummary };

        expect(tavola).toMatchObject({
          nameEn: 'Rear axle assembly',
          nameEnMachineTranslated: false,
        });
        expect(await tavola84(member)).toMatchObject({ nameEnMachineTranslated: false });
      });

      it('is an Editor’s, and a blank name is no name to vouch for', async () => {
        const tavolaId = await loadedAndPublished();
        const { part } = await partNumbered(editor, tavolaId, '208501');

        await member
          .put(`/api/parts/${part.id}/english-name`)
          .send({ nameEn: 'Differential case' })
          .expect(403);
        await member.put(`/api/tavole/${tavolaId}/english-name`).send({ nameEn: 'X' }).expect(403);
        await editor.put(`/api/parts/${part.id}/english-name`).send({ nameEn: ' ' }).expect(400);
        expect(await tavola84(member)).toMatchObject({ nameEnMachineTranslated: true });
      });
    });

    it('labels nothing an Editor recorded by hand', async () => {
      const grifo = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
      await givenTavola(app.db, grifo.id, { number: '2', nameEn: 'Front brakes' });

      const { tavole } = (await member.get(`/api/models/${grifo.id}`).expect(200)).body as {
        tavole: TavolaSummary[];
      };
      expect(tavole[0]).toMatchObject({ nameEnMachineTranslated: false });
    });
  });
});
