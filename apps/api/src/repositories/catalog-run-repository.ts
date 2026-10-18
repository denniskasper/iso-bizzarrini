import type { CatalogRunState } from '@ricambi/contracts';
import { and, asc, eq } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { violates } from '../db/constraints.js';
import {
  catalogRunPages,
  catalogRunTavole,
  catalogRuns,
  models,
  tavole,
  type CatalogRunRow,
  type CatalogRunTavolaRow,
  type ModelRow,
  type NewCatalogRunRow,
} from '../db/schema.js';
import type { CostRecord } from '../reading/cost.js';
import type { SheetIdentity } from '../reading/reading-method.js';

/** A Catalog run with the Model it is for, which is how it is always shown. */
export interface CatalogRunWithModel {
  run: CatalogRunRow;
  model: ModelRow;
  /** The Tavole it has finished, in the order it finished them. */
  tavole: CatalogRunTavolaRow[];
}

/** How a run that has stopped reading ended. */
export type CatalogRunEnd =
  | { state: Exclude<CatalogRunState, 'estimated' | 'running' | 'failed'>; cost: CostRecord }
  | { state: 'failed'; failure: string };

/** Catalog runs (ADR 0018). The repository knows about rows; nothing above it does. */
export interface CatalogRunRepository {
  add(run: NewCatalogRunRow): Promise<CatalogRunRow>;
  findById(id: string): Promise<CatalogRunWithModel | null>;
  /**
   * An estimated run set running. `'another is running'` where one already is: the database
   * keeps it to one at a time. `'not estimated'` where this one has been started before.
   */
  start(
    id: string,
    start: { limit: number; at: Date; by: string },
  ): Promise<'started' | 'another is running' | 'not estimated'>;
  pageFound(runId: string, page: number, identity: SheetIdentity): Promise<void>;
  /** A Tavola the run finished, and the Unchecked Tavola it became, or why it did not. */
  tavolaFinished(
    runId: string,
    tavola: { number: string; modelId: string; refused: string | null; at: Date },
  ): Promise<void>;
  costed(runId: string, cost: CostRecord): Promise<void>;
  ended(runId: string, end: CatalogRunEnd, at: Date): Promise<void>;
}

export function createCatalogRunRepository(db: DbSession): CatalogRunRepository {
  return {
    async add(run) {
      const [row] = await db.insert(catalogRuns).values(run).returning();
      if (!row) {
        throw new Error('Recording a Catalog run returned nothing.');
      }
      return row;
    },

    async findById(id) {
      const [row] = await db
        .select({ run: catalogRuns, model: models })
        .from(catalogRuns)
        .innerJoin(models, eq(models.id, catalogRuns.modelId))
        .where(eq(catalogRuns.id, id))
        .limit(1);
      if (!row) {
        return null;
      }
      const finished = await db
        .select()
        .from(catalogRunTavole)
        .where(eq(catalogRunTavole.runId, id))
        .orderBy(asc(catalogRunTavole.finishedAt));
      return { ...row, tavole: finished };
    },

    async start(id, { limit, at, by }) {
      try {
        const started = await db
          .update(catalogRuns)
          .set({ state: 'running', spendingLimit: limit, startedAt: at, startedBy: by })
          .where(and(eq(catalogRuns.id, id), eq(catalogRuns.state, 'estimated')))
          .returning({ id: catalogRuns.id });
        return started.length > 0 ? 'started' : 'not estimated';
      } catch (error) {
        if (violates(error, 'catalog_runs_one_running')) {
          return 'another is running';
        }
        throw error;
      }
    },

    async pageFound(runId, page, identity) {
      await db
        .insert(catalogRunPages)
        .values({ runId, page, identity })
        .onConflictDoUpdate({
          target: [catalogRunPages.runId, catalogRunPages.page],
          set: { identity },
        });
    },

    async tavolaFinished(runId, { number, modelId, refused, at }) {
      const [loaded] = refused
        ? []
        : await db
            .select({ id: tavole.id })
            .from(tavole)
            .where(and(eq(tavole.modelId, modelId), eq(tavole.number, number)))
            .limit(1);
      const values = { tavolaId: loaded?.id ?? null, refused, finishedAt: at };
      await db
        .insert(catalogRunTavole)
        .values({ runId, number, ...values })
        .onConflictDoUpdate({
          target: [catalogRunTavole.runId, catalogRunTavole.number],
          set: values,
        });
    },

    async costed(runId, cost) {
      await db
        .update(catalogRuns)
        .set({ cost, spent: cost.total })
        .where(eq(catalogRuns.id, runId));
    },

    async ended(runId, end, at) {
      await db
        .update(catalogRuns)
        .set(
          end.state === 'failed'
            ? { state: end.state, failure: end.failure, endedAt: at }
            : { state: end.state, cost: end.cost, spent: end.cost.total, endedAt: at },
        )
        .where(eq(catalogRuns.id, runId));
    },
  };
}
