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
]);

/** An Administrator's, and behind the role rather than behind a Membership. */
const ADMINISTRATORS_ONLY = new Set([
  'GET /api/roster',
  'POST /api/roster',
  'PATCH /api/roster/:accountId',
  'POST /api/roster/:accountId/invitation',
  'POST /api/roster/:accountId/payments',
  // The Club's membership list, loaded instead of typed (ticket 16). Behind the role like the
  // rest of the roster: a lapsed Administrator loading the file that un-lapses the Club is
  // exactly who this must not stop.
  'POST /api/roster/import',
  'POST /api/roster/import/preview',
  'GET /api/club',
  'PATCH /api/club',
]);

/** Signed in is enough. It is what a lapsed member is shown instead of the archive. */
const ANY_MEMBER = new Set(['GET /api/renewal']);

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

    for (const known of [...OPEN, ...ADMINISTRATORS_ONLY, ...ANY_MEMBER]) {
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
        if (OPEN.has(name) || ADMINISTRATORS_ONLY.has(name) || ANY_MEMBER.has(name)) {
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
