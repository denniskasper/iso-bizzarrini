import { expect, test, type Locator, type Page } from '@playwright/test';
import { signIn } from './support/gate.js';

/**
 * Searching, in a browser — **the way into the archive that does not start at the car.**
 *
 * The API seam already proves what counts as a match: the five fields, the spacing, the prefix,
 * the reverse lookup through an Equivalent. None of that is repeated here. What only a browser
 * can say is whether the thing the ticket actually asks for happens — that a member holding a
 * bracket with a number stamped on it ends up **looking at the circle it came from**, having
 * started on a screen that knew nothing about their car.
 *
 * Both projects run it, and the phone is the one that matters: a Pixel 7 in a garage is where a
 * search field and a list of places either survive a small screen or do not.
 */

function results(page: Page): Locator {
  return page.getByTestId('search-results');
}

/** One entry of the index — located by the number the factory printed, as a member reads it. */
function resultFor(page: Page, name: string): Locator {
  return results(page).locator('li').filter({ hasText: name }).first();
}

/** A member searching from wherever they are, the way the chrome offers it. */
async function search(page: Page, query: string): Promise<void> {
  await page.getByRole('link', { name: 'Search', exact: true }).click();
  await page.getByTestId('search-field').fill(query);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(results(page)).toBeVisible();
}

test.describe('finding a part from the number on it', () => {
  /**
   * **The whole ticket in one test.** Somebody is holding a bracket stamped `26003210`; the
   * catalog prints that number with spaces in it and they have no idea which car it came off.
   * They finish looking at the circle it is drawn at, on the right sheet of the right car.
   */
  test('a number stamped on a part leads to the circle it is drawn at', async ({ page }) => {
    await signIn(page);

    await search(page, '26003210');

    const hose = resultFor(page, 'Flexible brake hose, front');
    // Which one is theirs (story 82): the car, the sheet and the number, before they click.
    await expect(hose).toContainText('260 03 210');
    await expect(hose).toContainText('Iso Grifo');
    await expect(hose).toContainText('Tavola 2');

    await hose.getByTestId('search-result-link').first().click();

    // The drawing, open at that number — not merely the sheet it is somewhere on.
    await expect(page.getByRole('img', { name: /Tavola 2/ })).toBeVisible();
    await expect(page.getByTestId('selected-position')).toHaveText('2');
    await expect(page.getByTestId('part-reading')).toContainText('Flexible brake hose, front');
  });

  /**
   * **The reverse lookup, which is what the cross-reference content is for.** A member has a
   * modern hose in their hand with the original supplier's number on the box, and no idea what it
   * replaces. The answer has to carry that number back, or they cannot check it.
   */
  test('a supplier’s number says what it replaces, and says so on the screen', async ({ page }) => {
    await signIn(page);

    await search(page, '64678231');

    const hose = resultFor(page, 'Flexible brake hose, front');
    await expect(hose.getByTestId('matched-because')).toContainText('Girling');
    await expect(hose.getByTestId('matched-because')).toContainText('64678231');
  });

  /**
   * A washer at two numbers on one sheet is two circles, and the member wants the one that is
   * theirs — so both are offered rather than the archive choosing.
   */
  test('every number a part sits at is somewhere to go', async ({ page }) => {
    await signIn(page);

    await search(page, '999 01 090');

    const places = resultFor(page, 'Lock washer').getByTestId('search-result-link');
    await expect(places).toHaveCount(2);
    await expect(places.first()).toContainText('Tavola 2');
  });

  /**
   * **The front door offers the other way in.** A member who arrives holding a bracket and is
   * shown nothing but a list of cars is a member the archive has already failed, and the chrome
   * alone is not enough — nobody reads the chrome on the screen they arrive at.
   */
  test('the catalog offers starting from the part instead of the car', async ({ page }) => {
    await signIn(page);

    await page.getByTestId('search-from-the-catalog').click();

    // Focused on arrival, so the number in somebody's hand is the next thing typed.
    await expect(page.getByTestId('search-field')).toBeFocused();
  });

  /**
   * **What was searched for is in the address**, which is what makes an answer shareable and what
   * makes the back button work. A member who found the bracket can send the address bar to
   * somebody else — the same promise a link to a Position makes (story 52).
   */
  test('the search survives being reloaded, and the field still says what it found', async ({
    page,
  }) => {
    await signIn(page);

    await search(page, '26003210');
    expect(new URL(page.url()).searchParams.get('q')).toBe('26003210');

    await page.reload();

    await expect(results(page)).toContainText('Flexible brake hose, front');
    await expect(page.getByTestId('search-field')).toHaveValue('26003210');
  });

  /**
   * **Nothing without a live Membership.** A link to a search is a link into the archive, and a
   * browser that has not been through the gate is shown the gate — then put back where it was
   * going, because a shared link must not be lost at the sign-in screen (story 53).
   */
  test('a search link opens the gate, and then opens the search', async ({ page }) => {
    await page.goto('/search?q=26003210');

    await expect(page.getByRole('heading', { name: 'The archive is members-only.' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Flexible brake hose');

    await signIn(page);
    await page.goto('/search?q=26003210');

    await expect(results(page)).toContainText('Flexible brake hose, front');
  });
});
