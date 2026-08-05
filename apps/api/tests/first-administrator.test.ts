import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../src/access/passwords.js';
import { inviteAdministrator } from '../src/composition/first-administrator.js';
import { A_GOOD_PASSWORD, linkTokenSentTo } from './support/roster.js';
import { startTestApp, TEST_PASSWORD_COST, type TestApp } from './support/test-app.js';

/**
 * **The only door into a system with an empty roster.**
 *
 * Ticket 15 took the shared passphrase away, which makes this the whole of "how does anybody get
 * in for the first time". A bootstrap nothing exercises is a bootstrap discovered to be broken by
 * the one person who cannot get in — on the evening the archive goes live, with nobody able to
 * fix it from inside.
 *
 * What is asserted is the end of the journey and not the middle: the command is run, and a person
 * who has never had a password ends up reading the archive and keeping the roster. The steps in
 * between are the ordinary invitation flow, proved in `roster.test.ts` like everybody else's.
 */
describe('the first Administrator', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
  });

  function bootstrap(person: { name: string; email: string; paidThrough?: string }) {
    return inviteAdministrator(
      {
        db: app.db,
        clock: app.clock,
        logger: app.logger,
        emailSender: app.emails,
        breachedPasswords: app.breached,
        publicUrl: app.config.publicUrl,
        passwordHasher: createPasswordHasher(TEST_PASSWORD_COST),
      },
      person,
    );
  }

  it('puts somebody on an empty roster and gets them into the archive', async () => {
    // Typed the way an operator types it at a shell, capitals and all.
    const { member, promoted } = await bootstrap({
      name: 'A Person',
      email: 'A.Person@Club.Example',
    });

    expect(promoted).toBe(false);
    expect(member).toMatchObject({
      role: 'administrator',
      email: 'a.person@club.example',
      // Invited, not active: **it sets no password.** That is the whole improvement over the
      // passphrase it replaces — the operator running it never learns a credential.
      standing: 'invited',
    });
    // A year, where nobody said how long. The clock reads 15 January 2026.
    expect(member.paidThrough).toBe('2027-01-15');

    const agent = app.agent();
    await agent
      .post('/api/password-setups')
      .send({
        token: linkTokenSentTo(app, 'a.person@club.example'),
        password: A_GOOD_PASSWORD,
      })
      .expect(201);

    // Both halves of what an Administrator is for: the roster, and the archive itself.
    await agent.get('/api/roster').expect(200);
    await agent.get('/api/models').expect(200);
  });

  /** It is run on production, by hand, possibly twice. Twice must not mean two of anybody. */
  it('promotes somebody already on the roster rather than making a second of them', async () => {
    await bootstrap({ name: 'A Person', email: 'a.person@club.example' });
    const again = await bootstrap({ name: 'A Person', email: 'a.person@club.example' });

    expect(again.promoted).toBe(true);
    expect(again.member.role).toBe('administrator');

    const counted = await app.db.execute('select count(*)::int as n from accounts');
    expect((counted.rows[0] as { n: number }).n).toBe(1);
  });

  /** An opening term the Club states, for a roster that predates this system. */
  it('takes the Paid-through it is given', async () => {
    const { member } = await bootstrap({
      name: 'A Person',
      email: 'a.person@club.example',
      paidThrough: '2026-06-30',
    });

    expect(member.paidThrough).toBe('2026-06-30');
  });
});
