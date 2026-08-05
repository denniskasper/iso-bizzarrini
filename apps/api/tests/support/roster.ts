import type { RosterEntry } from '@ricambi/contracts';
import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { expect } from 'vitest';
import { createPasswordHasher } from '../../src/access/passwords.js';
import { inviteAdministrator } from '../../src/composition/first-administrator.js';
import { TEST_PASSWORD_COST, type TestApp } from './test-app.js';

/**
 * Putting somebody on the roster and getting them signed in, the way it actually happens.
 *
 * **The link is read out of the e-mail.** Nothing here reaches into the database for a token or
 * calls a service directly: the Administrator adds a person, the archive sends a letter, and the
 * test does what the member does with it. That is the whole of ticket 14's flow, so a helper that
 * short-circuited it would leave the flow itself untested by everything that uses this.
 *
 * **There is one exception, and it is the one production has too.** Somebody has to be first, and
 * with the shared passphrase gone (ticket 15) the only way onto an empty roster is the bootstrap
 * an operator runs on the box. So that is what `givenAnAdministrator` calls — the same function
 * `roster:invite-administrator` calls — rather than a fixture of its own.
 */
export interface RecruitedMember {
  entry: RosterEntry;
  email: string;
  password: string;
  agent: TestAgent;
}

/** A password nobody would guess and every rule here allows. Ten characters is the minimum. */
export const A_GOOD_PASSWORD = 'a-quiet-afternoon-in-the-garage';

/**
 * The first Administrator, through the bootstrap — which is the only door into an empty roster.
 *
 * The letter is captured by `app.emails` whatever the application's own sender is doing, because
 * this is a **separate entry point** with edges of its own (ADR 0012) and not a request to the
 * application. That is what lets the test about an archive whose e-mail is broken still have
 * somebody to sign in as.
 */
export async function givenAnAdministrator(
  app: TestApp,
  overrides: { name?: string; email?: string; paidThrough?: string } = {},
): Promise<RecruitedMember> {
  const email = overrides.email ?? `administrator-${counter++}@club.example`;

  const { member } = await inviteAdministrator(
    {
      db: app.db,
      clock: app.clock,
      logger: app.logger,
      emailSender: app.emails,
      breachedPasswords: app.breached,
      publicUrl: app.config.publicUrl,
      passwordHasher: createPasswordHasher(TEST_PASSWORD_COST),
    },
    {
      name: overrides.name ?? 'An Administrator',
      email,
      ...(overrides.paidThrough === undefined ? {} : { paidThrough: overrides.paidThrough }),
    },
  );

  return { entry: member, email, password: A_GOOD_PASSWORD, agent: await activate(app, email) };
}

export async function givenAMember(
  app: TestApp,
  administrator: TestAgent,
  member: {
    name?: string;
    email?: string;
    paidThrough?: string;
    role?: 'member' | 'editor' | 'administrator';
    /** Leave the invitation unredeemed, for a test about somebody who never got round to it. */
    activate?: boolean;
  } = {},
): Promise<RecruitedMember> {
  const email = member.email ?? `member-${counter++}@club.example`;
  const added = await administrator
    .post('/api/roster')
    .send({
      name: member.name ?? 'A Member',
      email,
      paidThrough: member.paidThrough ?? '2026-12-31',
      ...(member.role === undefined ? {} : { role: member.role }),
    })
    .expect(201);

  const entry = added.body.member as RosterEntry;

  if (member.activate === false) {
    return { entry, email, password: A_GOOD_PASSWORD, agent: supertest.agent(app.app) };
  }

  return { entry, email, password: A_GOOD_PASSWORD, agent: await activate(app, email) };
}

/**
 * **Somebody who may edit the archive and keeps nothing** — which is what most of this suite
 * needs, and deliberately not an Administrator.
 *
 * Almost every test here is about a screen an Editor works on, and an Editor is the *narrowest*
 * role that can reach it. Running them as an Administrator would leave the difference between the
 * two untested by everything except the handful of tests that are about the difference.
 */
export async function givenAnEditor(app: TestApp): Promise<TestAgent> {
  const administrator = await givenAnAdministrator(app);
  const editor = await givenAMember(app, administrator.agent, {
    name: 'An Editor',
    role: 'editor',
  });
  return editor.agent;
}

/** Choosing a password from the link in the letter, which is what signs the browser in. */
async function activate(app: TestApp, email: string): Promise<TestAgent> {
  const agent = supertest.agent(app.app);
  await agent
    .post('/api/password-setups')
    .send({ token: linkTokenSentTo(app, email), password: A_GOOD_PASSWORD })
    .expect(201);
  return agent;
}

/** The token out of the most recent letter to this address — the link, as a member clicks it. */
export function linkTokenSentTo(app: TestApp, email: string): string {
  const letters = app.emails.sentTo(email);
  const latest = letters.at(-1);
  expect(latest, `nothing was sent to ${email}`).toBeDefined();

  const link = /\/set-password\?token=(\S+)/.exec(latest?.text ?? '');
  expect(link, `no set-password link in the letter to ${email}`).not.toBeNull();

  return decodeURIComponent(link?.[1] ?? '');
}

let counter = 1;
