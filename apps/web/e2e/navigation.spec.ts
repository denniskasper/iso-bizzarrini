import { expect, test, type Locator, type Page } from '@playwright/test';
import { markFor, openADrawingOfYourOwn, openFirstDrawing, placeMarks } from './support/archive.js';

/**
 * Working the drawing both ways round.
 *
 * A member can go from a circle to the text — that is ticket 06 — and from here they can go from
 * the text to the circle as well: down the sheet's own index, or straight to a number they are
 * holding in their hand. **Only a browser can say any of this happened.** That a request returned
 * a Listing proves nothing about whether the drawing moved, whether the second circle of a number
 * printed twice is the one now under the eye, or whether a link somebody was sent opens what they
 * were promised.
 *
 * Both projects run it, and the phone is the one that matters: on a Pixel 7 the text is below the
 * drawing rather than beside it, which is where "it took me there" either survives or does not.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('That element is not on the page.');
  }
  return box;
}

/** The circle of a number that is the one being read, of however many the factory printed. */
function currentMark(page: Page): Locator {
  return page.locator('[data-testid="drawing-mark"][data-current="true"]');
}

function lineFor(page: Page, number: string): Locator {
  return page.locator(`[data-testid="sheet-line"][data-position="${number}"]`);
}

/**
 * Whether a circle is actually on the glass — its middle inside the frame the drawing is read
 * through. A circle panned off the sheet still has a bounding box, so "visible" is not the
 * question; where it is, is.
 */
async function isOnScreen(page: Page, mark: Locator): Promise<boolean> {
  const frame = await boxOf(page.getByTestId('drawing-frame'));
  const box = await boxOf(mark);
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  return (
    middle.x >= frame.x &&
    middle.x <= frame.x + frame.width &&
    middle.y >= frame.y &&
    middle.y <= frame.y + frame.height
  );
}

async function zoomIn(page: Page, presses: number): Promise<void> {
  for (let press = 0; press < presses; press += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
  }
}

test.describe('working from the text', () => {
  /**
   * **The headline, and the other half of the product's sentence** (stories 46–47). A member who
   * knows what a part is called and not where it is reads down the sheet's index — and selecting
   * a line takes the drawing to the circle, which is the same journey as clicking the circle to
   * read the part, made backwards.
   */
  test('a part chosen from the list takes the drawing to its circle', async ({ page }) => {
    await openFirstDrawing(page);

    // Magnified until part of the sheet is off screen, which is the only state in which "it took
    // me there" means anything at all.
    await zoomIn(page, 3);
    expect(await isOnScreen(page, markFor(page, '3'))).toBe(false);

    await lineFor(page, '3').click();

    await expect(page.getByTestId('selected-position')).toHaveText('3');
    await expect(page.getByTestId('part-reading')).toContainText('Bleed screw');
    await expect.poll(() => isOnScreen(page, markFor(page, '3'))).toBe(true);
  });

  /**
   * The factory printed one number wherever the part is used, so `2` is on this sheet twice —
   * and selecting it again walks to the next one (story 48). That is how a member finds out the
   * part is fitted in more than one place, which is a thing they need to know before ordering.
   */
  test('a number printed twice takes the member to each place in turn', async ({ page }) => {
    await openFirstDrawing(page);

    await expect(markFor(page, '2')).toHaveCount(2);

    await lineFor(page, '2').click();
    await expect(page.getByTestId('part-reading')).toContainText('Printed in 2 places');
    await expect(currentMark(page)).toHaveCount(1);
    const first = await boxOf(currentMark(page));

    await lineFor(page, '2').click();

    // The same Position, read at its other circle — and the panel says which one, because a
    // member taken somewhere has to be told where.
    await expect(page.getByTestId('selected-position')).toHaveText('2');
    await expect(page.getByTestId('part-reading')).toContainText('This is 2 of them');
    await expect.poll(async () => (await boxOf(currentMark(page))).x).not.toBe(first.x);

    // And round again, rather than stopping at the last: four of four is not a dead end.
    await lineFor(page, '2').click();
    await expect(page.getByTestId('part-reading')).toContainText('This is 1 of them');
  });

  /**
   * "Not known" and "not yet clicked" are different answers (story 45), and until this list
   * existed the only way to tell them apart was to click all two hundred numbers.
   */
  test('a number with nothing recorded at it says so in the list', async ({ page }) => {
    await openFirstDrawing(page);

    await expect(lineFor(page, '4')).toHaveAttribute('data-recorded', 'false');
    await expect(lineFor(page, '4')).toContainText('Not recorded yet');

    await expect(lineFor(page, '1')).toHaveAttribute('data-recorded', 'true');
    await expect(lineFor(page, '1')).toContainText('Front brake caliper, early');
    await expect(lineFor(page, '1')).toContainText('260 03 150');

    // And a number the drawing does not print wears the archive's broken rule here too — there
    // is a part at 5, and no circle to go looking for.
    await expect(lineFor(page, '5')).toHaveAttribute('data-recorded', 'true');
    expect(
      await lineFor(page, '5').evaluate((element) => getComputedStyle(element).borderLeftStyle),
    ).toBe('dashed');
  });
});

test.describe('going straight to a number', () => {
  /**
   * **A member holding a bracket stamped `210` should not have to hunt** (stories 50–51). The
   * suffix is the factory's business — `S` is the left one and `D` the right — and typing the
   * digits has to reach it.
   */
  test('typing the digits finds the number that carries a suffix', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `jump-${info.project.name}`);

    // Two numbers off the same digits, placed the way an Editor places them.
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await placeMarks(page, [
      { x: 0.3, y: 0.3, number: '210 S' },
      { x: 0.7, y: 0.6, number: '211 D' },
    ]);
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByTestId('position-jump').fill('210');

    // What was found is offered rather than guessed at, and pressing Enter takes the first.
    await expect(page.locator('[data-testid="jump-match"][data-position="210 S"]')).toBeVisible();
    await page.getByTestId('position-jump').press('Enter');
    await expect(page.getByTestId('selected-position')).toHaveText('210 S');

    // A prefix that is nobody's number says so, rather than quietly doing nothing.
    await page.getByTestId('position-jump').fill('47');
    await expect(page.getByText('No number on this sheet begins 47')).toBeVisible();
  });
});

test.describe('sending somebody a link', () => {
  /**
   * **Two members talking about one part have to be looking at the same screen** (story 52). The
   * Position being read is the address, so what is shared is what is on the glass — and a link
   * built from the digits alone opens the suffixed number, for the same reason typing them does.
   */
  test('a link opens exactly the position it was copied at', async ({ page }) => {
    await openFirstDrawing(page);

    await lineFor(page, '3').click();
    await expect(page).toHaveURL(/[?&]position=3\b/);

    await page.getByTestId('copy-link').click();
    await expect(page.getByTestId('copy-link')).toContainText('Link copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());

    // Opened cold, the way the other member opens it: no click, and the same number is being
    // read — with the Model, the Tavola and the Position it belongs to said on the panel.
    const shared = page.url();
    await page.goto('/');
    await page.goto(shared);

    await expect(page.getByTestId('selected-position')).toHaveText('3');
    await expect(page.getByTestId('part-reading')).toContainText('Bleed screw');
    await expect(page.getByTestId('part-reading')).toContainText('Tavola 2');
  });

  /**
   * A link retyped from a stamped bracket carries the digits and not the factory's suffix, and it
   * still has to open the number — but the address must then say the number it *opened*. An
   * address bar reading `210` beside a panel reading `210 S` is the screen disagreeing with
   * itself, and the next member sent that link would be sent a number on no sheet.
   */
  test('a link naming only the digits opens the suffixed number, and says so', async ({
    page,
  }, info) => {
    const drawing = await openADrawingOfYourOwn(page, `link-${info.project.name}`);
    const frame = page.getByTestId('drawing-frame');
    const box = await boxOf(frame);

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByTestId('next-number').fill('210 S');
    await frame.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.goto(`${new URL(page.url()).pathname}?position=210`);
    await expect(drawing).toBeVisible();

    await expect(page.getByTestId('selected-position')).toHaveText('210 S');
    await expect(page).toHaveURL(/[?&]position=210%20S$/);
  });

  // A link meant for another sheet, or a number typed off a bracket that is not on this one.
  // Saying so beats the invitation to click a circle, which reads as if nothing had been asked.
  test('a link naming a number this sheet does not carry says that plainly', async ({ page }) => {
    await openFirstDrawing(page);

    await page.goto(`${new URL(page.url()).pathname}?position=417`);

    await expect(page.getByTestId('unknown-number')).toContainText('417');
    await expect(page.getByTestId('selected-position')).toHaveCount(0);
  });
});

test.describe('a part listed at no number', () => {
  /**
   * A Listing may sit on a sheet without a Position — the archive has had that state since Parts
   * existed, and this is the first screen it can be seen on.
   *
   * It is reached the way it actually happens: an Editor records a Part at a number and then
   * removes the number, because a mistyped number is cheap to undo and an evening of part data
   * is not. The Part must not go with it, and it must not disappear from the sheet either.
   */
  test('survives its number being removed, and is still on the sheet', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `unplaced-${info.project.name}`);
    const frame = page.getByTestId('drawing-frame');
    const box = await boxOf(frame);

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
    await page.getByRole('button', { name: 'Done' }).click();

    await markFor(page, '1').click();
    await page.getByRole('button', { name: 'Record a part here' }).click();
    await page.getByLabel('Name (English)').fill('Fixing kit');
    await page.getByRole('button', { name: 'Record this part' }).click();
    await expect(lineFor(page, '1')).toContainText('Fixing kit');

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await markFor(page, '1').click();
    await page.getByRole('button', { name: 'Remove Position 1' }).click();

    await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
    await expect(page.getByTestId('unplaced-parts')).toContainText('Fixing kit');
  });
});
