import type { RosterEntry, RosterImportPlan, RosterImportRow } from '@ricambi/contracts';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { givenAMember, givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * **The Club's annual membership list, loaded instead of typed** (ticket 16).
 *
 * This is the one permanent import in the product (ADR 0005), and everything that makes it safe
 * enough to be one is in this file. A roster arrives once a year as a spreadsheet somebody keeps
 * by hand; the file may be truncated, half-exported, sorted wrong or written on a machine that
 * spells dates the other way round. **None of those may be able to take anybody's access away**,
 * and none of them may quietly grant it either.
 *
 * So the shape is: read the file, say exactly what it would do, and only then write — and what it
 * can do is add and update and nothing else.
 */
describe('loading the roster from a spreadsheet', () => {
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

  describe('a file of people the Club has', () => {
    it('records each of them with the term the file says they have paid for', async () => {
      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
          ['Marco Conti', 'marco@club.example', '2027-06-30'],
        ),
      );

      expect(plan.applied).toBe(true);
      expect(plan.tally).toMatchObject({ newMembers: 2, updated: 0, unchanged: 0, refused: 0 });

      const roster = await read();
      expect(entryFor(roster, 'giulia@club.example')).toMatchObject({
        name: 'Giulia Rossi',
        paidThrough: '2027-12-31',
        role: 'member',
      });
      expect(entryFor(roster, 'marco@club.example')).toMatchObject({
        paidThrough: '2027-06-30',
      });
    });

    /**
     * **Which of the Administrator's columns was read as what, before the rows.** A column read as
     * the wrong field produces a hundred plausible-looking rows, and this is the only place that
     * mistake is visible in one glance.
     */
    it('says which of the file’s own columns it read each field from', async () => {
      const plan = await previewing(
        sheet(
          ['Mitglied', 'E-Mail-Adresse', 'Bezahlt bis'],
          ['Giulia Rossi', 'g@club.example', '2027-12-31'],
        ),
      );

      expect(plan.columns).toEqual({
        name: 'Mitglied',
        email: 'E-Mail-Adresse',
        paidThrough: 'Bezahlt bis',
      });
      expect(plan.rows[0]?.outcome).toBe('new-member');
    });

    /** A clipboard is tab-separated and a German or Italian machine saves semicolons. */
    it('reads a sheet whatever its machine put between the cells', async () => {
      const plan = await previewing(
        'Name;E-mail;Paid through\nGiulia Rossi;giulia@club.example;2027-12-31',
      );

      expect(plan.columns.email).toBe('E-mail');
      expect(plan.rows[0]).toMatchObject({ email: 'giulia@club.example', outcome: 'new-member' });
    });

    it('refuses a file with no column it can read a person out of', async () => {
      const refusal = await administrator
        .post('/api/roster/import/preview')
        .send({ text: sheet(['Surname', 'Telephone'], ['Rossi', '0123']) })
        .expect(400);

      expect(refusal.body.error.message).toMatch(/Paid through/);
    });
  });

  /**
   * **Nothing is written until the Administrator has read what will happen** (story 122's real
   * requirement). The preview is the same reading the write does, so it cannot promise something
   * the write then does differently.
   */
  describe('the preview', () => {
    it('writes nothing whatever', async () => {
      const text = sheet(
        ['Name', 'E-mail', 'Paid through'],
        ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
      );

      const plan = await previewing(text);
      expect(plan.applied).toBe(false);
      expect(plan.tally.newMembers).toBe(1);

      // The roster still holds nobody but the Administrator who is looking at it.
      const roster = await read();
      expect(roster.some((entry) => entry.email === 'giulia@club.example')).toBe(false);
    });

    it('says the same thing the import then does', async () => {
      await givenAMember(app, administrator, {
        name: 'Marco Conti',
        email: 'marco@club.example',
        paidThrough: '2026-06-30',
      });

      const text = sheet(
        ['Name', 'E-mail', 'Paid through'],
        ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
        ['Marco Conti', 'marco@club.example', '2027-06-30'],
        ['Nobody At All', 'not an address', '2027-12-31'],
      );

      const planned = await previewing(text);
      const done = await importing(text);

      expect(planned.tally).toEqual(done.tally);
      expect(planned.rows.map(outcomeOf)).toEqual(done.rows.map(outcomeOf));
    });
  });

  /**
   * **The rule the whole ticket hangs on**: a truncated or partial file can never lock out the
   * membership. There is no outcome here that removes anybody, and somebody the file does not
   * mention is somebody the import does not touch.
   */
  describe('adding and updating only', () => {
    it('leaves everybody the file does not mention exactly as they were, and counts them', async () => {
      const staying = await givenAMember(app, administrator, {
        email: 'clara@club.example',
        paidThrough: '2026-12-31',
      });

      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
        ),
      );

      // The Administrator running it and the member the file left out.
      expect(plan.tally.untouched).toBe(2);

      const roster = await read();
      expect(entryFor(roster, 'clara@club.example')).toMatchObject({
        paidThrough: '2026-12-31',
        standing: 'active',
      });
      // Not merely on the roster: still able to read the archive.
      await staying.agent.get('/api/models').expect(200);
    });

    /**
     * **A file that says less than the roster does not take anything back.** Last year's export,
     * uploaded by mistake, is exactly the accident that would otherwise end a hundred memberships.
     */
    it('never moves a Paid-through backwards', async () => {
      const { entry } = await givenAMember(app, administrator, {
        email: 'clara@club.example',
        paidThrough: '2027-12-31',
      });

      const plan = await importing(
        sheet(['Name', 'E-mail', 'Paid through'], ['A Member', 'clara@club.example', '2026-06-30']),
      );

      expect(plan.rows[0]).toMatchObject({ outcome: 'unchanged' });
      expect(plan.rows[0]?.why).toMatch(/2027-12-31/);

      const roster = await read();
      expect(entryFor(roster, entry.email).paidThrough).toBe('2027-12-31');
    });

    it('changes nothing at all for a row the roster already agrees with', async () => {
      await givenAMember(app, administrator, {
        name: 'Clara Weiss',
        email: 'clara@club.example',
        paidThrough: '2027-12-31',
      });

      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Clara Weiss', 'clara@club.example', '2027-12-31'],
        ),
      );

      expect(plan.tally).toMatchObject({ newMembers: 0, updated: 0, unchanged: 1 });
    });

    /** Roles are appointed on the roster screen, deliberately (story 129). A file cannot do it. */
    it('cannot make anybody an Editor or an Administrator', async () => {
      const member = await givenAMember(app, administrator, { email: 'clara@club.example' });

      await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through', 'Role'],
          ['A Member', 'clara@club.example', '2028-12-31', 'administrator'],
        ),
      );

      const roster = await read();
      expect(entryFor(roster, 'clara@club.example').role).toBe('member');
      await member.agent.get('/api/roster').expect(403);
    });
  });

  describe('somebody the roster already has', () => {
    it('extends their Membership rather than recording a second Account', async () => {
      const member = await givenAMember(app, administrator, {
        email: 'clara@club.example',
        paidThrough: '2026-01-31',
      });
      app.clock.setTo(new Date('2026-02-05T09:00:00.000Z'));
      await member.agent.get('/api/models').expect(403);

      const plan = await importing(
        sheet(['Name', 'E-mail', 'Paid through'], ['A Member', 'clara@club.example', '2027-12-31']),
      );

      expect(plan.tally).toMatchObject({ newMembers: 0, updated: 1 });
      expect(plan.rows[0]?.onTheRoster).toMatchObject({ paidThrough: '2026-01-31' });

      const roster = await read();
      expect(roster.filter((entry) => entry.email === 'clara@club.example')).toHaveLength(1);
      expect(entryFor(roster, 'clara@club.example').paidThrough).toBe('2027-12-31');

      // **No account surgery whatsoever**: the session that was refused works again.
      await member.agent.get('/api/models').expect(200);
    });

    /** A term is one row and never an edit, so the money and the dates stay auditable. */
    it('grants the new term as a Membership of its own', async () => {
      const { entry } = await givenAMember(app, administrator, {
        email: 'clara@club.example',
        paidThrough: '2026-01-31',
      });

      await importing(
        sheet(['Name', 'E-mail', 'Paid through'], ['A Member', 'clara@club.example', '2027-12-31']),
      );

      const terms = await app.db.query.memberships.findMany({
        where: (row, { eq }) => eq(row.accountId, entry.id),
      });
      expect(terms.map((term) => term.paidThrough).sort()).toEqual(['2026-01-31', '2027-12-31']);
      expect(terms.some((term) => term.grantedBy === 'roster-import')).toBe(true);
    });

    it('treats one address as one person, whatever case the file typed it in', async () => {
      await givenAMember(app, administrator, {
        email: 'clara@club.example',
        paidThrough: '2026-01-31',
      });

      const plan = await importing(
        sheet(['Name', 'E-mail', 'Paid through'], ['A Member', 'Clara@Club.Example', '2027-12-31']),
      );

      expect(plan.tally).toMatchObject({ newMembers: 0, updated: 1 });
      expect((await read()).filter((entry) => entry.email === 'clara@club.example')).toHaveLength(
        1,
      );
    });

    /**
     * **A name the roster holds is curated, so the file reports its own and changes nothing.**
     *
     * This is the one thing an import could overwrite that somebody has already put right: an
     * Administrator corrects a name on the roster screen, and next spring's export — written
     * before they did — would put the old one back, in bulk and with no record of what was lost.
     * That is the exact failure ADR 0005 exists to prevent, and it is what bulk paste does with a
     * quantity for the same reason. The difference is said; the press that applies it is on the
     * roster.
     */
    it('reports a name the file spells differently, and does not write it', async () => {
      await givenAMember(app, administrator, {
        name: 'Clara Weiss',
        email: 'clara@club.example',
        paidThrough: '2027-12-31',
      });

      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Clara Bianchi', 'clara@club.example', '2028-12-31'],
        ),
      );

      // The term still moves — that is what the file is for — and the name is reported only.
      expect(plan.rows[0]).toMatchObject({ outcome: 'updated', paidThrough: '2028-12-31' });
      expect(plan.rows[0]?.why).toContain('Clara Bianchi');
      expect(plan.rows[0]?.why).toContain('Clara Weiss');

      const entry = entryFor(await read(), 'clara@club.example');
      expect(entry.name).toBe('Clara Weiss');
      expect(entry.paidThrough).toBe('2028-12-31');
    });

    /** And a file that has nothing to offer but a different name changes nothing at all. */
    it('is unchanged where the only difference is the name', async () => {
      await givenAMember(app, administrator, {
        name: 'Clara Weiss',
        email: 'clara@club.example',
        paidThrough: '2027-12-31',
      });

      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Clara Bianchi', 'clara@club.example', '2027-12-31'],
        ),
      );

      expect(plan.tally).toMatchObject({ newMembers: 0, updated: 0, unchanged: 1 });
      expect(entryFor(await read(), 'clara@club.example').name).toBe('Clara Weiss');
    });

    /** A blank name cell is the file saying nothing, which is not the same as saying nobody. */
    it('keeps the name the roster has where the file leaves the cell empty', async () => {
      await givenAMember(app, administrator, {
        name: 'Clara Weiss',
        email: 'clara@club.example',
        paidThrough: '2026-06-30',
      });

      await importing(
        sheet(['Name', 'E-mail', 'Paid through'], ['', 'clara@club.example', '2027-12-31']),
      );

      expect(entryFor(await read(), 'clara@club.example').name).toBe('Clara Weiss');
    });
  });

  /**
   * **Reported individually, and the rest of the file lands.** A hundred-row roster with one
   * unreadable cell in it is an ordinary roster; refusing the file would mean the Administrator
   * fixes one cell and re-uploads, and refusing it silently would mean somebody is not on it.
   */
  describe('rows that cannot be read', () => {
    it('names the line and lets every other row through', async () => {
      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
          ['Nobody At All', 'not an address', '2027-12-31'],
          ['Marco Conti', 'marco@club.example', '2027-06-30'],
        ),
      );

      expect(plan.tally).toMatchObject({ newMembers: 2, refused: 1 });
      // Counting the header as line 1, which is the number their own spreadsheet shows.
      expect(plan.rows[1]).toMatchObject({ line: 3, outcome: 'refused' });
      expect(plan.rows[1]?.why).toMatch(/e-mail/i);

      const roster = await read();
      expect(entryFor(roster, 'giulia@club.example')).toBeDefined();
      expect(entryFor(roster, 'marco@club.example')).toBeDefined();
    });

    it('refuses a row with no Paid-through date rather than recording a person with no term', async () => {
      const plan = await importing(
        sheet(['Name', 'E-mail', 'Paid through'], ['Giulia Rossi', 'giulia@club.example', '']),
      );

      expect(plan.rows[0]?.outcome).toBe('refused');
      expect((await read()).some((entry) => entry.email === 'giulia@club.example')).toBe(false);
    });

    it('refuses a new member the file gives no name', async () => {
      const plan = await previewing(
        sheet(['Name', 'E-mail', 'Paid through'], ['', 'giulia@club.example', '2027-12-31']),
      );

      expect(plan.rows[0]?.outcome).toBe('refused');
      expect(plan.rows[0]?.why).toMatch(/name/i);
    });

    /** One address twice in one file is two contradictory rows, and choosing between them is a guess. */
    it('refuses the second row for an address the file has already listed', async () => {
      const plan = await previewing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
          ['G Rossi', 'giulia@club.example', '2028-12-31'],
        ),
      );

      expect(plan.rows.map(outcomeOf)).toEqual(['new-member', 'refused']);
      expect(plan.rows[1]?.why).toMatch(/[Ll]ine 2/);
    });

    /**
     * **A row that could not be read does not take the address down with it**, which is the box
     * *"do not block the rest"* applied to the case that would otherwise slip past it: an
     * unreadable row is not a claim about anybody, so a good row further down the file about the
     * same person is not a duplicate of it.
     */
    it('lets a later good row through where an earlier one could not be read', async () => {
      const plan = await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', 'next Christmas'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
        ),
      );

      expect(plan.rows.map(outcomeOf)).toEqual(['refused', 'new-member']);
      expect(entryFor(await read(), 'giulia@club.example').paidThrough).toBe('2027-12-31');
    });
  });

  /**
   * **Validated rather than guessed** — the box that decides whether a roster import is safe at
   * all. `03/04/2026` is the 3rd of April on one machine and the 4th of March on another, and a
   * guess is a Membership a month wrong in either direction, silently, for a hundred people.
   *
   * What the archive will do is read the evidence in the file itself: a column containing
   * `31/12/2026` has proved which way round it writes them, and every other cell in it is then
   * certain. A column that proves nothing and contains an ambiguous cell is where it stops.
   */
  describe('dates', () => {
    it('reads a date written the only way it can be read', async () => {
      const plan = await previewing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '31.12.2027'],
        ),
      );

      expect(plan.rows[0]).toMatchObject({ outcome: 'new-member', paidThrough: '2027-12-31' });
    });

    it('reads an ambiguous date in the order the rest of the column has proved', async () => {
      const plan = await previewing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '31/12/2027'],
          ['Marco Conti', 'marco@club.example', '03/04/2027'],
        ),
      );

      // The column writes the day first, which the row above it has settled beyond argument.
      expect(plan.rows[1]).toMatchObject({ outcome: 'new-member', paidThrough: '2027-04-03' });
    });

    it('reports an ambiguous date the file proves nothing about, rather than picking one', async () => {
      const plan = await previewing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '03/04/2027'],
        ),
      );

      expect(plan.rows[0]).toMatchObject({ outcome: 'refused', paidThrough: null });
      // And it says both readings, so the Administrator can write down the one they meant.
      expect(plan.rows[0]?.why).toContain('2027-04-03');
      expect(plan.rows[0]?.why).toContain('2027-03-04');
    });

    /**
     * A file somebody has pasted two exports into. The archive still refuses the ambiguous cell,
     * and **says the true reason**: "nothing else in that column says which" would be a plainly
     * wrong description of a column that says both.
     */
    it('says so when the column itself writes dates both ways round', async () => {
      const plan = await previewing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '31/12/2027'],
          ['Marco Conti', 'marco@club.example', '12/31/2027'],
          ['Elena Sala', 'elena@club.example', '03/04/2027'],
        ),
      );

      // The two that read only one way are still read; only the ambiguous one stops.
      expect(plan.rows.map(outcomeOf)).toEqual(['new-member', 'new-member', 'refused']);
      expect(plan.rows[2]?.why).toContain('day-first');
      expect(plan.rows[2]?.why).toContain('month-first');
    });

    it('refuses a date that is not a day of any month', async () => {
      const plan = await previewing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '31/02/2027'],
        ),
      );

      expect(plan.rows[0]?.outcome).toBe('refused');
    });
  });

  /**
   * **Inviting stays a separate, deliberate act.** A file arriving is not a reason to send a
   * hundred people an e-mail, and an import that could would make the first upload of an unchecked
   * list the most expensive mistake in the product.
   */
  describe('invitations', () => {
    it('sends nobody anything', async () => {
      const before = app.emails.sent.length;

      await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
          ['Marco Conti', 'marco@club.example', '2027-06-30'],
        ),
      );

      expect(app.emails.sent.length).toBe(before);
      expect(app.emails.sentTo('giulia@club.example')).toHaveLength(0);
    });

    it('lands a new member on the roster as somebody still to be invited', async () => {
      await importing(
        sheet(
          ['Name', 'E-mail', 'Paid through'],
          ['Giulia Rossi', 'giulia@club.example', '2027-12-31'],
        ),
      );

      const entry = entryFor(await read(), 'giulia@club.example');
      expect(entry).toMatchObject({
        standing: 'invited',
        activatedAt: null,
        invitationSentAt: null,
      });

      // And the roster's own "Send the invitation again" is what actually sends one.
      await administrator.post(`/api/roster/${entry.id}/invitation`).expect(201);
      expect(app.emails.sentTo('giulia@club.example')).toHaveLength(1);
    });
  });

  describe('who may run it', () => {
    const text = 'Name,E-mail,Paid through\nGiulia Rossi,giulia@club.example,2027-12-31';

    it('is refused to an Editor, who edits the archive rather than the Club', async () => {
      const editor = await givenAMember(app, administrator, { role: 'editor' });

      await editor.agent.post('/api/roster/import/preview').send({ text }).expect(403);
      await editor.agent.post('/api/roster/import').send({ text }).expect(403);
    });

    it('is refused to a browser that has not signed in at all', async () => {
      await app.request().post('/api/roster/import').send({ text }).expect(401);
    });
  });

  /** The three things every test here needs: a file, a preview, an import, and the roster after. */
  function sheet(header: string[], ...rows: string[][]): string {
    return [header, ...rows].map((cells) => cells.join(',')).join('\n');
  }

  async function previewing(text: string): Promise<RosterImportPlan> {
    const response = await administrator
      .post('/api/roster/import/preview')
      .send({ text })
      .expect(200);
    return response.body as RosterImportPlan;
  }

  async function importing(text: string): Promise<RosterImportPlan> {
    const response = await administrator.post('/api/roster/import').send({ text }).expect(201);
    return response.body as RosterImportPlan;
  }

  async function read(): Promise<RosterEntry[]> {
    const response = await administrator.get('/api/roster').expect(200);
    return response.body.members as RosterEntry[];
  }
});

function outcomeOf(row: RosterImportRow): string {
  return row.outcome;
}

function entryFor(roster: RosterEntry[], email: string): RosterEntry {
  const entry = roster.find((row) => row.email === email);
  expect(entry, `nobody on the roster is ${email}`).toBeDefined();
  return entry as RosterEntry;
}
