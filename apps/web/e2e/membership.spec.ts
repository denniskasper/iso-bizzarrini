import { expect, test, type Page } from '@playwright/test';
import type { MembershipStanding } from '@ricambi/contracts';
import { landed, PRACTICE, signInAs } from './support/gate.js';

/**
 * A member's own Membership, and paying for it through the platform (ADR 0004, issue #4).
 *
 * Every rule about money is proved at the API seam, against a provider that seam writes the
 * events of: that the date moves on a confirmed payment and on nothing else, that a delivery is
 * acted on once, that an unsigned one is refused. What is here is what only a browser can show —
 * that a member can find the page, is told what they are agreeing to before the button that
 * agrees to it, and can stop it in one press.
 *
 * **This environment has no payment provider**, which is the truth about every practice system.
 * So the first test is the real thing end to end, and the ones about a subscription answer
 * `/api/subscription` themselves: the screen is what is under test, and a provider that could
 * take a payment here would be one that could take a real one.
 */
const STANDING: MembershipStanding = {
  paidThrough: '2027-01-20',
  graceUntil: null,
  canPayOnline: true,
  fee: '45.00',
  currency: 'EUR',
  subscription: null,
  payments: [],
};

/** Answers for the archive about one member's Membership, and remembers what was asked of it. */
async function givenMembership(page: Page, standing: MembershipStanding) {
  const asked: { method: string; path: string; body: unknown }[] = [];
  let current = standing;

  await page.route('**/api/subscription**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    asked.push({ method: request.method(), path, body: request.postDataJSON() });

    if (request.method() === 'POST') {
      // Where the provider would send them back to, having paid.
      await route.fulfill({ status: 201, json: { paymentPageUrl: '/membership?paid=1' } });
      return;
    }
    if (request.method() === 'PUT') {
      const { renews } = request.postDataJSON() as { renews: boolean };
      current = {
        ...current,
        // Cancelling ends grace: a renewal nobody is collecting is not being confirmed.
        graceUntil: renews ? current.graceUntil : null,
        subscription: { renews, renewsOn: renews ? '2027-01-20' : null },
      };
    }
    await route.fulfill({ json: { membership: current } });
  });

  return asked;
}

test('a member finds their own Membership from any screen, and how to pay by transfer', async ({
  page,
}) => {
  await signInAs(page, PRACTICE.member);
  await landed(page);

  await page.getByRole('link', { name: 'Membership', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Membership', level: 1 })).toBeVisible();
  await expect(page.getByTestId('paid-through')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText('It does not renew by itself.')).toBeVisible();
  // No provider here, so no offer to pay online — and the transfer is not hidden for it.
  await expect(page.getByRole('button', { name: /^Pay / })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Paying by bank transfer' })).toBeVisible();
});

test('somebody who is not signed in is asked to, rather than shown anything', async ({ page }) => {
  await page.goto('/membership');

  await expect(page.getByRole('heading', { name: 'Sign in first.' })).toBeVisible();
});

test.describe('where the Club takes payment through the platform', () => {
  /**
   * **Stated plainly, before the member commits**: what it costs, that it is collected again
   * every year, that cancelling is one press, and that access follows the bank's confirmation
   * rather than the button.
   */
  test('says what a subscription is before the button that starts one', async ({ page }) => {
    const asked = await givenMembership(page, STANDING);
    await signInAs(page, PRACTICE.member);
    await landed(page);
    await page.goto('/membership');

    await expect(
      page.getByText(
        '45.00 EUR is collected now, and 45.00 EUR again each year, until you cancel.',
      ),
    ).toBeVisible();
    await expect(page.getByText('Cancelling is one press on your Membership page.')).toBeVisible();
    await expect(page.getByText(/a few\s+working days for a direct debit/).first()).toBeVisible();
    // A transfer is still offered beside it: some members will never sign a mandate.
    await expect(page.getByRole('heading', { name: 'Or pay by bank transfer' })).toBeVisible();

    await page.getByRole('button', { name: 'Pay 45.00 EUR a year' }).click();

    // Back from the provider: thanked, and told the truth about when the date moves.
    await expect(page.getByRole('status')).toContainText('Your Membership moves when the bank');
    expect(asked.filter((each) => each.method === 'POST')).toHaveLength(1);
  });

  /** One press, no "are you sure", and nothing already paid for is taken away. */
  test('cancels auto-renewal in one press, and turns it back on in one', async ({ page }) => {
    const asked = await givenMembership(page, {
      ...STANDING,
      subscription: { renews: true, renewsOn: '2027-01-20' },
      payments: [
        {
          id: '0d9b4f6e-2f0f-4a57-9d3b-6a1c8f1e2b34',
          paidOn: '2026-01-20',
          amount: '45.00',
          currency: 'EUR',
          paidThrough: '2027-01-20',
          hasReceipt: true,
        },
      ],
    });
    await signInAs(page, PRACTICE.member);
    await landed(page);
    await page.goto('/membership');

    await expect(page.getByText('The next fee is collected on 2027-01-20.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Receipt' })).toHaveAttribute(
      'href',
      '/api/subscription/payments/0d9b4f6e-2f0f-4a57-9d3b-6a1c8f1e2b34/receipt',
    );

    await page.getByRole('button', { name: 'Cancel auto-renewal' }).click();

    await expect(
      page.getByText(
        'Auto-renewal is off. Nothing more will be collected, and your access runs to',
      ),
    ).toBeVisible();
    await expect(page.getByTestId('paid-through')).toHaveText('2027-01-20');
    expect(asked.at(-1)).toMatchObject({ method: 'PUT', body: { renews: false } });

    await page.getByRole('button', { name: 'Turn auto-renewal back on' }).click();
    await expect(page.getByRole('button', { name: 'Cancel auto-renewal' })).toBeVisible();
  });

  /**
   * Past the date, while the bank confirms the renewal (issue #17): the date has not moved, the
   * sentence says until when access holds, and the line under the button says what cancelling
   * now would end.
   */
  test('tells a member in grace that their renewal is being collected', async ({ page }) => {
    await givenMembership(page, {
      ...STANDING,
      paidThrough: '2026-01-10',
      graceUntil: '2026-01-24',
      subscription: { renews: true, renewsOn: '2026-01-10' },
    });
    await signInAs(page, PRACTICE.member);
    await landed(page);
    await page.goto('/membership');

    await expect(page.getByTestId('paid-through')).toHaveText('2026-01-10');
    await expect(
      page.getByText(
        'Your renewal payment is being collected. Until the bank confirms it, your access holds to 2026-01-24.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Cancelling now stops the payment being collected, and your access ends with it.',
      ),
    ).toBeVisible();
  });

  /** The person the archive is refusing is the person who most needs the button. */
  test('offers it to a lapsed member on the screen they are stopped at', async ({ page }) => {
    await givenMembership(page, { ...STANDING, paidThrough: '2025-09-04' });
    await signInAs(page, PRACTICE.lapsed);

    await expect(page.getByRole('heading', { name: 'Your Membership has run out.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay 45.00 EUR a year' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Or pay by bank transfer' })).toBeVisible();
  });
});
