import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The platform's own legal notice and privacy statement (issue #9).
 *
 * Ricambi is the property that actually processes personal data, so it answers for itself rather
 * than pointing at the Club website. **Who the association is, and who handles the data on its
 * behalf, are things an Administrator writes on a screen** — the board changes, the host changes,
 * and neither is a deployment. They are also exactly the names this repository must never
 * contain, which is why every one below is invented.
 */
describe('the legal pages', () => {
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

  describe('the legal notice', () => {
    it('says who the association is, to somebody who has not signed in', async () => {
      await administrator
        .patch('/api/club')
        .send({
          legalName: 'An Invented Club e.V.',
          postalAddress: 'Musterstraße 1\n00000 Musterstadt\nGermany',
          representedBy: 'Erika Mustermann (chair), Max Mustermann (treasurer)',
          registerCourt: 'Amtsgericht Musterstadt',
          registerNumber: 'VR 0000',
          vatId: 'DE000000000',
          phone: '+49 000 000000',
          officeEmail: 'office@example.invalid',
          legalNoticeFurther: 'Responsible for content: Erika Mustermann, address as above.',
        })
        .expect(200);

      const read = await app.request().get('/api/legal-notice').expect(200);

      expect(read.body).toEqual({
        legalNotice: {
          name: 'An Invented Club e.V.',
          postalAddress: 'Musterstraße 1\n00000 Musterstadt\nGermany',
          representedBy: 'Erika Mustermann (chair), Max Mustermann (treasurer)',
          registerCourt: 'Amtsgericht Musterstadt',
          registerNumber: 'VR 0000',
          vatId: 'DE000000000',
          email: 'office@example.invalid',
          phone: '+49 000 000000',
          further: 'Responsible for content: Erika Mustermann, address as above.',
        },
      });
    });

    /**
     * An association nobody has described yet has no legal notice, and the answer says so in
     * nulls rather than in invented placeholders — a made-up address on a legal page is worse
     * than an empty one, because it looks finished.
     */
    it('is empty, and not invented, before anybody has written it', async () => {
      const read = await app.request().get('/api/legal-notice').expect(200);

      expect(read.body.legalNotice).toEqual({
        name: null,
        postalAddress: null,
        representedBy: null,
        registerCourt: null,
        registerNumber: null,
        vatId: null,
        email: null,
        phone: null,
        further: null,
      });
    });

    /**
     * The Club's record also holds the bank details and the reminder text, which are an
     * Administrator's. The open address answers with the legal notice and nothing beside it.
     */
    it('does not hand the Club’s bank details to the public with it', async () => {
      await administrator
        .patch('/api/club')
        .send({ legalName: 'An Invented Club e.V.', iban: 'DE00 0000 0000 0000 0000 00' })
        .expect(200);

      const read = await app.request().get('/api/legal-notice').expect(200);

      expect(JSON.stringify(read.body)).not.toContain('DE00');
    });

    it('is still only an Administrator’s to write', async () => {
      const member = await givenAMember(app, administrator);

      await member.agent.patch('/api/club').send({ legalName: 'Somebody Else' }).expect(403);
      await app.request().patch('/api/club').send({ legalName: 'Somebody Else' }).expect(401);
    });
  });

  describe('the privacy statement', () => {
    /**
     * The association is the controller, and a statement that does not say who that is and how
     * to reach them is addressed from nobody. The same record the legal notice is read from, so
     * the two pages cannot come to name different associations.
     */
    it('names the association as controller, and who answers for data protection', async () => {
      await administrator
        .patch('/api/club')
        .send({
          legalName: 'An Invented Club e.V.',
          postalAddress: 'Musterstraße 1\n00000 Musterstadt',
          officeEmail: 'office@example.invalid',
          dataProtectionContact: 'Erika Mustermann',
          dataProtectionEmail: 'privacy@example.invalid',
          supervisoryAuthority: 'The data-protection authority of an invented state',
          privacyFurther: 'The Club website has a statement of its own.',
        })
        .expect(200);

      const read = await app.request().get('/api/privacy').expect(200);

      expect(read.body).toEqual({
        retention: { accountYears: 3, paymentRecordYears: 10 },
        controller: {
          name: 'An Invented Club e.V.',
          postalAddress: 'Musterstraße 1\n00000 Musterstadt',
          email: 'office@example.invalid',
        },
        dataProtectionContact: { name: 'Erika Mustermann', email: 'privacy@example.invalid' },
        supervisoryAuthority: 'The data-protection authority of an invented state',
        processors: [],
        further: 'The Club website has a statement of its own.',
      });
    });

    it('names the processors, in a fixed order whatever order they were written in', async () => {
      await name('payment', { name: 'Invented Payments', location: 'Ireland' });
      await name('hosting', { name: 'Invented Hosting', location: 'Germany' });
      await name('email', { name: 'Invented Mail', location: 'France' });
      await name('storage', { name: 'Invented Backups', location: 'Finland' });

      const read = await app.request().get('/api/privacy').expect(200);

      expect(read.body.processors).toEqual([
        { role: 'hosting', name: 'Invented Hosting', location: 'Germany' },
        { role: 'storage', name: 'Invented Backups', location: 'Finland' },
        { role: 'email', name: 'Invented Mail', location: 'France' },
        { role: 'payment', name: 'Invented Payments', location: 'Ireland' },
      ]);
    });

    /**
     * Whether an agreement has been signed is the association's own record of its paperwork. A
     * member is owed the processor's name; nobody outside is owed the date of a contract.
     */
    it('does not publish whether the agreements are signed', async () => {
      await name('hosting', {
        name: 'Invented Hosting',
        location: 'Germany',
        agreementSignedOn: '2026-01-10',
      });

      const read = await app.request().get('/api/privacy').expect(200);

      expect(read.body.processors).toEqual([
        { role: 'hosting', name: 'Invented Hosting', location: 'Germany' },
      ]);
    });
  });

  /**
   * **Processor agreements, tracked to completion.** None may be outstanding when real members'
   * data lands, and "outstanding" has to be something the association can read off a screen
   * rather than remember.
   */
  describe('the association’s record of its processors', () => {
    it('holds who does what, where, and when the agreement was signed', async () => {
      await name('hosting', { name: 'Invented Hosting', location: 'Germany' });
      await name('email', {
        name: 'Invented Mail',
        location: 'France',
        agreementSignedOn: '2026-01-10',
      });

      const read = await administrator.get('/api/processors').expect(200);

      expect(read.body.processors).toEqual([
        { role: 'hosting', name: 'Invented Hosting', location: 'Germany', agreementSignedOn: null },
        {
          role: 'email',
          name: 'Invented Mail',
          location: 'France',
          agreementSignedOn: '2026-01-10',
        },
      ]);
    });

    /** One per role: naming the host again is correcting it, not acquiring a second one. */
    it('corrects a processor that is named again, rather than adding another', async () => {
      await name('hosting', { name: 'Invented Hosting', location: 'Germany' });
      await name('hosting', {
        name: 'Another Invented Host',
        location: 'Austria',
        agreementSignedOn: '2026-01-12',
      });

      const read = await administrator.get('/api/processors').expect(200);

      expect(read.body.processors).toEqual([
        {
          role: 'hosting',
          name: 'Another Invented Host',
          location: 'Austria',
          agreementSignedOn: '2026-01-12',
        },
      ]);
    });

    it('lets one go, when nobody does that for the Club any more', async () => {
      await name('error-tracking', { name: 'Invented Errors', location: 'Germany' });

      await administrator.delete('/api/processors/error-tracking').expect(204);

      const read = await app.request().get('/api/privacy').expect(200);
      expect(read.body.processors).toEqual([]);
    });

    it('refuses one with no name, no place, or a date that is not one', async () => {
      await administrator
        .put('/api/processors/hosting')
        .send({ name: ' ', location: 'Germany' })
        .expect(400);
      await administrator
        .put('/api/processors/hosting')
        .send({ name: 'Invented Hosting', location: '' })
        .expect(400);
      await administrator
        .put('/api/processors/hosting')
        .send({ name: 'Invented Hosting', location: 'Germany', agreementSignedOn: 'last week' })
        .expect(400);
      await administrator
        .put('/api/processors/hosting')
        .send({ name: 'Invented Hosting', location: 'Germany', agreementSignedOn: '2026-02-30' })
        .expect(400);
    });

    it('refuses a kind of processor the statement has no sentence for', async () => {
      await administrator
        .put('/api/processors/analytics')
        .send({ name: 'Invented Analytics', location: 'Germany' })
        .expect(400);
    });

    it('is an Administrator’s, to read and to write', async () => {
      const editor = await givenAMember(app, administrator, { role: 'editor' });
      const hosting = { name: 'Invented Hosting', location: 'Germany' };

      await editor.agent.get('/api/processors').expect(403);
      await editor.agent.put('/api/processors/hosting').send(hosting).expect(403);
      await editor.agent.delete('/api/processors/hosting').expect(403);
      await app.request().get('/api/processors').expect(401);
    });
  });

  function name(
    role: string,
    fields: { name: string; location: string; agreementSignedOn?: string },
  ) {
    return administrator.put(`/api/processors/${role}`).send(fields).expect(200);
  }
});
