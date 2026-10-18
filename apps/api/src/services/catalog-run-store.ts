import type { Db } from '../db/client.js';
import type { ModelRow } from '../db/schema.js';
import { loadReadTavole, type ReadTavola } from '../migration/load-read-tavola.js';
import type { Clock } from '../platform/clock.js';
import type { Logger } from '../platform/logger.js';
import { NOTHING_DONE, type FinishedTavola, type ReadingStore } from '../reading/reading-store.js';
import type { CatalogRunRepository } from '../repositories/catalog-run-repository.js';
import type { FileStore } from '../storage/file-store.js';

/**
 * **A Catalog run's store** (issue #58): where the reading core keeps its progress when Ricambi
 * reads, rather than the read command's directory.
 *
 * What each page was found to be, and what the run has cost, are rows of the run. Each finished
 * Tavola goes straight through the loader `archive:load` uses (`load-read-tavola.ts`), so it is in
 * the archive as Unchecked while the run reads on, and an Editor can begin checking it. The loader
 * refuses a Published Tavola, and one with Contributions, as it always has: the run records why
 * and reads on.
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
      return NOTHING_DONE;
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
        at: clock.now(),
      });
    },

    async costed(record) {
      await catalogRunRepository.costed(runId, record);
    },

    async ended({ cost }) {
      const state =
        cost.stopped === 'spending-limit'
          ? 'stopped-at-limit'
          : cost.stopped === 'usage-limit'
            ? 'stopped-at-usage-limit'
            : 'finished';
      await catalogRunRepository.ended(runId, { state, cost }, clock.now());
    },
  };
}

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
