import type { CatalogRunActionKind, CatalogRunState } from '@ricambi/contracts';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { DbSession } from '../db/client.js';
import { violates } from '../db/constraints.js';
import {
  accounts,
  catalogRunActions,
  catalogRunPages,
  catalogRunTavole,
  catalogRuns,
  contributions,
  models,
  positions,
  tavole,
  type CatalogRunActionRow,
  type CatalogRunRow,
  type CatalogRunTavolaRow,
  type ModelRow,
  type NewCatalogRunRow,
  type TavolaRow,
} from '../db/schema.js';
import { withCutOff, type CostRecord } from '../reading/cost.js';
import type { SheetIdentity } from '../reading/reading-method.js';
import type { DoneBefore } from '../reading/reading-store.js';
import type { MachineTranslation } from '../reading/translation.js';
import { addSpending, monthOf } from './spending-repository.js';

/** A Catalog run with the Model it is for, which is how it is always shown. */
export interface CatalogRunWithModel {
  run: CatalogRunRow;
  model: ModelRow;
  /**
   * The Tavole it has finished, in the order it finished them, with the name of whoever removed
   * the Tavola one became, and the later run that read it again and so replaced it.
   */
  tavole: (CatalogRunTavolaRow & { removedByName: string | null; replacedBy: string | null })[];
  /** What each page it has asked about was found to be, in page order. */
  pages: { page: number; identity: SheetIdentity }[];
  /** Who started, raised, continued and stopped it, and removed a Tavola it read, oldest first. */
  actions: (CatalogRunActionRow & { byName: string | null })[];
}

/** The states a run that has stopped reading, and may be continued, is in (issue #59). */
export const STOPPED_STATES = [
  'stopped-at-limit',
  'stopped-at-usage-limit',
  'stopped-at-monthly-limit',
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
  /**
   * A new run. `'another is reading'` where it is added `estimating` while another run is being
   * estimated or is running: the database keeps it to one at a time (issue #65).
   */
  add(run: NewCatalogRunRow): Promise<CatalogRunRow | 'another is reading'>;
  findById(id: string): Promise<CatalogRunWithModel | null>;
  /** Every run with the Model it is for, the latest first (issue #62). */
  /** Every run, the latest first, with how many of the Tavole it read have been removed. */
  list(): Promise<{ run: CatalogRunRow; model: ModelRow; removed: number }[]>;
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
  /** The runs left being estimated, as the server finds them when it starts (issue #65). */
  estimating(): Promise<string[]>;
  /** Whether any run is being estimated or is running: the one thing being read. */
  busy(): Promise<boolean>;
  /**
   * One more of an estimating run's pages priced, after `after` of them, making its estimate so
   * far `estimate`. `false`, and nothing kept, where the run is no longer being estimated or
   * another server has priced that page already.
   */
  pageEstimated(runId: string, page: { after: number; estimate: number }): Promise<boolean>;
  /** An estimating run's every page priced, at `estimate` in all. */
  estimated(runId: string, estimate: number): Promise<void>;
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
  /**
   * The cost record of one time reading, `cost.run`, kept beside the others, at `at`: what it
   * adds to the run's total is spent in that month.
   */
  costed(runId: string, cost: CostRecord, at: Date): Promise<void>;
  /**
   * Any request the run's records have still awaiting its answer, cut off: kept at the most it
   * could cost, and counted in what the run has spent (issue #66). Asked before a run reads again,
   * when nothing in this process can still be waiting for one. What they add is spent at `at`.
   */
  cutOff(runId: string, at: Date): Promise<void>;
  /** How the run ended. One that ends with no cost record has nothing awaiting an answer. */
  ended(runId: string, end: CatalogRunEnd, at: Date): Promise<void>;
  /** The pages the run put into no Tavola, and why, in place of any it set aside before. */
  setAside(runId: string, pages: { page: number; reason: string }[]): Promise<void>;
  /**
   * A Tavola an Administrator is removing, recorded on the line of the latest run that produced it,
   * with a `removed` action carrying its number (issue #85). Asked before the Tavola is deleted,
   * which empties that line's `tavolaId`. The run it was recorded on, or `null` where no run read it.
   */
  tavolaRemoved(tavolaId: string, removal: { by: string; at: Date }): Promise<string | null>;
  /**
   * A Tavola as reading it again needs it (issue #61): its state, whether its Positions have
   * Contributions, and the run that last read it, if one did. `null` where there is no such Tavola.
   */
  tavolaToReadAgain(
    where: { tavolaId: string } | { modelId: string; number: string },
  ): Promise<TavolaToReadAgain | null>;
}

export interface TavolaToReadAgain {
  id: string;
  modelId: string;
  number: string;
  state: TavolaRow['state'];
  hasContributions: boolean;
  /** The Catalog run whose reading it is, or `null` where it was loaded some other way. */
  runId: string | null;
}

export function createCatalogRunRepository(db: DbSession): CatalogRunRepository {
  /** The run's records, and the total spent over all of them. */
  function withSpent(costs: CostRecord[]) {
    const spent = costs.reduce((sum, record) => sum + (record?.total ?? 0), 0);
    return { costs, spent: Math.round(spent * 1_000_000) / 1_000_000 };
  }

  /**
   * The run's records as `change` makes them, with its running total, and what that total grew
   * by added to the month (`at`, UTC) as Catalog runs, billed as the run is (issue #191). In one
   * transaction, so the month and the run never disagree. A total never shrinks a month.
   */
  async function keepCosts(
    runId: string,
    at: Date,
    change: (costs: CostRecord[]) => CostRecord[],
    alongside: Partial<NewCatalogRunRow> = {},
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          costs: catalogRuns.costs,
          spent: catalogRuns.spent,
          charged: catalogRuns.charged,
        })
        .from(catalogRuns)
        .where(eq(catalogRuns.id, runId))
        .for('update');
      if (!row) {
        return;
      }
      const { costs, spent } = withSpent(change([...row.costs]));
      await tx
        .update(catalogRuns)
        .set({ ...alongside, costs, spent })
        .where(eq(catalogRuns.id, runId));
      const microUsd = Math.round(spent * 1_000_000) - Math.round(row.spent * 1_000_000);
      if (microUsd > 0) {
        await addSpending(tx, {
          month: monthOf(at),
          purpose: 'catalog-runs',
          billed: row.charged,
          microUsd,
        });
      }
    });
  }

  /** `cost` in its place among the run's records. */
  function withCost(cost: CostRecord) {
    return (costs: CostRecord[]) => {
      costs[cost.run - 1] = cost;
      return costs;
    };
  }

  /** The run's records with any request still awaiting its answer cut off. */
  function withCutOffs(costs: CostRecord[]) {
    // A run's records are kept by the time they were read; one never recorded is a gap.
    return costs.map((record) => record && withCutOff(record));
  }

  return {
    async add(run) {
      try {
        const [row] = await db.insert(catalogRuns).values(run).returning();
        if (!row) {
          throw new Error('Recording a Catalog run returned nothing.');
        }
        return row;
      } catch (error) {
        if (violates(error, 'catalog_runs_one_reading')) {
          return 'another is reading';
        }
        throw error;
      }
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
        .select({ tavola: catalogRunTavole, removedByName: accounts.name })
        .from(catalogRunTavole)
        .leftJoin(accounts, eq(accounts.id, catalogRunTavole.removedBy))
        .where(eq(catalogRunTavole.runId, id))
        .orderBy(asc(catalogRunTavole.finishedAt));
      // The runs into the same Model that read one of these numbers later and loaded it: the
      // first of them replaced the Tavola this run's line became.
      const numbers = finished.map(({ tavola }) => tavola.number);
      const later =
        numbers.length === 0
          ? []
          : await db
              .select({
                runId: catalogRunTavole.runId,
                number: catalogRunTavole.number,
                finishedAt: catalogRunTavole.finishedAt,
              })
              .from(catalogRunTavole)
              .innerJoin(catalogRuns, eq(catalogRuns.id, catalogRunTavole.runId))
              .where(
                and(
                  eq(catalogRuns.modelId, row.run.modelId),
                  inArray(catalogRunTavole.number, numbers),
                  ne(catalogRunTavole.runId, id),
                  isNull(catalogRunTavole.refused),
                ),
              )
              .orderBy(asc(catalogRunTavole.finishedAt));
      const replacedBy = ({ tavola }: (typeof finished)[number]): string | null =>
        tavola.tavolaId !== null || tavola.removedAt !== null || tavola.refused !== null
          ? null
          : (later.find(
              (other) => other.number === tavola.number && other.finishedAt > tavola.finishedAt,
            )?.runId ?? null);
      const pages = await db
        .select({ page: catalogRunPages.page, identity: catalogRunPages.identity })
        .from(catalogRunPages)
        .where(eq(catalogRunPages.runId, id))
        .orderBy(asc(catalogRunPages.page));
      const actions = await db
        .select({ action: catalogRunActions, byName: accounts.name })
        .from(catalogRunActions)
        .leftJoin(accounts, eq(accounts.id, catalogRunActions.by))
        .where(eq(catalogRunActions.runId, id))
        .orderBy(asc(catalogRunActions.sequence));
      return {
        ...row,
        tavole: finished.map((line) => ({
          ...line.tavola,
          removedByName: line.removedByName,
          replacedBy: replacedBy(line),
        })),
        pages,
        actions: actions.map(({ action, byName }) => ({ ...action, byName })),
      };
    },

    async list() {
      const runs = await db
        .select({ run: catalogRuns, model: models })
        .from(catalogRuns)
        .innerJoin(models, eq(models.id, catalogRuns.modelId))
        .orderBy(desc(catalogRuns.createdAt), desc(catalogRuns.id));
      const removed = await db
        .select({ runId: catalogRunTavole.runId, removed: count() })
        .from(catalogRunTavole)
        .where(isNotNull(catalogRunTavole.removedAt))
        .groupBy(catalogRunTavole.runId);
      const removedBy = new Map(removed.map((one) => [one.runId, one.removed]));
      return runs.map((one) => ({ ...one, removed: removedBy.get(one.run.id) ?? 0 }));
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
        if (violates(error, 'catalog_runs_one_reading')) {
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
        if (violates(error, 'catalog_runs_one_reading')) {
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

    async estimating() {
      const rows = await db
        .select({ id: catalogRuns.id })
        .from(catalogRuns)
        .where(eq(catalogRuns.state, 'estimating'));
      return rows.map((row) => row.id);
    },

    async busy() {
      const [row] = await db
        .select({ id: catalogRuns.id })
        .from(catalogRuns)
        .where(inArray(catalogRuns.state, ['estimating', 'running']))
        .limit(1);
      return !!row;
    },

    async pageEstimated(runId, { after, estimate }) {
      const priced = await db
        .update(catalogRuns)
        .set({ estimate, pagesEstimated: after + 1 })
        .where(
          and(
            eq(catalogRuns.id, runId),
            eq(catalogRuns.state, 'estimating'),
            eq(catalogRuns.pagesEstimated, after),
          ),
        )
        .returning({ id: catalogRuns.id });
      return priced.length > 0;
    },

    async estimated(runId, estimate) {
      await db
        .update(catalogRuns)
        .set({ state: 'estimated', estimate })
        .where(and(eq(catalogRuns.id, runId), eq(catalogRuns.state, 'estimating')));
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

    async costed(runId, cost, at) {
      await keepCosts(runId, at, withCost(cost));
    },

    async cutOff(runId, at) {
      await keepCosts(runId, at, withCutOffs);
    },

    async ended(runId, end, at) {
      if ('cost' in end) {
        await keepCosts(runId, at, withCost(end.cost), { state: end.state, endedAt: at });
      } else {
        await keepCosts(runId, at, withCutOffs, {
          state: end.state,
          failure: end.failure,
          endedAt: at,
        });
      }
    },

    async setAside(runId, pages) {
      await db
        .update(catalogRuns)
        .set({ setAside: [...pages].sort((a, b) => a.page - b.page) })
        .where(eq(catalogRuns.id, runId));
    },

    async tavolaRemoved(tavolaId, { by, at }) {
      const [line] = await db
        .select({
          id: catalogRunTavole.id,
          runId: catalogRunTavole.runId,
          number: catalogRunTavole.number,
        })
        .from(catalogRunTavole)
        .where(eq(catalogRunTavole.tavolaId, tavolaId))
        .orderBy(desc(catalogRunTavole.finishedAt))
        .limit(1);
      if (!line) {
        return null;
      }
      await db
        .update(catalogRunTavole)
        .set({ removedAt: at, removedBy: by })
        .where(eq(catalogRunTavole.id, line.id));
      await db
        .insert(catalogRunActions)
        .values({ runId: line.runId, action: 'removed', by, at, tavola: line.number });
      return line.runId;
    },

    async tavolaToReadAgain(where) {
      const [tavola] = await db
        .select({
          id: tavole.id,
          modelId: tavole.modelId,
          number: tavole.number,
          state: tavole.state,
        })
        .from(tavole)
        .where(
          'tavolaId' in where
            ? eq(tavole.id, where.tavolaId)
            : and(eq(tavole.modelId, where.modelId), eq(tavole.number, where.number)),
        )
        .limit(1);
      if (!tavola) {
        return null;
      }
      const [contribution] = await db
        .select({ id: contributions.id })
        .from(contributions)
        .innerJoin(positions, eq(positions.id, contributions.positionId))
        .where(eq(positions.tavolaId, tavola.id))
        .limit(1);
      const [read] = await db
        .select({ runId: catalogRunTavole.runId })
        .from(catalogRunTavole)
        .where(eq(catalogRunTavole.tavolaId, tavola.id))
        .orderBy(desc(catalogRunTavole.finishedAt))
        .limit(1);
      return { ...tavola, hasContributions: !!contribution, runId: read?.runId ?? null };
    },
  };
}
