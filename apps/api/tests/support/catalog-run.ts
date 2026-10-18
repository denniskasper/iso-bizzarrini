import type { CatalogRun, CatalogRunResponse } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import type { ConfiguredReading } from '../../src/composition/reading.js';
import type { ModelRow } from '../../src/db/schema.js';
import { fakeReadingMethod, type FakeMethodOptions, type InventedPage } from './catalog-reading.js';
import { fixturePdf } from './fixture-pdf.js';

/** A Reading method that can be held at one request, to look at a run while it is going. */
export function heldReadingMethod(pages: InventedPage[], options: FakeMethodOptions = {}) {
  const method = fakeReadingMethod(pages, options);
  let held: { call: string; release: () => void; reached: () => void } | null = null;
  let reached: Promise<void> = Promise.resolve();
  const readTable = method.readTable.bind(method);
  method.readTable = async (sheet, reading) => {
    if (held && held.call === `read ${sheet.page} ${reading}`) {
      const waiting = held;
      held = null;
      await new Promise<void>((release) => {
        waiting.release = release;
        waiting.reached();
      });
    }
    return readTable(sheet, reading);
  };
  return Object.assign(method, {
    /** Holds the run when it asks for this, until `release` is called. */
    holdAt(call: string): { reached: Promise<void>; release: () => void } {
      const hold = { call, release: () => {}, reached: () => {} };
      reached = new Promise((resolve) => (hold.reached = resolve));
      held = hold;
      return { reached, release: () => hold.release() };
    },
  });
}

export function configured(method: ReturnType<typeof fakeReadingMethod>): ConfiguredReading {
  return { kind: 'api-key', method, unavailable: null, invented: false };
}

export async function estimated(agent: TestAgent, model: ModelRow, pages = 2): Promise<CatalogRun> {
  const response = await agent
    .post('/api/catalog-runs')
    .query({ modelId: model.id, firstPage: '1', lastPage: String(pages) })
    .set('Content-Type', 'application/pdf')
    .send(fixturePdf(pages))
    .expect(201);
  return (response.body as CatalogRunResponse).run;
}

export function start(agent: TestAgent, run: CatalogRun, body: object) {
  return agent.post(`/api/catalog-runs/${run.id}/start`).send(body);
}

/** The run as its page shows it, once it is no longer running. */
export async function settled(agent: TestAgent, run: CatalogRun): Promise<CatalogRun> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const response = await agent.get(`/api/catalog-runs/${run.id}`).expect(200);
    const current = (response.body as CatalogRunResponse).run;
    if (current.state !== 'running') {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Catalog run ${run.id} was still running.`);
}

/** A stopped run continued, with `body` as the request: `{ limit }` to raise its limit first. */
export function carryOn(agent: TestAgent, run: CatalogRun, body: object = {}) {
  return agent.post(`/api/catalog-runs/${run.id}/continue`).send(body);
}

export function stop(agent: TestAgent, run: CatalogRun) {
  return agent.post(`/api/catalog-runs/${run.id}/stop`);
}
