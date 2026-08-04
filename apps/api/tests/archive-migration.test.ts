import type {
  CatalogModelResponse,
  CatalogModelsResponse,
  PositionListingsResponse,
  TavolaResponse,
} from '@ricambi/contracts';
import { eq } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  marks,
  parts,
  positions,
  relatedPositions,
  scans,
  subAssemblies,
} from '../src/db/schema.js';
import { loadArchive, type ArchiveLoadReport } from '../src/migration/load-archive.js';
import { createFileStore } from '../src/storage/file-store.js';
import {
  defaultArchivePlan,
  givenArchiveSource,
  partsSheet,
  type ArchiveSource,
  type ArchiveSourceFiles,
  type PartsRow,
} from './support/archive-source.js';
import { givenScanImage } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The migration of the Club's own spreadsheets and scans (ticket 13).
 *
 * It is tested at the same seam as everything else: a real Postgres, nothing of ours mocked,
 * and — where the loaded catalog is what is in question — read back over real HTTP, because
 * "the spreadsheets became the archive" is a claim about what a member can open, not about
 * which rows were inserted. The source directory is invented per test and thrown away; there
 * is no club material in this repository (`AGENTS.md`).
 */
describe('the club’s archive, migrated from its spreadsheets', () => {
  let app: TestApp;
  let editor: TestAgent;
  const opened: ArchiveSource[] = [];

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    editor = await app.editor();
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((source) => source.remove()));
  });

  async function givenSource(files: ArchiveSourceFiles = {}): Promise<ArchiveSource> {
    const source = await givenArchiveSource(files);
    opened.push(source);
    return source;
  }

  function run(source: ArchiveSource, options: { dryRun?: boolean } = {}) {
    return loadArchive({
      db: app.db,
      fileStore: createFileStore(app.filesPath),
      clock: app.clock,
      logger: app.logger,
      source: source.directory,
      dryRun: options.dryRun ?? false,
    });
  }

  async function load(files: ArchiveSourceFiles = {}): Promise<ArchiveLoadReport> {
    return run(await givenSource(files));
  }

  /** The catalog as a member walks it: car, drawing, number, part. */
  async function readPartsAt(number: string, tavolaNumber = '2') {
    const { models } = (await editor.get('/api/models').expect(200)).body as CatalogModelsResponse;
    const car = models.find((model) => model.name === 'Grifo');
    expect(car, 'the Grifo was not migrated').toBeDefined();

    const { tavole } = (await editor.get(`/api/models/${car?.id}`).expect(200))
      .body as CatalogModelResponse;
    const sheet = tavole.find((tavola) => tavola.number === tavolaNumber);
    expect(sheet, `tavola ${tavolaNumber} was not migrated`).toBeDefined();

    const drawing = (await editor.get(`/api/tavole/${sheet?.id}`).expect(200))
      .body as TavolaResponse;
    const position = drawing.positions.find((candidate) => candidate.number === number);
    expect(position, `position ${number} was not migrated`).toBeDefined();

    const { listings } = (await editor.get(`/api/positions/${position?.id}/listings`).expect(200))
      .body as PositionListingsResponse;
    return { car, sheet, drawing, position, listings };
  }

  it('becomes a catalog a member reads from the car down to the part', async () => {
    const report = await load();
    expect(report.rejected).toEqual([]);
    expect(report.rowsLoaded).toBe(2);

    const { car, sheet, drawing, listings } = await readPartsAt('207');

    expect(car).toMatchObject({ brand: 'Iso', series: 'GL 365', modelYears: '1965–68' });
    expect(sheet).toMatchObject({
      nameIt: 'Impianto frenante anteriore',
      nameEn: 'Front brake system',
    });
    expect(sheet?.category.name).toBe('Brakes');
    // The factory's own header, recorded verbatim as provenance.
    expect(drawing.tavola.provenance).toEqual({ section: '260', group: '03', subgroup: '150' });

    expect(listings).toHaveLength(1);
    expect(listings[0]?.part).toMatchObject({
      catalogNumber: '260 03 150',
      disegnoOrigine: '208503',
      nameIt: 'ASTA GUIDA PER CRISTALLO MONTANTE',
      nameEn: 'Window guide rod',
    });
    expect(listings[0]?.quantityPerCar).toBe(2);
    expect(listings[0]?.drawn).toBe(true);
  });

  it('keeps the sheet’s undrawn rows undrawn, since that is what fastens the drawn one', async () => {
    await load();

    const { listings } = await readPartsAt('208');
    expect(listings[0]?.drawn).toBe(false);
  });

  // **The re-runnability rule.** A migration is run more than once — a dry run, a fixed sheet, a
  // restored database — and a second run that duplicated the archive would be worse than none.
  it('runs twice without recording anything twice', async () => {
    const source = await givenSource();
    const first = await run(source);
    expect(first.parts).toEqual({ created: 2, matched: 0 });

    const again = await run(source);

    expect(again.parts).toEqual({ created: 0, matched: 2 });
    expect(again.listings).toEqual({ created: 0, matched: 2 });
    expect(again.positions).toEqual({ created: 0, matched: 2 });
    expect(again.tavole).toEqual({ created: 0, matched: 2 });
    expect(again.models).toEqual({ created: 0, matched: 2 });

    const { listings } = await readPartsAt('207');
    expect(listings).toHaveLength(1);
  });

  it('turns the repeating vehicle block into Fitments, in the words the sheet used', async () => {
    await load();

    const { listings } = await readPartsAt('207');
    const fitments = listings[0]?.part.fitments ?? [];

    expect(fitments).toHaveLength(2);
    // A qualifier is transcribed exactly; a bare "x" is a Fitment with nothing qualifying it.
    expect(fitments.find((fitment) => fitment.model.name === 'Grifo')?.qualifier).toBe(
      'fino al telaio 310',
    );
    expect(
      fitments.find((fitment) => fitment.model.name === 'Rivolta IR 300')?.qualifier,
    ).toBeNull();
  });

  it('maps the fixed supplier and OEM columns to Equivalents of the kind the plan assigned', async () => {
    const report = await load({
      parts: partsSheet({
        Model: 'grifo',
        Tavola: '2',
        'Pos.': '207',
        Codice: '260 03 210',
        Denominazione: 'TUBO FLESSIBILE FRENO',
        Girling: '64678231',
        'OEM no.': '4179987',
        'Donor car': 'Fiat 124 Coupé',
      }),
    });

    const { listings } = await readPartsAt('207');
    expect(listings[0]?.part.equivalents).toEqual([
      expect.objectContaining({ kind: 'oe-supplier', maker: 'Girling', reference: '64678231' }),
      expect.objectContaining({ kind: 'oem', maker: 'Fiat', reference: '4179987' }),
      // A donor vehicle's column holds the car, and the reference nobody knows stays absent.
      expect.objectContaining({
        kind: 'donor-vehicle',
        maker: 'Fiat 124 Coupé',
        reference: null,
      }),
    ]);

    // Which column was read as which kind is recorded, because the assignment was a judgement
    // somebody made about a spreadsheet and the report is where it is answerable afterwards.
    expect(report.equivalentColumns).toEqual([
      { column: 'Girling', kind: 'oe-supplier', maker: 'Girling' },
      { column: 'OEM no.', kind: 'oem', maker: 'Fiat' },
      // Null where the cell itself carries the maker, which is the donor vehicle's shape.
      { column: 'Donor car', kind: 'donor-vehicle', maker: null },
    ]);
  });

  it('loads a Source without its price when the sheet gives no date, and says so', async () => {
    const report = await load({
      parts: partsSheet(
        {
          Model: 'grifo',
          Tavola: '2',
          'Pos.': '207',
          Codice: '260 03 210',
          Denominazione: 'TUBO FLESSIBILE FRENO',
          'Shop link': 'https://example.invalid/ricambi/tubo',
          'Shop price': '245,00',
          'Shop seen': '2025-11-02',
          'Shop condition': 'NOS',
        },
        {
          Model: 'grifo',
          Tavola: '2',
          'Pos.': '208',
          Codice: '260 03 211',
          Denominazione: 'RACCORDO',
          'Shop link': 'https://example.invalid/ricambi/raccordo',
          'Shop price': '90,00',
        },
      ),
    });

    const priced = (await readPartsAt('207')).listings[0]?.part.sources ?? [];
    expect(priced[0]).toMatchObject({
      name: 'Ricambi Storici',
      url: 'https://example.invalid/ricambi/tubo',
      condition: 'new-old-stock',
      price: { amount: 24500, currency: 'EUR', observedOn: '2025-11-02' },
    });

    // The rule the whole archive turns on: an undated price is not loaded as a price. The
    // Source still arrives — losing where a part was available because a date was missing
    // would be the archive dropping the more useful of the two facts.
    const undated = (await readPartsAt('208')).listings[0]?.part.sources ?? [];
    expect(undated).toHaveLength(1);
    expect(undated[0]?.price).toBeNull();
    expect(report.warnings).toContainEqual(
      expect.objectContaining({
        line: 3,
        reason: expect.stringContaining('price'),
      }),
    );
  });

  /**
   * The loop this loader is built for — dry run, read the report, **correct the sheet**, run
   * again — is the case a re-run has to survive, and it is a harder one than running the same
   * file twice. Both of these are corrections a volunteer would make to their own spreadsheet
   * after reading the report.
   */
  describe('a sheet corrected between runs', () => {
    it('gives the Part its number rather than recording a second one beside it', async () => {
      const row: PartsRow = {
        Model: 'grifo',
        Tavola: '2',
        'Pos.': '207',
        Denominazione: 'ASTA GUIDA PER CRISTALLO MONTANTE',
        Name: 'Window guide rod',
      };

      await load({ parts: partsSheet(row) });
      const corrected = await load({ parts: partsSheet({ ...row, Codice: '260 03 150' }) });

      // One Part at that number, not one with it and one without — which the Position screen
      // would otherwise print side by side as two alternatives a member has to choose between.
      expect(corrected.parts).toEqual({ created: 0, matched: 1 });
      const { listings } = await readPartsAt('207');
      expect(listings).toHaveLength(1);
      expect(listings[0]?.part.catalogNumber).toBe('260 03 150');
    });

    it('fills in a quantity the sheet did not have a readable one for', async () => {
      const row: PartsRow = {
        Model: 'grifo',
        Tavola: '2',
        'Pos.': '207',
        Codice: '260 03 150',
        Denominazione: 'ASTA GUIDA',
      };

      // "a richiesta" — as required. It loads, without a count, and says so.
      const first = await load({ parts: partsSheet({ ...row, 'Q.tà': 'a.r.' }) });
      expect(first.warnings).toContainEqual(
        expect.objectContaining({ reason: expect.stringMatching(/quantity/i) }),
      );
      expect((await readPartsAt('207')).listings[0]?.quantityPerCar).toBeNull();

      const corrected = await load({ parts: partsSheet({ ...row, 'Q.tà': '2' }) });

      expect((await readPartsAt('207')).listings[0]?.quantityPerCar).toBe(2);
      expect(corrected.fieldsFilled).toBe(1);
    });
  });

  /**
   * The four currencies are a check constraint, and the whole load is one transaction — so a
   * cell the archive cannot read has to become a warning here, or it becomes a refused INSERT
   * that takes the entire archive down with it and writes no report to say why.
   */
  it('loads a Source without its price when the currency column says something unknown', async () => {
    const plan = defaultArchivePlan();
    const sources = (plan.parts as { sources: Record<string, unknown>[] }).sources;
    delete sources[0]?.currency;
    sources[0] = { ...sources[0], currencyColumn: 'Shop currency' };

    const report = await load({
      plan,
      parts: partsSheet({
        Model: 'grifo',
        Tavola: '2',
        'Pos.': '207',
        Codice: '260 03 150',
        Denominazione: 'ASTA GUIDA',
        'Shop link': 'https://example.invalid/ricambi/asta',
        'Shop price': '245,00',
        'Shop currency': 'Lire',
        'Shop seen': '02.11.2025',
      }),
    });

    const loaded = (await readPartsAt('207')).listings[0]?.part.sources ?? [];
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.price).toBeNull();
    expect(report.warnings).toContainEqual(
      expect.objectContaining({ reason: expect.stringMatching(/currency/i) }),
    );
    // And the load finished: an unreadable cell is a warning, never a refused INSERT that takes
    // the transaction — and therefore the whole archive — down with it.
    expect(report.rejected).toEqual([]);
  });

  it('links Related Positions once, however many rows name the link', async () => {
    await load({
      parts: partsSheet(
        {
          Model: 'grifo',
          Tavola: '2',
          'Pos.': '207',
          Denominazione: 'ASTA GUIDA',
          'Related Parts': '208',
        },
        {
          // The same link from the other end, which is how a spreadsheet records it: twice.
          Model: 'grifo',
          Tavola: '2',
          'Pos.': '208',
          Denominazione: 'GUIDA',
          'Related Parts': '207',
        },
      ),
    });

    const links = await app.db.select().from(relatedPositions);
    expect(links).toHaveLength(1);

    const sheetPositions = await app.db.select().from(positions);
    const ends = new Set([links[0]?.positionId, links[0]?.relatedPositionId]);
    expect(ends).toEqual(new Set(sheetPositions.map((position) => position.id)));
  });

  it('groups the Sub-Assembly’s position range into one named group', async () => {
    await load({
      parts: partsSheet(
        {
          Model: 'grifo',
          Tavola: '2',
          'Pos.': '207',
          Denominazione: 'ASTA GUIDA',
          'Sub-Assembly': 'Window Slider',
          'Sub-Assembly Positions': '207-209',
        },
        { Model: 'grifo', Tavola: '2', 'Pos.': '208', Denominazione: 'GUIDA' },
        { Model: 'grifo', Tavola: '2', 'Pos.': '209', Denominazione: 'RULLO' },
        { Model: 'grifo', Tavola: '2', 'Pos.': '210', Denominazione: 'MANIGLIA' },
      ),
    });

    const [group] = await app.db.select().from(subAssemblies);
    expect(group?.name).toBe('Window Slider');

    const grouped = await app.db
      .select()
      .from(positions)
      .where(eq(positions.subAssemblyId, group?.id ?? ''));
    expect(grouped.map((position) => position.number).sort()).toEqual(['207', '208', '209']);
  });

  it('ingests the scans in bulk, and leaves the ones already ingested alone', async () => {
    const source = await givenSource({ scans: { 'grifo-02.png': await givenScanImage() } });

    const first = await run(source);
    expect(first.scans).toEqual({ ingested: 1, alreadyIngested: 0 });

    const [scan] = await app.db.select().from(scans);
    const image = await editor.get(`/api/scans/${scan?.id}/display`).expect(200);
    expect(image.headers['content-type']).toBe('image/webp');

    const again = await run(source);
    expect(again.scans).toEqual({ ingested: 0, alreadyIngested: 1 });
    // The same scan, not a second one: the address a member's browser cached still answers.
    expect(await app.db.select().from(scans)).toEqual([scan]);
  });

  // Ticket 13, and the reason it is worth a line of its own: no existing data records where a
  // Position sits on a drawing. Loading Marks would mean inventing them.
  it('places no Marks — where a number sits on a drawing is human work', async () => {
    await load({ scans: { 'grifo-02.png': await givenScanImage() } });

    expect(await app.db.select().from(marks)).toEqual([]);
    const { drawing } = await readPartsAt('207');
    expect(drawing.positions.every((position) => position.marks.length === 0)).toBe(true);
  });

  it('writes nothing at all in a dry run, and reports what it would do', async () => {
    const source = await givenSource({ scans: { 'grifo-02.png': await givenScanImage() } });

    const report = await run(source, { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.parts).toEqual({ created: 2, matched: 0 });
    expect(report.scans).toEqual({ ingested: 1, alreadyIngested: 0 });

    const { models } = (await editor.get('/api/models').expect(200)).body as CatalogModelsResponse;
    expect(models).toEqual([]);
    expect(await app.db.select().from(scans)).toEqual([]);
  });

  it('says which rows it could not load and why, and loads the rest', async () => {
    const report = await load({
      parts: partsSheet(
        // A drawing the Tavole sheet does not have.
        { Model: 'grifo', Tavola: '99', 'Pos.': '1', Denominazione: 'IGNOTO' },
        // Nothing a member could be shown as a name.
        { Model: 'grifo', Tavola: '2', 'Pos.': '2', Codice: '260 03 999' },
        // Drawn or not is the one distinction that means the wrong parts arrive in the post,
        // so a value nobody can read is a refusal rather than a guess.
        { Model: 'grifo', Tavola: '2', 'Pos.': '3', Denominazione: 'VITE', Drawn: 'perhaps' },
        { Model: 'grifo', Tavola: '2', 'Pos.': '207', Denominazione: 'ASTA GUIDA' },
      ),
    });

    expect(report.rowsRead).toBe(4);
    expect(report.rowsLoaded).toBe(1);
    expect(report.rejected).toHaveLength(3);
    expect(report.rejected.map((problem) => problem.line)).toEqual([2, 3, 4]);
    expect(report.rejected[0]?.reason).toMatch(/tavola/i);
    expect(report.rejected[1]?.reason).toMatch(/name/i);
    expect(report.rejected[2]?.reason).toMatch(/drawn/i);
    expect(report.rejected.every((problem) => problem.file === 'parts.csv')).toBe(true);

    const { listings } = await readPartsAt('207');
    expect(listings).toHaveLength(1);
  });

  // The one box on this ticket that code cannot tick for itself: which catalog column is the
  // Catalog Number and which the Disegno Origine was settled by looking at an uncropped page.
  // What the loader can do is refuse to run until somebody has written down that they looked.
  it('refuses to load until the catalog columns have been confirmed against a page', async () => {
    const plan = defaultArchivePlan();
    (plan.catalogColumns as Record<string, unknown>).confirmedAgainst = 'TBD';
    const source = await givenSource({ plan });

    await expect(run(source)).rejects.toThrow(/uncropped/i);

    const { models } = (await editor.get('/api/models').expect(200)).body as CatalogModelsResponse;
    expect(models).toEqual([]);
  });

  /**
   * **The worry ADR 0005 exists for**, and the reason a re-run is safe: the migration fills
   * blanks and never writes over a field that has something in it. Re-running the spreadsheet a
   * Part came from cannot silently undo what the club has since worked out about it.
   */
  it('fills what the sheet knows and never overwrites what an Editor has recorded', async () => {
    const source = await givenSource();
    await run(source);

    const { listings } = await readPartsAt('207');
    const partId = listings[0]?.part.id ?? '';
    // Recorded through the Editor's hands, in the words the club uses. Arranged directly:
    // correcting a Part through the screens is ticket 25.
    await app.db
      .update(parts)
      .set({ nameEn: 'Window guide rod, early', note: 'Measured on a car in the workshop.' })
      .where(eq(parts.id, partId));

    const again = await run(source);

    const after = (await readPartsAt('207')).listings[0]?.part;
    expect(after?.nameEn).toBe('Window guide rod, early');
    expect(after?.note).toBe('Measured on a car in the workshop.');
    expect(again.parts).toEqual({ created: 0, matched: 2 });
  });
});
