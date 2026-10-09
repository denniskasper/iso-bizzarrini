import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The Club's own record — the fee, the bank details, the payment reference and the reminder text.
 *
 * All of it editable on a screen (story 130), because **a change of bank must not need a
 * developer**. Nothing in here is a rule the software enforces: it is what the association says
 * about itself, and the software's job is to hold it and hand it back unaltered.
 */
describe('the Club', () => {
  let app: TestApp;
  let administrator: TestAgent;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await app.reset();
    administrator = (await givenAnAdministrator(app)).agent;
  });

  /**
   * An unwritten Club is a fee of nothing and no bank details yet, which is exactly true of a
   * system nobody has configured. Saying so in code rather than in a migration means changing the
   * answer is changing one file.
   */
  it('reads as an unconfigured association before anybody has said anything', async () => {
    const response = await administrator.get('/api/club').expect(200);

    expect(response.body.club).toMatchObject({
      fee: '0.00',
      currency: 'EUR',
      iban: null,
      bankName: null,
    });
    expect(response.body.club.paymentReference).toContain('{year}');
  });

  it('holds the fee, the bank details, the reference format and the reminder text', async () => {
    const saved = await administrator
      .patch('/api/club')
      .send({
        fee: '45.00',
        currency: 'EUR',
        bankAccountHolder: 'The Club',
        bankName: 'A Bank',
        iban: 'DE00 0000 0000 0000 0000 00',
        bic: 'ABCDEFGH',
        paymentReference: 'Ricambi {year} {name}',
        reminderText: 'Your membership runs out shortly.',
      })
      .expect(200);

    expect(saved.body.club).toMatchObject({
      fee: '45.00',
      currency: 'EUR',
      bankAccountHolder: 'The Club',
      bankName: 'A Bank',
      iban: 'DE00 0000 0000 0000 0000 00',
      bic: 'ABCDEFGH',
      paymentReference: 'Ricambi {year} {name}',
      reminderText: 'Your membership runs out shortly.',
      officeEmail: null,
    });

    const read = await administrator.get('/api/club').expect(200);
    expect(read.body).toEqual(saved.body);
  });

  /** A screen changing the IBAN must not have to send the reminder text back to keep it. */
  it('changes only what it was sent', async () => {
    await administrator
      .patch('/api/club')
      .send({ fee: '45.00', reminderText: 'The treasurer’s own words.' })
      .expect(200);

    const response = await administrator.patch('/api/club').send({ fee: '50.00' }).expect(200);

    expect(response.body.club).toMatchObject({
      fee: '50.00',
      reminderText: 'The treasurer’s own words.',
    });
  });

  /** Clearing a field and not touching it are different things, and both have to be sayable. */
  it('clears a bank detail that is sent empty', async () => {
    await administrator.patch('/api/club').send({ bic: 'ABCDEFGH' }).expect(200);

    const response = await administrator.patch('/api/club').send({ bic: '' }).expect(200);
    expect(response.body.club.bic).toBeNull();
  });

  it('reads a fee typed the way a treasurer types one', async () => {
    for (const [typed, stored] of [
      ['45', '45.00'],
      ['45,50', '45.50'],
      ['0', '0.00'],
    ]) {
      const response = await administrator.patch('/api/club').send({ fee: typed }).expect(200);
      expect(response.body.club.fee).toBe(stored);
    }
  });

  it('refuses a fee that is not a figure, rather than storing a guess', async () => {
    const response = await administrator
      .patch('/api/club')
      .send({ fee: 'about fifty euro' })
      .expect(400);

    expect(response.body.error.message).toMatch(/A fee is an amount/);
  });

  it('refuses a currency these cars do not trade in', async () => {
    await administrator.patch('/api/club').send({ currency: 'XYZ' }).expect(400);
  });

  /**
   * The reference format is the Club's own, and **nothing here parses what a member typed**.
   * Matching a transfer to a person is a human reading a statement; a machine deciding somebody
   * had not paid because their reference did not match a template would be worse than useless.
   */
  it('keeps the reference format exactly as it was written, placeholders and all', async () => {
    const response = await administrator
      .patch('/api/club')
      .send({ paymentReference: 'MITGLIED {year} — {name}' })
      .expect(200);

    expect(response.body.club.paymentReference).toBe('MITGLIED {year} — {name}');
  });

  describe('who may change it', () => {
    it('is refused to a member and to an Editor', async () => {
      const member = await givenAMember(app, administrator);
      const editor = await givenAMember(app, administrator, { role: 'editor' });

      await member.agent.get('/api/club').expect(403);
      await member.agent.patch('/api/club').send({ fee: '1.00' }).expect(403);
      await editor.agent.patch('/api/club').send({ fee: '1.00' }).expect(403);
    });

    it('is refused to a browser that has not signed in', async () => {
      await app.request().get('/api/club').expect(401);
    });
  });
});
