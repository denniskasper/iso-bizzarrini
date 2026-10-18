import type { CatalogRunActionKind, CatalogRunState } from '@ricambi/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { violates } from '../db/constraints.js';
import {
  accounts,
  catalogRunActions,
  catalogRunPages,
  catalogRunTavole,
  catalogRuns,
  models,
  tavole,
  type CatalogRunActionRow,
  type CatalogRunRow,
  type CatalogRunTavolaRow,
  type ModelRow,
  type NewCatalogRunRow,
} from '../db/schema.js';
import type { CostRecord } from '../reading/cost.js';
import type { SheetIdentity } from '../reading/reading-method.js';
import type { DoneBefore } from '../reading/reading-store.js';
import type { MachineTranslation } from '../reading/translation.js';

/** A Catalog run with the Model it is for, which is how it is always shown. */
export interface CatalogRunWithModel {
  run: CatalogRunRow;
  model: ModelRow;
  /** The Tavole it has finished, in the order it finished them. */
  tavole: CatalogRunTavolaRow[];
  /** Who started, raised, continued and stopped it, oldest first. */
  actions: (CatalogRunActionRow & { byName: string | null })[];
}

/** The states a run that has stopped reading, and may be continued, is in (issue #59). */
export const STOPPED_STATES = [
  'stopped-at-limit',
  'stopped-at-usage-limit',
  'stopped-after-failures',
  'stopped-by-administrator',
] as const satisfies readonly CatalogRunState[];

export type StoppedState = (typeof STOPPED_STATES)[number];

/**
 * How a run that has stopped reading ended: with the cost record of its last time reading, or
 * with no request sent and only the reason.
 */
export type CatalogRunEnd =
  | { state: 'finished' | StoppedState; cost: CostRecord }
  | { state: 'failed'; failure: string }
  | { state: StoppedState; failure: string | null };

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
  /**
   * A stopped run set running again, held to `limit`. `'another is running'` as for `start`;
   * `'not stopped'` where it is not in a stopped state.
   */
  carryOn(
    id: string,
    carryOn: { limit: number },
  ): Promise<'running' | 'another is running' | 'not stopped'>;
  /** The runs left running, as the server finds them when it starts. */
  running(): Promise<string[]>;
  recordAction(
    runId: string,
    action: { action: CatalogRunActionKind; by: string | null; at: Date; limit?: number },
  ): Promise<void>;
  /** What the run's earlier times reading already did, as the reading core asks it. */
  done(runId: string): Promise<DoneBefore>;
  pageFound(runId: string, page: number, identity: SheetIdentity): Promise<void>;
  /** A Tavola the run finished, and the Unchecked Tavola it became, or why it did not. */
  tavolaFinished(
    runId: string,
    tavola: {
      number: string;
      modelId: string;
      refused: string | null;
      machineTranslations: MachineTranslation[];
      at: Date;
    },
  ): Promise<void>;
  /** The cost record of one time reading, `cost.run`, kept beside the others. */
  costed(runId: string, cost: CostRecord): Promise<void>;
  ended(runId: string, end: CatalogRunEnd, at: Date): Promise<void>;
}

export function createCatalogRunRepository(db: DbSession): CatalogRunRepository {
  /** `cost` in its place among the run's records, and the total spent over all of them. */
  async function withCost(runId: string, cost: CostRecord) {
    const [row] = await db
      .select({ costs: catalogRuns.costs })
      .from(catalogRuns)
      .where(eq(catalogRuns.id, runId))
      .limit(1);
    const costs = [...(row?.costs ?? [])];
    costs[cost.run - 1] = cost;
    const spent = costs.reduce((sum, record) => sum + (record?.total ?? 0), 0);
    return { costs, spent: Math.round(spent * 1_000_000) / 1_000_000 };
  }

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
      const actions = await db
        .select({ action: catalogRunActions, byName: accounts.name })
        .from(catalogRunActions)
        .leftJoin(accounts, eq(accounts.id, catalogRunActions.by))
        .where(eq(catalogRunActions.runId, id))
        .orderBy(asc(catalogRunActions.sequence));
      return {
        ...row,
        tavole: finished,
        actions: actions.map(({ action, byName }) => ({ ...action, byName })),
      };
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

    async carryOn(id, { limit }) {
      try {
        const running = await db
          .update(catalogRuns)
          .set({ state: 'running', spendingLimit: limit, failure: null, endedAt: null })
          .where(and(eq(catalogRuns.id, id), inArray(catalogRuns.state, [...STOPPED_STATES])))
          .returning({ id: catalogRuns.id });
        return running.length > 0 ? 'running' : 'not stopped';
      } catch (error) {
        if (violates(error, 'catalog_runs_one_running')) {
          return 'another is running';
        }
        throw error;
      }
    },

    async running() {
      const rows = await db
        .select({ id: catalogRuns.id })
        .from(catalogRuns)
        .where(eq(catalogRuns.state, 'running'));
      return rows.map((row) => row.id);
    },

    async recordAction(runId, { action, by, at, limit }) {
      await db
        .insert(catalogRunActions)
        .values({ runId, action, by, at, spendingLimit: limit ?? null });
    },

    async done(runId) {
      const [run] = await db
        .select({ costs: catalogRuns.costs })
        .from(catalogRuns)
        .where(eq(catalogRuns.id, runId))
        .limit(1);
      const pages = await db
        .select({ page: catalogRunPages.page, identity: catalogRunPages.identity })
        .from(catalogRunPages)
        .where(eq(catalogRunPages.runId, runId))
        .orderBy(asc(catalogRunPages.page));
      const finished = await db
        .select({
          number: catalogRunTavole.number,
          machineTranslations: catalogRunTavole.machineTranslations,
        })
        .from(catalogRunTavole)
        .where(eq(catalogRunTavole.runId, runId))
        .orderBy(asc(catalogRunTavole.finishedAt));
      return {
        run: (run?.costs.length ?? 0) + 1,
        pages,
        tavole: finished.map((tavola) => tavola.number),
        translations: finished.flatMap((tavola) => tavola.machineTranslations),
      };
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

    async tavolaFinished(runId, { number, modelId, refused, machineTranslations, at }) {
      const [loaded] = refused
        ? []
        : await db
            .select({ id: tavole.id })
            .from(tavole)
            .where(and(eq(tavole.modelId, modelId), eq(tavole.number, number)))
            .limit(1);
      const values = { tavolaId: loaded?.id ?? null, refused, machineTranslations, finishedAt: at };
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
        .set(await withCost(runId, cost))
        .where(eq(catalogRuns.id, runId));
    },

    async ended(runId, end, at) {
      await db
        .update(catalogRuns)
        .set(
          'cost' in end
            ? { state: end.state, ...(await withCost(runId, end.cost)), endedAt: at }
            : { state: end.state, failure: end.failure, endedAt: at },
        )
        .where(eq(catalogRuns.id, runId));
    },
  };
}
