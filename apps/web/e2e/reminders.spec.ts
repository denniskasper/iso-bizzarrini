import { expect, test, type Page } from '@playwright/test';
import type { ReminderPlan } from '@ricambi/contracts';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * Renewal reminders, in a real browser (issue #3).
 *
 * When a reminder is due, that it goes once and never twice, and that nothing goes while it is
 * switched off are all proved at the API seam, with a clock that can be moved and a mailbox
 * that can be counted. What is here is what only a browser can show: that an Administrator can
 * read who would be written to before switching anything on, and that the switch says what
 * pressing it will do.
 *
 * **This is a practice system, so it never sends** — which is the first thing the screen has to
 * say, and the first test is that it does. The tests about a system that *can* send answer
 * `/api/reminders` themselves, because no practice system is allowed to be one.
 */
test('an Administrator reads who would be written to, on a system that never sends', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/roster');
  await page.getByRole('link', { name: 'Reminders' }).click();

  await expect(page.getByRole('heading', { name: 'Reminders', level: 1 })).toBeVisible();
  await expect(page.getByText('This system cannot send reminders.')).toBeVisible();
  // The treasurer's lists are on the page whether or not an e-mail ever goes: the seeded
  // member whose term ran out a fortnight ago is on the second of them.
  await expect(page.getByTestId('treasurer-lapsed')).toContainText('Elena Moretti');
});

test('is not shown to a member who is not an Administrator', async ({ page }) => {
  await signInAs(page, PRACTICE.member);
  await landed(page);
  await page.goto('/reminders');

  await expect(page.getByRole('heading', { name: /is the Club's to keep/ })).toBeVisible();
});

const PLAN: ReminderPlan = {
  asOf: '2026-12-05',
  windowDays: 30,
  sending: { environmentAllows: true, switchedOn: false, canBePaid: true },
  due: [
    {
      accountId: '0d9b4f6e-2f0f-4a57-9d3b-6a1c8f1e2b34',
      name: 'Elena Moretti',
      email: 'elena@example.invalid',
      paidThrough: '2026-12-31',
      sendsOn: '2026-12-01',
      reference: 'Ricambi 2027 Elena Moretti',
    },
  ],
  upcoming: [
    {
      accountId: '1e2b3c4d-2f0f-4a57-9d3b-6a1c8f1e2b35',
      name: 'Dario Lanza',
      email: 'dario@example.invalid',
      paidThrough: '2027-01-20',
      sendsOn: '2026-12-21',
      reference: 'Ricambi 2027 Dario Lanza',
    },
  ],
  skipped: [
    {
      accountId: '2f3c4d5e-2f0f-4a57-9d3b-6a1c8f1e2b36',
      name: 'Late Arrival',
      paidThrough: '2026-12-20',
      why: 'short-term',
    },
  ],
  letter: {
    subject: 'Your Club membership runs to 31 December 2026',
    text: 'Hello Elena Moretti,\n\nYour membership is paid up to 31 December 2026.\n\n  IBAN:           DE00 0000 0000 0000 0000 00',
  },
  digest: { treasurerEmail: null, runningOut: [], lapsed: [], lastSentOn: null, letter: null },
};

/** Answers for the archive about the reminders, and remembers what the Club was told. */
async function givenPlan(page: Page, plan: ReminderPlan) {
  const corrections: unknown[] = [];
  let current = plan;

  await page.route('**/api/reminders', (route) => route.fulfill({ json: current }));
  await page.route('**/api/club', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const sent = route.request().postDataJSON() as { remindersOn?: boolean };
    corrections.push(sent);
    if (sent.remindersOn !== undefined) {
      current = { ...current, sending: { ...current.sending, switchedOn: sent.remindersOn } };
    }
    await route.fulfill({ json: { club: {} } });
  });

  return corrections;
}

test.describe('where reminders can be sent', () => {
  /**
   * **Before anything is enabled**: who gets a letter tonight, who is next and on which day,
   * who is passed over and why, and the letter itself. Then the switch — which says, in its
   * own words, how many letters pressing it sends.
   */
  test('shows exactly who would be written to, and the switch says what it will send', async ({
    page,
  }) => {
    const corrections = await givenPlan(page, PLAN);
    await signIn(page);
    await page.goto('/reminders');

    await expect(page.getByTestId('reminders-state')).toHaveText(
      'Reminders are off. Nothing is sent.',
    );
    await expect(
      page.getByRole('heading', { name: '1 member would be written to tonight' }),
    ).toBeVisible();
    await expect(page.getByTestId('reminders-due')).toContainText('Ricambi 2027 Elena Moretti');
    await expect(page.getByTestId('reminders-upcoming')).toContainText('2026-12-21');
    await expect(page.getByText('there was never a day to remind them on')).toBeVisible();
    await expect(page.getByText('Your Club membership runs to 31 December 2026')).toBeVisible();

    await page
      .getByRole('button', { name: 'Switch reminders on, and send 1 reminder tonight' })
      .click();

    await expect(page.getByTestId('reminders-state')).toHaveText(
      'Reminders are on. They go out by themselves, once a night.',
    );
    expect(corrections).toEqual([{ remindersOn: true }]);
    // And the way back is one press, in the same place.
    await expect(page.getByRole('button', { name: 'Switch reminders off' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send 1 reminder now' })).toBeVisible();
  });
});
