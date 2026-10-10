import { expect, test } from '@playwright/test';
import { openFirstDrawing } from './support/archive.js';
import { landed, MEMBER_PASSWORD, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * Accounts, the roster and the Club, in a real browser.
 *
 * Deliberately thin, like the rest of this seam. Every rule about passwords, tokens, rate
 * limiting and disclosure is proved at the API seam, where a request and a response can prove it;
 * what is here is what only a browser can show — that the form takes an address and a password
 * and gets somebody in, that the three standings are tellable apart on a screen, and that an
 * Administrator can add somebody and record a payment without leaving the page.
 */
test.describe('signing in as a person', () => {
  test('takes an address and a password, and says who is signed in', async ({ page }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);

    // On a shared computer the useful question is not "is somebody signed in" but "who".
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('refuses a wrong password without saying who is on the roster', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('E-mail address').fill(PRACTICE.member);
    await page.getByLabel('Password').fill('not-the-password-they-chose');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const refusal = page.getByRole('alert');
    await expect(refusal).toContainText('contact the Club office');
    // Nothing on the screen distinguishes this from an address nobody has heard of.
    await expect(refusal).not.toContainText(PRACTICE.member);
  });

  test('offers a way round that never says whether the address is known', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'I have forgotten my password' }).click();
    await page.getByLabel('E-mail address').fill('nobody-at-all@example.invalid');
    await page.getByRole('button', { name: 'Send me a link' }).click();

    // "If that address is on the roster" — which is true either way, and is the whole point.
    await expect(page.getByRole('heading', { name: 'Check your e-mail.' })).toBeVisible();
    await expect(page.getByText(/If .* is on the Club's roster/)).toBeVisible();
  });

  test('lets a member sign out, for a shared computer', async ({ page }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);

    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();
  });
});

/**
 * **A lapsed member gets in and is then handed everything they need to fix it** (stories 8 and 9).
 *
 * Only a browser can say whether this actually happened. That the archive answered 403 and that
 * `/api/renewal` carried an IBAN are two facts proved at the API seam; that a person who signed
 * in successfully is looking at the amount, the account and the exact words to write on the
 * transfer — rather than at a refusal — is a fact about a screen.
 */
test.describe('a Membership that has run out', () => {
  test('signs in successfully and is told the date it expired', async ({ page }) => {
    await signInAs(page, PRACTICE.lapsed);

    await expect(page.getByRole('heading', { name: 'Your Membership has run out.' })).toBeVisible();
    // Signed in, not turned away: the control in the chrome offers to sign them *out*.
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('is shown what to pay, where to send it and what to write on it', async ({ page }) => {
    await signInAs(page, PRACTICE.lapsed);
    await expect(page.getByRole('heading', { name: 'Your Membership has run out.' })).toBeVisible();

    await expect(page.getByText('What renewing costs')).toBeVisible();
    await expect(page.getByText('Where to send it')).toBeVisible();
    await expect(page.getByText('IBAN', { exact: true })).toBeVisible();

    // **The reference, written out in their own name.** It is the one thing on this screen a
    // member could not have worked out for themselves, and the thing that makes a transfer
    // matchable to a person — so it is the assertion that matters most here.
    await expect(page.getByText(/^Ricambi \d{4} Elena Moretti$/)).toBeVisible();

    // Somebody to write to when the money is not the problem.
    await expect(page.getByRole('link', { name: 'office@example.invalid' })).toBeVisible();
  });

  /**
   * Cold hands, a phone, and a run of characters that has to reach a banking app unaltered.
   * Selecting text precisely on a phone is the part that goes wrong, so it is a press instead.
   */
  test('puts the reference on the clipboard in one press', async ({ page }) => {
    await signInAs(page, PRACTICE.lapsed);

    const copy = page.getByRole('button', { name: 'Copy the reference' });
    await expect(copy).toBeVisible();
    await copy.click();
    await expect(copy).toContainText('Copied');
  });

  test('gives every control on it a target a cold hand can hit', async ({ page }) => {
    await signInAs(page, PRACTICE.lapsed);
    await expect(page.getByRole('heading', { name: 'Your Membership has run out.' })).toBeVisible();

    for (const control of await page.locator('main button:visible, main a:visible').all()) {
      const box = await control.boundingBox();
      const description = (await control.textContent())?.trim() || 'a control';
      expect(
        Math.round(box?.height ?? 0),
        `"${description}" is too short to hit`,
      ).toBeGreaterThanOrEqual(44);
    }
  });
});

/**
 * **A link to a Position survives the sign-in redirect** (stories 52 and 53).
 *
 * This is the whole reason `next` exists, and it is the one thing about the gate that cannot be
 * proved anywhere but in a browser: a member sends another member the address bar, it is opened
 * by somebody who is signed out, and what they end up looking at afterwards has to be the circle
 * they were sent — not the catalog, and not the screen they were bounced off.
 */
test('a deep link into the archive opens what it named, after signing in', async ({ page }) => {
  await openFirstDrawing(page);
  await page.locator('[data-testid="sheet-line"][data-position="3"]').click();
  await expect(page).toHaveURL(/[?&]position=3\b/);

  const sent = page.url();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Somebody else's browser, arriving at the link cold.
  await page.goto(sent);
  await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();

  // The gate screen's own way in, and not the one in the chrome — both carry `next`, and this
  // is the one somebody who has just been stopped actually presses.
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('E-mail address').fill(PRACTICE.member);
  await page.getByLabel('Password').fill(MEMBER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // Where they were going, not where signing in usually lands.
  await expect(page).toHaveURL(/[?&]position=3\b/);
  await expect(page.getByTestId('selected-position')).toHaveText('3');
});

test.describe('the roster', () => {
  test('tells invited, active and lapsed apart on one screen', async ({ page }) => {
    await signIn(page);
    await page.goto('/roster');

    await expect(page.getByRole('heading', { name: 'The roster' })).toBeVisible();

    for (const standing of ['active', 'invited', 'lapsed']) {
      await expect(page.locator(`.roster-row[data-standing="${standing}"]`).first()).toBeVisible();
    }

    // The row an Administrator is looking for is findable without reading: the two states that
    // mean somebody is waiting on the Club are ruled off down their left edge.
    await expect(page.getByText(PRACTICE.lapsed)).toBeVisible();
  });

  test('adds somebody, who lands on it as invited', async ({ page }) => {
    await signIn(page);
    await page.goto('/roster');

    await page.getByRole('button', { name: 'Add somebody' }).click();
    await page.getByLabel('Name').fill('Nuova Persona');
    // A fresh address every run, since the seam runs against a database it does not empty.
    const email = `nuova-${Date.now()}@example.invalid`;
    await page.getByLabel('E-mail address').fill(email);
    await page.getByRole('button', { name: 'Add them and send the invitation' }).click();

    const row = page.locator('.roster-row').filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-standing', 'invited');
  });

  /**
   * Access comes back with the date, and nobody has to repair an account by hand (story 10).
   *
   * **This test lapses somebody of its own** rather than using one of the seeded members. The
   * suite runs in parallel against one database it does not empty between tests, so a test that
   * un-lapsed the shared Elena would quietly break the test above it — which is exactly what it
   * did before this comment existed.
   */
  test('records a payment, and the standing follows it', async ({ page }) => {
    await signIn(page);
    await page.goto('/roster');

    const email = `renewing-${Date.now()}@example.invalid`;
    await page.getByRole('button', { name: 'Add somebody' }).click();
    await page.getByLabel('Name').fill('Rinnovo Rossi');
    await page.getByLabel('E-mail address').fill(email);
    // A term that ran out years ago, so they arrive on the roster already lapsed.
    await page.getByLabel('Paid through').fill('2020-01-31');
    await page.getByRole('button', { name: 'Add them and send the invitation' }).click();

    const them = page.locator('li').filter({ hasText: email });
    await expect(them.locator('.roster-row')).toHaveAttribute('data-standing', 'lapsed');

    await them.getByRole('button', { name: 'Record a payment' }).click();
    await them.getByLabel('Paid through').fill('2099-12-31');
    await them.getByRole('button', { name: 'Record the payment' }).click();

    await expect(them.locator('.roster-row')).toHaveAttribute('data-standing', 'invited');
  });

  test('is not offered to a member who is not an Administrator', async ({ page }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);

    await expect(page.getByRole('link', { name: 'Roster' })).toHaveCount(0);

    // And following the address anyway says so rather than showing an empty table.
    await page.goto('/roster');
    await expect(
      page.getByRole('heading', { name: "The roster is the Club's to keep." }),
    ).toBeVisible();
  });
});

test.describe('the Club', () => {
  test('changes the fee and the bank details without a deployment', async ({ page }) => {
    await signIn(page);
    await page.goto('/club');

    await page.getByLabel('Fee').fill('52.50');
    await page.getByLabel('IBAN').fill('DE11 1111 1111 1111 1111 11');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Fee')).toHaveValue('52.50');
    await expect(page.getByLabel('IBAN')).toHaveValue('DE11 1111 1111 1111 1111 11');
  });
});

/**
 * Built for a garage: cold hands, thick gloves, a phone held at arm's length. The rule is 44px in
 * both dimensions and it applies to the screens an Administrator uses standing at a desk exactly
 * as it does to the ones a member uses standing at a bench.
 */
test('gives every control on the new screens a target a cold hand can hit', async ({ page }) => {
  await signIn(page);

  // The import screen is here rather than in a test of its own: every test in this suite costs a
  // real sign-in, and the rule is the same rule on all three screens.
  for (const path of ['/roster', '/roster/import', '/club', '/membership', '/reminders']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();

    /*
     * **`.sr-only` is excluded, because it is not a thing anybody aims at.**
     *
     * A file picker is a `<label>` styled as a button in front of a visually-hidden `<input>` —
     * the input stays in the accessibility tree so the label still operates it, and `sr-only`
     * leaves it a 1×1px box, which Playwright counts as visible. Measuring it would be measuring
     * the wrong element: what a cold hand presses is the label, and `/roster/import` asserts that
     * where the picker is actually used. Labels are not swept in here, because most of them are a
     * `Field`'s caption sitting above the 44px box that is the real target.
     */
    for (const control of await page
      .locator('button:visible, a:visible, input:not(.sr-only):visible, select:visible')
      .all()) {
      const box = await control.boundingBox();
      const description =
        (await control.textContent())?.trim() || (await control.getAttribute('id')) || 'a control';

      // Rounded, because a bounding rect inside a grid comes back as 43.99997 for an element
      // whose computed height is exactly 44px — Chromium's rect arithmetic rather than anything
      // a cold hand could tell the difference between.
      expect(
        Math.round(box?.height ?? 0),
        `${path}: "${description}" is too short to hit`,
      ).toBeGreaterThanOrEqual(44);
    }
  }
});

test('signs a member in on a phone, which is where this is actually read', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await signInAs(page, PRACTICE.member);
  await landed(page);

  expect(MEMBER_PASSWORD.length).toBeGreaterThanOrEqual(10);
});
