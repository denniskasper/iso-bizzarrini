import { expect, test } from '@playwright/test';
import { signIn } from './support/gate';

/**
 * The platform's own legal pages (issue #9), in a real browser.
 *
 * Thin, like the rest of this seam. Which facts are public, who may write them and what the
 * archive refuses are proved at the API seam; what is here is what only a browser can show —
 * that both pages are one press from a screen nobody has signed in to, and that what an
 * Administrator writes on the Club's screen is what a stranger then reads.
 *
 * **Every name below is invented**, and the same in both browsers this suite runs: the database
 * is shared and never emptied, so two projects writing the Club's record at once have to be
 * writing the same thing.
 */
const CLUB = {
  name: 'An Invented Club e.V.',
  address: 'Musterstraße 1\n00000 Musterstadt',
  representedBy: 'Erika Mustermann (chair)',
  contact: 'Max Mustermann',
};

test('the legal notice and the privacy statement are one press from the sign-in screen', async ({
  page,
}) => {
  await page.goto('/sign-in');
  const legal = page.getByRole('navigation', { name: 'Legal' });

  await legal.getByRole('link', { name: 'Legal notice' }).click();
  await expect(page.getByRole('heading', { name: 'Legal notice', level: 1 })).toBeVisible();

  await legal.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
});

test('the privacy statement says what is processed, by whom, and what cannot be erased', async ({
  page,
}) => {
  await page.goto('/privacy');

  for (const heading of [
    'Who is responsible',
    'What is held, and why',
    'Who else handles it',
    'What stays',
    'What you can ask for',
  ]) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  // ADR 0011: nobody tracks errors for the Club, and the statement says so rather than nothing.
  await expect(page.getByTestId('processor-error-tracking')).toContainText(
    'written to a log on the server and sent nowhere else',
  );
  await expect(page.getByText('a former member')).toBeVisible();
  await expect(page.getByText(/until\s+10 years after the end of the year/)).toBeVisible();
  // Issue #131: what the form to ask for membership sends, to whom, and that nothing is kept.
  await expect(page.getByTestId('membership-request')).toContainText('one e-mail to the Club');
  await expect(page.getByTestId('membership-request')).toContainText('Ricambi keeps nothing');
});

test('what an Administrator writes about the association is what a stranger reads', async ({
  page,
  browser,
}) => {
  await signIn(page);
  await page.goto('/club');

  await page.getByLabel('Registered name').fill(CLUB.name);
  await page.getByLabel('Postal address').fill(CLUB.address);
  await page.getByLabel('Represented by').fill(CLUB.representedBy);
  await page.getByLabel('Data-protection contact').fill(CLUB.contact);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  const hosting = page.getByRole('form', { name: 'Hosting' });
  await hosting.getByLabel('Company').fill('Invented Hosting');
  await hosting.getByLabel('Where the data is handled').fill('Germany');
  await hosting.getByRole('button', { name: 'Save hosting' }).click();
  await expect(hosting.getByText('Saved.')).toBeVisible();
  // The agreement is the Club's own paperwork, tracked here and published nowhere.
  await expect(page.getByTestId('agreements-standing')).toContainText('outstanding');

  // Somebody else entirely, who has never signed in.
  const elsewhere = await browser.newContext();
  const stranger = await elsewhere.newPage();

  await stranger.goto('/legal-notice');
  // Within the notice: the header names the Club on every page (#107).
  await expect(stranger.getByRole('article').getByText(CLUB.name)).toBeVisible();
  await expect(stranger.getByText('00000 Musterstadt')).toBeVisible();
  await expect(stranger.getByText(CLUB.representedBy)).toBeVisible();

  await stranger.goto('/privacy');
  await expect(stranger.getByTestId('controller')).toContainText(CLUB.name);
  await expect(stranger.getByTestId('data-protection-contact')).toContainText(CLUB.contact);
  await expect(stranger.getByTestId('processor-hosting')).toContainText(
    'Invented Hosting, Germany.',
  );
  await expect(stranger.getByTestId('processor-hosting')).not.toContainText('outstanding');

  await elsewhere.close();
});
