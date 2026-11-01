import type { Db } from '../db/client.js';
import type { ModelRow } from '../db/schema.js';
import { loadReadTavole, type ReadTavola } from '../migration/load-read-tavola.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import type { CostRecord } from '../reading/cost.js';
import type { FinishedTavola, ReadingStore } from '../reading/reading-store.js';
import type { CatalogRunRepository, StoppedState } from '../repositories/catalog-run-repository.js';
import { setAsidePageKey, type FileStore } from '../storage/file-store.js';

/**
 * **A Catalog run's store** (issue #58): where the reading core keeps its progress when Ricambi
 * reads, rather than the read command's directory.
 *
 * What each page was found to be, and what the run has cost, are rows of the run. Each finished
 * Tavola goes straight through the loader `archive:load` uses (`load-read-tavola.ts`), so it is in
 * the archive as Unchecked while the run reads on, and an Editor can begin checking it. The loader
 * refuses a Published Tavola, and one with Contributions, as it always has: the run records why
 * and reads on.
 *
 * The pages it sets aside, a page whose Tavola number could not be read above all, are kept with
 * their images for an Administrator to look at, as the read command keeps them (issue #60).
 *
 * What it was told is also what it answers when the run is continued, after a stop or a restart
 * (issue #59): the pages already placed and the Tavole already finished are not asked about again.
 */
export function catalogRunStore(dependencies: {
  runId: string;
  model: ModelRow;
  db: Db;
  catalogRunRepository: CatalogRunRepository;
  fileStore: FileStore;
  clock: Clock;
  logger: Logger;
}): ReadingStore {
  const { runId, model, catalogRunRepository, clock } = dependencies;

  return {
    async done() {
      return catalogRunRepository.done(runId);
    },

    async started() {},

    async pageFound(page, identity) {
      await catalogRunRepository.pageFound(runId, page, identity);
    },

    async tavolaFinished(tavola) {
      const report = await loadReadTavole({
        db: dependencies.db,
        fileStore: dependencies.fileStore,
        clock,
        logger: dependencies.logger,
        reading: `Catalog run ${runId}`,
        model,
        tavole: [readTavolaOf(tavola)],
      });
      const [outcome] = report.tavole;
      await catalogRunRepository.tavolaFinished(runId, {
        number: tavola.number,
        modelId: model.id,
        refused: outcome?.outcome === 'refused' ? (outcome.reason ?? 'It was refused.') : null,
        machineTranslations: tavola.machineTranslations,
        at: clock.now(),
      });
    },

    async costed(record) {
      await catalogRunRepository.costed(runId, record);
    },

    async ended({ cost, setAside }) {
      // Each time the run reads, it sets aside every page it has placed in no Tavola, the ones an
      // earlier time found as well, so this list stands in place of the one before.
      for (const page of setAside) {
        await dependencies.fileStore.write(setAsidePageKey(runId, page.page), page.image);
      }
      await catalogRunRepository.setAside(
        runId,
        setAside.map(({ page, reason }) => ({ page, reason })),
      );
      const state = cost.stopped === null ? 'finished' : STOPPED[cost.stopped];
      await catalogRunRepository.ended(runId, { state, cost }, clock.now());
    },
  };
}

const STOPPED: Record<NonNullable<CostRecord['stopped']>, StoppedState> = {
  'spending-limit': 'stopped-at-limit',
  'usage-limit': 'stopped-at-usage-limit',
  'monthly-limit': 'stopped-at-monthly-limit',
  'method-failed': 'stopped-after-failures',
  asked: 'stopped-by-administrator',
};

/** A finished Tavola as the loader takes it: its cells as the read command writes them. */
export function readTavolaOf(tavola: FinishedTavola): ReadTavola {
  const contents = (image: Buffer) => async () => image;
  return {
    number: tavola.number,
    titleIt: tavola.titleIt,
    titleEn: tavola.titleEn,
    catalogSection: tavola.catalogSection,
    catalogGroup: tavola.catalogGroup,
    catalogSubgroup: tavola.catalogSubgroup,
    readingMethod: tavola.readingMethod,
    machineTranslations: tavola.machineTranslations,
    scan: tavola.scan ? contents(tavola.scan.image) : null,
    tableSheets: tavola.tableSheets.map((sheet) => contents(sheet.image)),
    listings: tavola.listings.map((listing) => ({
      position: listing.position,
      drawn: listing.drawn ? 'yes' : 'no',
      catalogNumber: listing.catalogNumber,
      disegnoOrigine: listing.disegnoOrigine,
      quantity: listing.quantity,
      nameIt: listing.nameIt,
      nameEn: listing.nameEn,
      catalogNote: listing.catalogNote,
      catalogNoteEn: listing.catalogNoteEn,
      fitmentQualifier: listing.fitmentQualifier,
      tableSheet: String(listing.tableSheet),
      doubt: listing.doubts.join('; '),
      readingNote: listing.notes.join('; '),
    })),
    marks: tavola.marks.map((mark) => ({
      position: mark.position,
      x: mark.x.toFixed(4),
      y: mark.y.toFixed(4),
    })),
    positionDoubts: tavola.doubts.map((doubt) => ({
      position: doubt.position,
      doubt: doubt.reason,
    })),
  };
}
