import type { Express } from 'express';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API_MOUNT } from '../src/routes/api-router.js';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { givenModel, givenScanImage, givenTavola } from './support/fixtures.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **Every address, asked of everybody who should not have it.**
 *
 * Ticket 14 stated the archive's rule once — a live Membership to read, an Editor to write, an
 * Administrator to keep the roster — rather than annotating thirty-five routes with it, and left
 * ticket 15 to prove the whole surface. This is that proof, and it is written as a *walk over the
 * router* rather than as a list somebody maintains: a route added next year is covered by this
 * file the moment it is added, and a route that quietly fell outside the gate fails it.
 *
 * The refusals it insists on are three, and they are different things:
 *
 * - **401** — nobody is signed in. Says nothing about anything, because the person asking has
 *   proved nothing.
 * - **403 `membership_lapsed`** — we know who this is and their term has run out. Names the date,
 *   because they *have* proved who they are.
 * - **403 `forbidden`** — we know who this is and this is not theirs. Signing in again would not
 *   help, which is exactly what separates it from the 401.
 */

/** One address, as the router has it. `path` still carries `:params`. */
interface Address {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
}

/**
 * Every address outside the gate, and why each one has to be.
 *
 * Asking to be let in cannot require already being in — that is the whole argument, and it covers
 * all of them but one. The exception is the status, which is here because the footer has to be
 * able to report that the database is unreachable to somebody who cannot sign in *because* the
 * database is unreachable.
 */
const OPEN = new Set([
  'GET /api/status',
  'GET /api/session',
  'POST /api/session',
  'DELETE /api/session',
  'POST /api/password-resets',
  'POST /api/password-setups',
  'POST /api/password-setups/inspect',
  // What the privacy statement quotes. A statement that could only be read after signing in
  // would be one nobody reads before handing over their address.
  'GET /api/privacy',
  // Who is behind the platform (issue #9). Addressed to whoever lands here, member or not.
  'GET /api/legal-notice',
  // Where the payment provider delivers (issue #4). Nobody is signed in at it; what it is
  // behind is the provider's signature over the bytes, which `subscriptions.test.ts` proves.
  'POST /api/payments/webhook',
]);

/** An Administrator's, and behind the role rather than behind a Membership. */
const ADMINISTRATORS_ONLY = new Set([
  'GET /api/roster',
  'POST /api/roster',
  'PATCH /api/roster/:accountId',
  'POST /api/roster/:accountId/invitation',
  'POST /api/roster/:accountId/payments',
  // Erasing one person, and the dry run of the retention sweep (issue #7, ADR 0007).
  'DELETE /api/roster/:accountId',
  'GET /api/roster/retention',
  // The Club's membership list, loaded instead of typed (ticket 16). Behind the role like the
  // rest of the roster: a lapsed Administrator loading the file that un-lapses the Club is
  // exactly who this must not stop.
  'POST /api/roster/import',
  'POST /api/roster/import/preview',
  // Who a renewal reminder would be written to, and running the job by hand (issue #3).
  'GET /api/reminders',
  'POST /api/reminders/run',
  'GET /api/club',
  'PATCH /api/club',
  // Who handles members' data for the association, and whether each agreement is signed
  // (issue #9). The names are published in the privacy statement; this record says more.
  'GET /api/processors',
  'PUT /api/processors/:role',
  'DELETE /api/processors/:role',
  // The list of Categories is kept by an Administrator (issue #8). An Editor chooses from it,
  // and is refused here like anybody else who is not one.
  'POST /api/categories',
  'PATCH /api/categories/:categoryId',
  // So are the Units and the Specification names (issue #109), for the same reason.
  'POST /api/units',
  'PATCH /api/units/:unitId',
  'DELETE /api/units/:unitId',
  'POST /api/specification-names',
  'PUT /api/specification-names/order',
  'PATCH /api/specification-names/:nameId',
  'DELETE /api/specification-names/:nameId',
]);

/**
 * An Administrator's, and **not there at all** for anybody else (issue #55): how the catalog is
 * read and what it costs is not something a Member is told exists, so the answer is a 404 rather
 * than a refusal. Behind the role, not behind a Membership.
 */
const HIDDEN_FROM_ALL_BUT_ADMINISTRATORS = new Set([
  'GET /api/reading-method',
  // A Catalog run, and the catalog it was uploaded with (issue #57).
  'POST /api/catalog-runs',
  'GET /api/catalog-runs/:runId',
  'GET /api/catalog-runs/:runId/catalog',
  // Starting one (issue #58).
  'POST /api/catalog-runs/:runId/start',
  // Stopping and continuing one (issue #59).
  'POST /api/catalog-runs/:runId/continue',
  'POST /api/catalog-runs/:runId/stop',
  // The pages one set aside (issue #60).
  'GET /api/catalog-runs/:runId/set-aside/:page',
  // Reading one Unchecked Tavola again (issue #61).
  'GET /api/catalog-runs/read-again',
  'POST /api/catalog-runs/read-again',
  // The list of past runs (issue #62).
  'GET /api/catalog-runs',
  // Removing an Unchecked Tavola (issue #83).
  'DELETE /api/tavole/:removing',
  // What removing it would take (issue #84).
  'GET /api/tavole/:removing/removal',
]);

/** Signed in is enough. It is what a lapsed member is shown instead of the archive. */
const ANY_MEMBER = new Set([
  'GET /api/renewal',
  // Paying through the platform (issue #4): the member who needs to is the one being refused.
  'GET /api/subscription',
  'POST /api/subscription',
  'PUT /api/subscription/auto-renewal',
  'GET /api/subscription/payments/:paymentId/receipt',
]);

/**
 * **The writes a Member may make, and there are exactly these** (issue #5). A Contribution is
 * something said *to* the archive rather than a change to it — nobody else is shown it until an
 * Editor has looked — so it takes what reading takes: a live Membership.
 *
 * Named one by one, and deliberately not as a pattern. The rule below is that every write is an
 * Editor's, and the way a write ends up outside it has to be that somebody added it to this list
 * on purpose.
 */
const A_MEMBERS_TO_WRITE = new Set([
  'POST /api/parts/:partId/contributions',
  'POST /api/positions/:positionId/contributions',
  'POST /api/contributions/:contributionId/photographs',
]);

/**
 * **The only reads in the archive that are not every member's** (issue #6): what members have
 * sent and nobody has checked. The rule is that a Membership buys reading, so a read outside it
 * is named here on purpose, exactly as a Member's writes are named above.
 */
const AN_EDITORS_TO_READ = new Set([
  'GET /api/contributions/waiting',
  'GET /api/contributions/waiting/count',
  // What has been typed under a Specification name before (issue #112): an Editor's tool for
  // writing a value the way the archive already does. Members read the values on the Part.
  'GET /api/specification-names/:nameId/suggestions',
]);

describe('who may reach what', () => {
  let app: TestApp;
  let administrator: TestAgent;
  let surface: Address[];

  beforeAll(async () => {
    app = await startTestApp();
    surface = addressesOf(app.app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
  });

  /**
   * The walk itself has to be believable before anything it asserts is worth anything. A reading
   * of the router that came back empty would make every test below pass without asking anything.
   */
  it('finds the whole surface, so what follows is asking about all of it', () => {
    expect(surface.length).toBeGreaterThan(40);

    for (const known of [
      ...OPEN,
      ...ADMINISTRATORS_ONLY,
      ...HIDDEN_FROM_ALL_BUT_ADMINISTRATORS,
      ...ANY_MEMBER,
      ...A_MEMBERS_TO_WRITE,
      ...AN_EDITORS_TO_READ,
    ]) {
      expect(surface.map(named), `${known} is not a route this application has`).toContain(known);
    }
  });

  it('refuses every address but the ways in to a browser that has not signed in', async () => {
    for (const address of surface) {
      if (OPEN.has(named(address))) {
        continue;
      }

      const response = await app.request()[address.method](fill(address.path));
      expect(response.status, `${named(address)} let a stranger in`).toBe(401);
      expect(response.body.error?.code).toBe('not_signed_in');
    }
  });

  /**
   * **The rule ticket 14 wrote more broadly than any box asked for**, proved here across the
   * whole archive: a Member reads, and everything that is not a `GET` is an Editor's.
   */
  describe('a member who is not an Editor', () => {
    let member: TestAgent;

    beforeEach(async () => {
      member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    });

    it('is refused every write in the archive, and told it is not a sign-in problem', async () => {
      for (const address of surface) {
        const name = named(address);
        if (address.method === 'get' || OPEN.has(name) || ADMINISTRATORS_ONLY.has(name)) {
          continue;
        }
        // Not refused but not there, which the test below asks of every hidden address.
        if (HIDDEN_FROM_ALL_BUT_ADMINISTRATORS.has(name)) {
          continue;
        }
        // What a member may do about their own subscription is theirs, live Membership or not.
        if (A_MEMBERS_TO_WRITE.has(name) || ANY_MEMBER.has(name)) {
          continue;
        }

        const response = await member[address.method](fill(address.path));
        expect(response.status, `${name} let a Member write`).toBe(403);
        expect(response.body.error?.code).toBe('forbidden');
      }
    });

    it('is refused the roster and the Club, which are an Administrator’s', async () => {
      for (const name of ADMINISTRATORS_ONLY) {
        const address = surface.find((route) => named(route) === name);
        const response = await member[address!.method](fill(address!.path));

        expect(response.status, `${name} let a Member in`).toBe(403);
        expect(response.body.error?.code).toBe('forbidden');
      }
    });

    /**
     * **And is let through to offer what they know.** Nothing is sent that could be written, so
     * what comes back is whatever the handler makes of an empty request about nothing — and the
     * only thing asserted is that it was the handler that answered and not the gate.
     */
    it('is not refused the writes that are a Member’s to make', async () => {
      for (const name of A_MEMBERS_TO_WRITE) {
        const address = surface.find((route) => named(route) === name);
        const response = await member[address!.method](fill(address!.path));

        expect([401, 403], `${name} refused a Member: ${response.status}`).not.toContain(
          response.status,
        );
      }
    });

    /** What is waiting to be checked is the one thing they were promised nobody would read. */
    it('is refused what members have sent that nobody has checked', async () => {
      for (const name of AN_EDITORS_TO_READ) {
        const address = surface.find((route) => named(route) === name);
        const response = await member[address!.method](fill(address!.path));

        expect(response.status, `${name} let a Member read the queue`).toBe(403);
        expect(response.body.error?.code).toBe('forbidden');
      }
    });

    /** What they *are* for. A refusal here would mean the gate had stopped being a gate. */
    it('reads the archive, which is what their Membership buys', async () => {
      await member.get('/api/models').expect(200);
      await member.get('/api/categories').expect(200);
      await member.get('/api/search?q=bracket').expect(200);
    });
  });

  /**
   * **An Editor is not an Administrator**, and the difference is the roster and the money. This
   * is the pair of roles that would otherwise be indistinguishable in practice, since almost
   * everything an Editor does is also something an Administrator may do.
   */
  it('lets an Editor write in the archive and keeps the roster from them', async () => {
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;

    await editor.post('/api/models').send({ brand: 'Iso', name: 'Grifo' }).expect(201);

    for (const name of ADMINISTRATORS_ONLY) {
      const address = surface.find((route) => named(route) === name);
      const response = await editor[address!.method](fill(address!.path));
      expect(response.status, `${name} let an Editor in`).toBe(403);
    }
  });

  /**
   * **A Membership is checked on every request, so a lapse takes effect at the next one** — the
   * rule the Club states is the rule that applies (story 20). Nothing about the session changes;
   * the answer to the same cookie simply becomes a different answer.
   */
  describe('a member whose Membership has run out', () => {
    let lapsed: TestAgent;

    beforeEach(async () => {
      lapsed = (await givenAMember(app, administrator, { paidThrough: '2025-12-31' })).agent;
    });

    it('is refused the whole archive, by name and with the date', async () => {
      for (const address of surface) {
        const name = named(address);
        if (
          OPEN.has(name) ||
          ADMINISTRATORS_ONLY.has(name) ||
          HIDDEN_FROM_ALL_BUT_ADMINISTRATORS.has(name) ||
          ANY_MEMBER.has(name)
        ) {
          continue;
        }

        const response = await lapsed[address.method](fill(address.path));
        expect(response.status, `${name} was served to a lapsed member`).toBe(403);
        expect(response.body.error?.code, `${name} refused for the wrong reason`).toBe(
          'membership_lapsed',
        );
        expect(response.body.error?.details).toEqual({ paidThrough: '2025-12-31' });
      }
    });

    it('is still signed in, and is shown what to do about it', async () => {
      const session = await lapsed.get('/api/session').expect(200);
      expect(session.body).toMatchObject({ signedIn: true });

      await lapsed.get('/api/renewal').expect(200);
    });
  });

  /**
   * **The drawings are the thing the whole gate is for** (ADR 0006), and an image is the one
   * request a browser makes without anybody pressing anything — so it is worth proving on a real
   * scan rather than on a made-up address, and proving at the instant rather than in principle.
   */
  it('stops serving a drawing the moment the Membership behind it lapses', async () => {
    const member = await givenAMember(app, administrator, { paidThrough: '2026-01-31' });
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;

    const model = await givenModel(app.db, { brand: 'Iso', name: 'Grifo' });
    const tavola = await givenTavola(app.db, model.id, { number: '12' });
    const uploaded = await editor
      .put(`/api/tavole/${tavola.id}/scan`)
      .set('Content-Type', 'image/png')
      .send(await givenScanImage({ format: 'png' }))
      .expect(201);

    const { displayUrl, previewUrl } = uploaded.body.scan;
    await member.agent.get(displayUrl).expect(200);

    // The day after their term ends, and well inside the ninety days the session runs for:
    // what has changed is the Membership and nothing else — no sign-out and no new cookie.
    app.clock.setTo(new Date('2026-02-01T09:00:00.000Z'));

    for (const url of [displayUrl, previewUrl]) {
      const response = await member.agent.get(url);
      expect(response.status, `${url} was still being served`).toBe(403);
      expect(response.body.error?.code).toBe('membership_lapsed');
    }
  });

  it('answers anybody but an Administrator as if the hidden addresses were not there', async () => {
    const editor = (await givenAMember(app, administrator, { role: 'editor' })).agent;
    const member = (await givenAMember(app, administrator, { paidThrough: '2027-12-31' })).agent;
    const lapsed = (await givenAMember(app, administrator, { paidThrough: '2025-12-31' })).agent;
    const boss = await givenAnAdministrator(app, { paidThrough: '2025-12-31' });

    for (const name of HIDDEN_FROM_ALL_BUT_ADMINISTRATORS) {
      const address = surface.find((route) => named(route) === name);
      for (const [who, agent] of [
        ['an Editor', editor],
        ['a Member', member],
        ['a lapsed member', lapsed],
      ] as const) {
        const response = await agent[address!.method](fill(address!.path));
        expect(response.status, `${name} told ${who} it was there`).toBe(404);
      }
      // Let through, an Administrator is answered by the handler: about the id that names
      // nothing, or the upload that was not sent, and never with the gate's bare 404.
      const response = await boss.agent[address!.method](fill(address!.path));
      expect(response.status, `${name} kept a lapsed Administrator out`).not.toBe(403);
      expect(response.body.error?.message, `${name} hid itself from an Administrator`).not.toBe(
        'Not found.',
      );
    }
  });

  /**
   * **Deliberately not behind a Membership.** An Administrator who forgot to pay their own must
   * not be locked out of the one screen that records the payment — theirs or anybody else's.
   */
  it('lets a lapsed Administrator reach the roster that would un-lapse them', async () => {
    const boss = await givenAnAdministrator(app, { paidThrough: '2025-12-31' });

    await boss.agent.get('/api/models').expect(403);
    await boss.agent.get('/api/roster').expect(200);
    await boss.agent.get('/api/club').expect(200);
  });
});

/** `GET /api/models`, which is how a route is named in every expectation above. */
function named(address: Address): string {
  return `${address.method.toUpperCase()} ${address.path}`;
}

/**
 * A path with its parameters filled in. The value is a well-formed id that names nothing, so a
 * route that let the request through would answer 404 — which is a different number from every
 * refusal this file is about, and so cannot be mistaken for one.
 */
function fill(path: string): string {
  return path.replaceAll(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
}

const METHODS: readonly Address['method'][] = ['get', 'post', 'patch', 'put', 'delete'];

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: unknown[] };
  name?: string;
}

/**
 * Every address the application has, read off the router it actually built.
 *
 * A list written by hand is a list that goes stale the first time somebody adds a route and does
 * not think of this file — which is precisely the failure the ticket is about, since the way a
 * write ends up outside the gate is that nobody noticed it was outside the gate.
 *
 * **Express does not say where a router was mounted**, so this does not guess: it insists there
 * is exactly one mounted router and prefixes it with the constant that mounted it. A second one
 * — a static site, some future sub-application — makes this throw rather than quietly report
 * half the surface, which is the failure a test like this must never have.
 */
function addressesOf(app: Express): Address[] {
  const stack = (app as unknown as { router: { stack: Layer[] } }).router.stack;
  const mounted = stack.filter((layer) => layer.name === 'router' && layer.handle?.stack);

  if (mounted.length !== 1) {
    throw new Error(
      `Expected one mounted router and found ${mounted.length}. This walk prefixes what it ` +
        'finds with API_MOUNT, so it cannot be trusted until it knows which is which.',
    );
  }

  return (mounted[0]?.handle?.stack ?? []).flatMap((entry) => {
    const { route } = entry as Layer;
    if (!route) {
      return [];
    }
    return METHODS.filter((method) => route.methods[method]).map((method) => ({
      method,
      path: API_MOUNT + route.path,
    }));
  });
}
