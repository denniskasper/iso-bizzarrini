import { expect, test, type Page } from '@playwright/test';
import type { LandingResponse } from '@ricambi/contracts';
import { landed, MEMBER_PASSWORD, PRACTICE } from './support/gate.js';

/**
 * **What a Visitor is shown** (issue #128): what Ricambi is, the cars it covers and how deep it
 * goes for each, what membership gives, and the fee. Which Models are listed and what is counted
 * is proved at the API seam; what is here is that a browser shows it, and that the members who
 * arrive signed out still find the way in.
 */
test.describe('the landing a Visitor arrives at', () => {
  test('says what Ricambi is, the cars it covers, what membership gives and its fee', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Ricambi' })).toBeVisible();
    await expect(page.getByText('parts archive for Iso and Bizzarrini cars')).toBeVisible();

    const grifo = page.getByTestId('visitor-model-row').filter({ hasText: 'Grifo' });
    await expect(grifo).toContainText(/\d+\s*drawings?/);

    await expect(page.getByRole('heading', { name: 'How a member finds a part' })).toBeVisible();
    await expect(page.getByRole('img', { name: /drawing/ }).first()).toBeVisible();
    await expect(page.getByTestId('landing-fee')).toContainText(/a year/);
  });

  test('keeps signing in one press away, for the members who arrive signed out', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await page.getByLabel('E-mail address').fill(PRACTICE.member);
    await page.getByLabel('Password').fill(MEMBER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await landed(page);
  });
});

/**
 * **Asking the Club for membership** (issue #131). That one letter reaches the office, answered to
 * the Visitor, and that junk and bursts are refused, are proved at the API seam.
 *
 * **This environment writes its e-mail to the log**, which reaches nobody, so it offers the
 * office's address in place of the form, as every practice system does. The second test answers
 * `/api/landing` and `/api/membership-requests` itself: the form is what is under test, and a
 * system that could deliver it would be one that could write to a real office.
 */
test.describe('a Visitor asking to join', () => {
  test('is given the Club office’s address where Ricambi cannot send e-mail', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Ask the Club to join' })).toBeVisible();
    await expect(
      page.getByTestId('office-address').getByRole('link', { name: /@/ }),
    ).toHaveAttribute('href', /^mailto:/);
    await expect(page.getByRole('button', { name: 'Send the request' })).toHaveCount(0);
  });

  test('sends a request and is told it went to the Club office', async ({ page }) => {
    const sent = await givenTheFormIsOffered(page);
    await page.goto('/');

    await page.getByLabel('Your name').fill('Ada Visitor');
    await page.getByLabel('E-mail address').fill('ada@visitor.example');
    await page.getByLabel('Your car or cars').fill('Iso Grifo GL 365');
    await page.getByLabel('Message').fill('Restoring the front suspension.');
    await page.getByRole('checkbox', { name: /Send these details to the Club office/ }).check();
    await page.getByRole('button', { name: 'Send the request' }).click();

    await expect(page.getByTestId('request-sent')).toContainText(
      'Request sent to the Club office.',
    );
    await expect(page.getByTestId('request-sent')).toContainText('ada@visitor.example');
    expect(sent).toEqual([
      {
        name: 'Ada Visitor',
        email: 'ada@visitor.example',
        cars: 'Iso Grifo GL 365',
        message: 'Restoring the front suspension.',
        consent: true,
        website: '',
      },
    ]);
  });

  test('links the privacy statement from the consent it asks for', async ({ page }) => {
    await givenTheFormIsOffered(page);
    await page.goto('/');

    await page.getByRole('link', { name: 'privacy statement' }).click();

    await expect(page.getByTestId('membership-request')).toBeVisible();
  });
});

/** The landing as a system that can write to the Club office answers it. Remembers what was sent. */
async function givenTheFormIsOffered(page: Page) {
  const sent: unknown[] = [];

  await page.route('**/api/landing', async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as LandingResponse;
    await route.fulfill({
      response,
      json: { landing: { ...body.landing, requestForm: true } } satisfies LandingResponse,
    });
  });
  await page.route('**/api/membership-requests', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });

  return sent;
}
