import type { RosterEntry } from '@ricambi/contracts';
import supertest from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { expect } from 'vitest';
import type { TestApp } from './test-app.js';

/**
 * Putting somebody on the roster and getting them signed in, the way it actually happens.
 *
 * **The link is read out of the e-mail.** Nothing here reaches into the database for a token or
 * calls a service directly: the Administrator adds a person, the archive sends a letter, and the
 * test does what the member does with it. That is the whole of ticket 14's flow, so a helper that
 * short-circuited it would leave the flow itself untested by everything that uses this.
 */
export interface RecruitedMember {
  entry: RosterEntry;
  email: string;
  password: string;
  agent: TestAgent;
}

/** A password nobody would guess and every rule here allows. Ten characters is the minimum. */
export const A_GOOD_PASSWORD = 'a-quiet-afternoon-in-the-garage';

/** The first Administrator, added through the stand-in gate — which is what it is for. */
export async function givenAnAdministrator(
  app: TestApp,
  overrides: { name?: string; email?: string; paidThrough?: string } = {},
): Promise<RecruitedMember> {
  return givenAMember(app, await app.editor(), { role: 'administrator', ...overrides });
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

  const agent = supertest.agent(app.app);
  await agent
    .post('/api/password-setups')
    .send({ token: linkTokenSentTo(app, email), password: A_GOOD_PASSWORD })
    .expect(201);

  return { entry, email, password: A_GOOD_PASSWORD, agent };
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
