import { expect, test, type Page } from '@playwright/test';
import { markFor, openADrawingOfYourOwn, openFirstDrawing, placeMarks } from './support/archive.js';

/**
 * What belongs with a number, on the screen.
 *
 * The API seam already proves that a Sub-assembly holds its numbers and that a link recorded once
 * is read from both ends. **Only a browser can say what a member actually gets from either.**
 * Whether the eleven numbers of one can be seen *together on the drawing* is a question about
 * circles and receding that no response body contains; and whether selecting the number this part
 * works with takes the member to it is a question about where the sheet is, which is the same
 * thing the two-way navigation suite exists for.
 *
 * Both projects run it, and the phone matters: on a Pixel 7 the panel is below the drawing, so
 * "show it on the drawing" is a claim about something the member has to scroll back up to.
 */

/**
 * The practice archive's front caliper: number `1` on the Grifo's first sheet, which is in the
 * *Front caliper assembly* with `3` and `5`, and works with the hose at `2`.
 */
async function openTheCaliper(page: Page): Promise<void> {
  await openFirstDrawing(page);
  await markFor(page, '1').first().click();
  await expect(page.getByTestId('selected-position')).toHaveText('1');
}

test.describe('the Sub-assembly a number belongs to', () => {
  /**
   * **The headline** (story 49). A member taking a corner apart wants to know which numbers come
   * off together, and the useful form of that answer is on the drawing rather than in a list — so
   * asking for it keeps its circles lit by receding every other circle on the sheet.
   */
  test('is shown together on the drawing when a member asks for it', async ({ page }) => {
    await openTheCaliper(page);

    const subAssembly = page.getByTestId('sub-assembly');
    await expect(subAssembly).toContainText('Front caliper assembly');

    // Until it is asked for, the sheet is a sheet: nothing is receding.
    await expect(page.locator('[data-testid="drawing-mark"][data-subdued="true"]')).toHaveCount(0);

    await page.getByTestId('show-sub-assembly').click();

    // `1` and `3` are in it and stay as they were; `2` and `4` are not, and go back.
    await expect(markFor(page, '1')).toHaveAttribute('data-subdued', 'false');
    await expect(markFor(page, '3')).toHaveAttribute('data-subdued', 'false');
    await expect(markFor(page, '2').first()).toHaveAttribute('data-subdued', 'true');
    await expect(markFor(page, '4')).toHaveAttribute('data-subdued', 'true');

    // And it can be stopped, because the member asked a question rather than changed the sheet.
    await page.getByTestId('show-sub-assembly').click();
    await expect(page.locator('[data-testid="drawing-mark"][data-subdued="true"]')).toHaveCount(0);
  });

  /**
   * A number that is in no Sub-assembly **shows nothing** — not a heading saying "none", and
   * certainly not the rest of the sheet. The hose at `2` is the practice archive's number that is
   * in none, and it exists to be able to say this.
   */
  test('is absent entirely for a number that is in none', async ({ page }) => {
    await openFirstDrawing(page);
    await markFor(page, '2').first().click();

    await expect(page.getByTestId('selected-position')).toHaveText('2');
    await expect(page.getByTestId('sub-assembly')).toHaveCount(0);
  });
});

test.describe('the number a part works with', () => {
  /**
   * **Recorded once and read from both ends** (story 69), and reachable from either: the hose
   * runs to the caliper, so a member reading the caliper is taken to the hose and finds the
   * caliper waiting on the other side. One row in the archive; two journeys on the screen.
   */
  test('is reached from the panel, and the link works the other way too', async ({ page }) => {
    await openTheCaliper(page);

    const related = page.getByTestId('related-positions');
    await expect(related).toContainText('Works with');

    await related.locator('[data-testid="related-position"][data-position="2"]').click();

    await expect(page.getByTestId('selected-position')).toHaveText('2');
    await expect(page.getByTestId('part-reading')).toContainText('Flexible brake hose');

    // The other end, which nobody recorded: the same one row, read from `2`.
    await page
      .getByTestId('related-positions')
      .locator('[data-testid="related-position"][data-position="1"]')
      .click();
    await expect(page.getByTestId('selected-position')).toHaveText('1');
  });
});

test.describe('an Editor recording what belongs with a number', () => {
  /**
   * The whole of stories 106 and 107 through the screens: **two numbers into a named Sub-assembly
   * in one press**, and one link recorded from one end that appears on both.
   *
   * Both halves are about not doing something twice. The ticket's own example is eleven Positions,
   * so a tool that took one number at a time would be eleven cycles for one name. And the link is
   * recorded under `1` and never touched at `3`, because there is one row — "nobody has to
   * remember to enter it twice" is a promise about this screen and not only about the database.
   */
  test('records a Sub-assembly and a link, and the link shows at both numbers', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `belongs-${info.project.name}`);

    // Three numbers of this test's own, placed the way an Editor places them.
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await placeMarks(page, [
      { x: 0.3, y: 0.3 },
      { x: 0.5, y: 0.5 },
      { x: 0.7, y: 0.7 },
    ]);
    await page.getByRole('button', { name: 'Done' }).click();

    // `1` and `2` go in together: the number being read is already picked, and `2` is added.
    await markFor(page, '1').click();
    await page.getByTestId('sub-assembly-name').fill('Window Slider');
    await page.locator('[data-testid="sub-assembly-picker"] [data-position="2"]').click();
    await page.getByRole('button', { name: 'Record this sub-assembly' }).click();

    const subAssembly = page.getByTestId('sub-assembly');
    await expect(subAssembly).toContainText('Window Slider');
    await expect(subAssembly.getByTestId('sub-assembly-position')).toHaveCount(2);

    // And `1` is linked to `3`, from `1`'s end only.
    await page.getByTestId('relate-to').selectOption({ label: '3' });
    await page.getByRole('button', { name: 'Link 1 to it' }).click();
    await expect(page.locator('[data-testid="related-position"][data-position="3"]')).toBeVisible();

    // The other end, which nobody entered.
    await markFor(page, '3').click();
    await expect(page.getByTestId('selected-position')).toHaveText('3');
    await expect(page.locator('[data-testid="related-position"][data-position="1"]')).toBeVisible();
    // `3` is in no Sub-assembly, so it says nothing about one.
    await expect(page.getByTestId('sub-assembly')).toHaveCount(0);
  });
});
