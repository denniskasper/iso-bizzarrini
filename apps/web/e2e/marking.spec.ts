import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  aFrameLater,
  markFor,
  openADrawingOfYourOwn,
  openFirstDrawing,
} from './support/archive.js';

/**
 * The numbered circles, and the tool that puts them there.
 *
 * **This is the seam that has to carry it.** A request and a response can say a Mark was
 * recorded at a fraction of a drawing; only a browser can say the circle is *on the number* —
 * and only a browser can say it is still on the number after the member has magnified the sheet
 * four times, which is the whole promise of storing a Mark as a fraction rather than as a pixel.
 *
 * Both projects run it, and the phone is the one that matters: the Pixel 7 is the mid-range
 * device in the garage, and it is where a circle either can be hit with a thumb or cannot.
 */

/** The 44px floor everything in this archive obeys, because the hands using it are cold. */
const THUMB = 44;

function frameOf(page: Page): Locator {
  return page.getByTestId('drawing-frame');
}

/** One click on the drawing, at a fraction of its frame. */
async function clickAt(page: Page, x: number, y: number): Promise<void> {
  const frame = frameOf(page);
  const box = await frame.boundingBox();
  if (!box) {
    throw new Error('The drawing has no frame.');
  }
  await frame.click({ position: { x: box.width * x, y: box.height * y } });
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('That element is not on the page.');
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where a circle sits on the sheet, as a fraction of the drawing — the same units the archive
 * stores it in, measured from where it actually is on the glass.
 */
async function whereOnTheSheet(page: Page, mark: Locator): Promise<{ x: number; y: number }> {
  const sheet = await page.getByTestId('drawing-marks').boundingBox();
  const at = await centreOf(mark);
  if (!sheet) {
    throw new Error('The drawing is not on the page.');
  }
  return { x: (at.x - sheet.x) / sheet.width, y: (at.y - sheet.y) / sheet.height };
}

/**
 * Whether the digits typed over an unreadable print sit inside their ring: narrower than the
 * inside of the heaviest ring a circle wears (a seventh of it, on the one being read), and
 * centred on it. Measured on the glass, at whatever magnification it is at.
 */
async function digitsFitTheirRing(mark: Locator): Promise<boolean> {
  return mark.getByTestId('drawing-mark-number').evaluate((disc) => {
    const range = document.createRange();
    range.selectNodeContents(disc);
    const digits = range.getBoundingClientRect();
    const ring = disc.getBoundingClientRect();
    const inside = ring.width * (1 - 2 / 7);
    const centred = Math.abs(digits.x + digits.width / 2 - (ring.x + ring.width / 2)) < 1;
    return digits.width > 0 && digits.width <= inside && centred;
  });
}

test.describe('reading the circles on a drawing', () => {
  /**
   * The headline, and the one thing this ticket is judged on: **a Mark is clickable and lands on
   * its Position at several zoom levels.**
   *
   * The magnification is done with the wheel *over the circle*, which is both how a member
   * actually zooms in on something and the strictest form of the assertion — the circle has to
   * still be under the pointer afterwards, or it was never pinned to the drawing at all.
   */
  test('a circle lands on its Position, however far in the member has zoomed', async ({ page }) => {
    await openFirstDrawing(page);

    const three = markFor(page, '3');
    const magnification = page.getByTestId('drawing-magnification');

    for (const step of [0, 1, 2, 3]) {
      if (step > 0) {
        await frameOf(page).scrollIntoViewIfNeeded();
        const before = await magnification.textContent();
        const at = await centreOf(three);
        await page.mouse.move(at.x, at.y);
        await page.mouse.wheel(0, -400);
        // Magnified about the circle itself, so it is still under the pointer afterwards —
        // which it can only be if it is pinned to the drawing rather than to the frame.
        await expect.poll(() => magnification.textContent()).not.toBe(before);
      }

      // The panel is moved off 3 first, so that reading "3" cannot be it never having changed.
      await page.locator('[data-testid="position-chip"][data-position="2"]').click();
      await expect(page.getByTestId('selected-position')).toHaveText('2');

      await three.click();
      await expect(page.getByTestId('selected-position')).toHaveText('3');
    }
  });

  /**
   * The same promise stated as geometry rather than as a click: whatever the magnification, the
   * circle is at the same place on the *sheet*. This is what "stored in fractional image
   * coordinates" buys, and it is measured here rather than argued.
   */
  test('a circle stays on its number as the drawing is magnified', async ({ page }) => {
    await openFirstDrawing(page);

    const four = markFor(page, '4');
    const fitted = await whereOnTheSheet(page, four);

    for (let press = 0; press < 3; press += 1) {
      await page.getByRole('button', { name: 'Zoom in' }).click();
    }
    await expect(page.getByTestId('drawing-magnification')).not.toHaveText('×1.0');
    // The readout can already show an earlier press while the last one is still to be painted.
    await aFrameLater(page);

    const magnified = await whereOnTheSheet(page, four);
    expect(magnified.x).toBeCloseTo(fitted.x, 2);
    expect(magnified.y).toBeCloseTo(fitted.y, 2);
  });

  // Cold hands, thick gloves, a phone held at arm's length under a bonnet.
  test('a circle is big enough to hit with a thumb', async ({ page }) => {
    await openFirstDrawing(page);

    const box = await markFor(page, '1').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(THUMB);
    expect(box?.height).toBeGreaterThanOrEqual(THUMB);
  });

  // A Position with no Mark is an ordinary thing for a catalog to list, and the difference
  // between "not known" and "not drawn" is one a member has to be able to see.
  test('a number the drawing does not show is listed, and says so', async ({ page }) => {
    await openFirstDrawing(page);

    await expect(markFor(page, '5')).toHaveCount(0);

    await page.locator('[data-testid="position-chip"][data-position="5"]').click();

    await expect(page.getByTestId('selected-position')).toHaveText('5');
    await expect(page.getByRole('region', { name: 'Position' })).toContainText(
      'listed but not drawn',
    );
  });
});

test.describe('marking up a drawing', () => {
  /**
   * **One click, one circle** — the whole ticket, and the project's critical path. What is
   * asserted is that a single click on the sheet leaves a Mark *where it was clicked*, and that
   * the tool has already moved to the next number by the time the hand is back on the drawing.
   */
  test('an Editor places a Mark with one click, and the tool moves on', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `one-click-${info.project.name}`);

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await expect(page.getByTestId('next-number')).toHaveValue('1');

    const frame = frameOf(page);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }
    const sheet = await page.getByTestId('drawing-marks').boundingBox();
    if (!sheet) {
      throw new Error('The drawing is not on the page.');
    }
    await frame.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });

    // The circle is on the archive's answer rather than on an optimistic guess — and it is
    // where the Editor put it, which is the fractional round trip proving itself end to end.
    await expect(page.getByTestId('drawing-mark')).toHaveCount(1);
    const placed = await whereOnTheSheet(page, markFor(page, '1'));
    expect(placed.x).toBeCloseTo((box.x + box.width * 0.3 - sheet.x) / sheet.width, 2);
    expect(placed.y).toBeCloseTo((box.y + box.height * 0.4 - sheet.y) / sheet.height, 2);

    await expect(page.getByTestId('next-number')).toHaveValue('2');
    await expect(page.locator('[data-testid="position-chip"][data-position="1"]')).toBeVisible();

    // And again, without touching anything else: two clicks are two Positions.
    await frame.click({ position: { x: box.width * 0.7, y: box.height * 0.6 } });
    await expect(page.getByTestId('drawing-mark')).toHaveCount(2);
    await expect(markFor(page, '2')).toHaveCount(1);
    await expect(page.getByTestId('next-number')).toHaveValue('3');
  });

  /**
   * The factory printed the same number wherever the part is used, and a member has to be able
   * to click it in all four places — so marking all four has to stay **one click each**. That is
   * what "keep this number" is for, and it is the only reason this control exists.
   */
  test('one number can carry several circles, at one click each', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `several-${info.project.name}`);
    const frame = frameOf(page);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByTestId('hold-number').check();

    for (const at of [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.7 },
      { x: 0.5, y: 0.25 },
    ]) {
      await frame.click({ position: { x: box.width * at.x, y: box.height * at.y } });
    }

    // Three circles, one Position, and the field never moved off it.
    await expect(markFor(page, '1')).toHaveCount(3);
    await expect(page.locator('[data-testid="position-chip"]')).toHaveCount(1);
    await expect(page.getByTestId('next-number')).toHaveValue('1');

    // Any of them reads the same Position, which is the point of there being three.
    await markFor(page, '1').last().click();
    await expect(page.getByTestId('selected-position')).toHaveText('1');
    await expect(page.getByRole('region', { name: 'Position' })).toContainText('3 places');

    // And letting go of the number puts the tool back on its way through the catalog: the next
    // click is still this number's last circle, and the one after it is the next number.
    await page.getByTestId('hold-number').uncheck();
    await frame.click({ position: { x: box.width * 0.2, y: box.height * 0.6 } });
    await expect(markFor(page, '1')).toHaveCount(4);
    await expect(page.getByTestId('next-number')).toHaveValue('2');
  });

  test('a Mark in the wrong place is moved, and one placed by mistake is taken off', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `corrections-${info.project.name}`);
    const frame = frameOf(page);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await frame.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    const mark = markFor(page, '1');
    await expect(mark).toHaveCount(1);

    // Dragged across the sheet by the circle itself, which is the gesture an Editor uses.
    const before = await whereOnTheSheet(page, mark);
    const from = await centreOf(mark);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y + 60, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => (await whereOnTheSheet(page, mark)).x > before.x + 0.01)
      .toBe(true);
    // Moved, not multiplied: the Position still has exactly one circle.
    await expect(page.getByTestId('drawing-mark')).toHaveCount(1);

    await mark.click();
    await page.getByRole('button', { name: 'Remove this Mark' }).click();

    // The circle is gone and the number is not: a Position with no Mark is listed, not deleted.
    await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
    await expect(page.locator('[data-testid="position-chip"][data-position="1"]')).toBeVisible();
  });

  /**
   * **A print nobody can read** (issue #234). The Scan is never touched: the club's typed number
   * is a disc drawn over it, and the digits are the Position's — three of them have to fit the
   * ring at every magnification, because the ring is fixed to the sheet.
   */
  test('an Editor types the number over a print nobody can read', async ({
    page,
    hasTouch,
  }, info) => {
    await openADrawingOfYourOwn(page, `illegible-${info.project.name}`);
    const frame = frameOf(page);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByTestId('next-number').fill('102');
    await page.getByTestId('hold-number').check();
    await frame.click({ position: { x: box.width * 0.3, y: box.height * 0.3 } });
    await frame.click({ position: { x: box.width * 0.6, y: box.height * 0.6 } });
    await page.getByTestId('next-number').fill('103');
    await frame.click({ position: { x: box.width * 0.6, y: box.height * 0.3 } });
    const [smudged, clear] = [markFor(page, '102').first(), markFor(page, '102').last()];
    await expect(markFor(page, '102')).toHaveCount(2);
    await expect(smudged).toHaveText('');

    await smudged.click();
    await page.getByRole('checkbox', { name: 'Print unreadable' }).check();

    // Only the circle that was chosen: the Position's other print can still be read.
    await expect(smudged).toHaveText('102');
    await expect(smudged).toHaveAttribute('data-illegible', 'true');
    await expect(clear).toHaveText('');

    for (const step of [0, 1, 2, 3]) {
      if (step > 0) {
        await page.getByRole('button', { name: 'Zoom in' }).click();
        await aFrameLater(page);
      }
      expect(await digitsFitTheirRing(smudged)).toBe(true);
    }

    if (!hasTouch) {
      await page.getByRole('button', { name: 'Fit the whole drawing' }).click();
      // Another number being read, since the column beside the drawing already reads this one.
      await markFor(page, '103').click();
      await smudged.hover();
      await expect(page.getByTestId('mark-card')).toContainText(
        'Number typed by the club — the print is unreadable.',
      );
    }

    // Moved, it is still the same Mark and still says so.
    await page.getByRole('button', { name: 'Fit the whole drawing' }).click();
    await aFrameLater(page);
    const from = await centreOf(smudged);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 40, from.y + 80, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('[data-testid="drawing-mark"][data-illegible="true"]')).toHaveText(
      '102',
    );

    // And where a phone reads it, beside or under the drawing, for the circle being read.
    await page.locator('[data-testid="drawing-mark"][data-illegible="true"]').click();
    await expect(page.getByTestId('part-reading')).toContainText(
      'Number typed by the club — the print is unreadable.',
    );

    // And taken back: the print was legible after all.
    await page.locator('[data-testid="drawing-mark"][data-illegible="true"]').click();
    await page.getByRole('checkbox', { name: 'Print unreadable' }).uncheck();
    await expect(page.locator('[data-testid="drawing-mark"][data-illegible="true"]')).toHaveCount(
      0,
    );
    await expect(markFor(page, '102').first()).toHaveText('');
    await expect(page.getByTestId('part-reading')).not.toContainText('Number typed by the club');
  });

  test('a number the sheet does not print is listed without a circle', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `undrawn-${info.project.name}`);

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByTestId('next-number').fill('207');
    await page.getByRole('button', { name: 'List without a Mark' }).click();

    await expect(page.locator('[data-testid="position-chip"][data-position="207"]')).toBeVisible();
    await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
    await expect(page.getByTestId('next-number')).toHaveValue('208');
  });

  // A member's drawing is a drawing. Nothing a member does to it records anything.
  test('a drawing nobody is marking up records nothing when it is clicked', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `read-only-${info.project.name}`);
    const frame = frameOf(page);
    const box = await frame.boundingBox();
    if (!box) {
      throw new Error('The drawing has no frame.');
    }

    await frame.click({ position: { x: box.width * 0.4, y: box.height * 0.4 } });
    await frame.click({ position: { x: box.width * 0.6, y: box.height * 0.5 } });

    await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
    await expect(page.locator('[data-testid="position-chip"]')).toHaveCount(0);
  });
});

test.describe('removing several numbers at once', () => {
  function chip(page: Page, number: string): Locator {
    return page.locator(`[data-testid="position-chip"][data-position="${number}"]`);
  }

  /**
   * A run of stray numbers (issue #240): fourteen of them were 42 clicks one at a time. Here a
   * run is two clicks to pick and one confirmation to remove, in one request.
   */
  test('an Editor picks a run in the strip, and removes it with one confirmation', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `remove-run-${info.project.name}`);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    for (const [at, x] of [0.15, 0.3, 0.45, 0.6, 0.75].entries()) {
      await clickAt(page, x, 0.5);
      await expect(page.getByTestId('drawing-mark')).toHaveCount(at + 1);
    }

    await page.getByRole('button', { name: 'Select numbers' }).click();
    // While picking, a click on the drawing places nothing.
    await clickAt(page, 0.5, 0.2);
    await chip(page, '2').click();
    await chip(page, '4').click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('picked-numbers')).toHaveText('3 numbers: 2–4');
    await expect(chip(page, '3')).toHaveAttribute('aria-pressed', 'true');
    await expect(markFor(page, '3')).toHaveAttribute('data-selected', 'true');

    // A press toggles: 3 off, and a circle on the drawing on.
    await chip(page, '3').click();
    await markFor(page, '5').click();
    await expect(page.getByTestId('picked-numbers')).toHaveText('3 numbers: 2, 4–5');

    await page.getByRole('button', { name: 'Remove 3 Positions' }).click();
    await expect(page.getByText('Remove 3 Positions and their circles?')).toBeVisible();
    await page.getByRole('button', { name: 'Keep them' }).click();
    await expect(page.getByTestId('drawing-mark')).toHaveCount(5);

    await page.getByRole('button', { name: 'Remove 3 Positions' }).click();
    await page.getByRole('button', { name: 'Yes, remove them' }).click();

    await expect(page.getByTestId('position-chip')).toHaveCount(2);
    await expect(chip(page, '1')).toBeVisible();
    await expect(chip(page, '3')).toBeVisible();
    await expect(page.getByTestId('drawing-mark')).toHaveCount(2);
    // Done selecting: the tool is back to placing.
    await expect(page.getByRole('button', { name: 'Select numbers' })).toBeVisible();
  });
});

/**
 * **Taking back what the tool just did** (issue #236). One click per circle and nothing to
 * confirm is what makes marking fast, and it is also where the mistakes come from — so the way
 * back is one press too, newest first, and only for what this Editor did while the tool was open.
 */
test.describe('undoing the marking tool', () => {
  function undo(page: Page): Locator {
    return page.getByRole('button', { name: 'Undo' });
  }

  test('takes back a placed circle, newest first, and the number with it', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `undo-place-${info.project.name}`);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await expect(undo(page)).toBeDisabled();

    await clickAt(page, 0.3, 0.3);
    await clickAt(page, 0.6, 0.6);
    await expect(page.getByTestId('drawing-mark')).toHaveCount(2);
    await expect(page.getByTestId('next-number')).toHaveValue('3');

    await undo(page).click();

    // The circle and the number it made are gone, and the field is back on the number, ready
    // to be placed again where it should have gone.
    await expect(markFor(page, '2')).toHaveCount(0);
    await expect(page.locator('[data-testid="position-chip"][data-position="2"]')).toHaveCount(0);
    await expect(page.getByTestId('next-number')).toHaveValue('2');

    await undo(page).click();
    await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
    await expect(page.getByTestId('next-number')).toHaveValue('1');
    await expect(undo(page)).toBeDisabled();
  });

  test('takes a second circle off a number, and leaves the number and its first', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `undo-held-${info.project.name}`);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByTestId('hold-number').check();
    await clickAt(page, 0.3, 0.3);
    await clickAt(page, 0.6, 0.6);
    await expect(markFor(page, '1')).toHaveCount(2);

    await undo(page).click();

    await expect(markFor(page, '1')).toHaveCount(1);
    await expect(page.locator('[data-testid="position-chip"][data-position="1"]')).toBeVisible();
    await expect(page.getByTestId('next-number')).toHaveValue('1');
  });

  test('takes back a move, a tick and a removal', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `undo-corrections-${info.project.name}`);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await clickAt(page, 0.3, 0.3);
    const mark = markFor(page, '1');
    await expect(mark).toHaveCount(1);
    const placed = await whereOnTheSheet(page, mark);

    // A drag that went too far.
    const from = await centreOf(mark);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y + 60, { steps: 8 });
    await page.mouse.up();
    await expect
      .poll(async () => (await whereOnTheSheet(page, mark)).x > placed.x + 0.01)
      .toBe(true);
    await undo(page).click();
    await expect.poll(async () => (await whereOnTheSheet(page, mark)).x).toBeCloseTo(placed.x, 3);

    // "Print unreadable" on the wrong circle.
    await mark.click();
    await page.getByRole('checkbox', { name: 'Print unreadable' }).check();
    await expect(mark).toHaveAttribute('data-illegible', 'true');
    await undo(page).click();
    await expect(mark).toHaveAttribute('data-illegible', 'false');

    // And a circle taken off that should have stayed: back where it was, as it was.
    await page.getByRole('checkbox', { name: 'Print unreadable' }).check();
    await expect(mark).toHaveAttribute('data-illegible', 'true');
    await page.getByRole('button', { name: 'Remove this Mark' }).click();
    await expect(page.getByTestId('drawing-mark')).toHaveCount(0);
    await undo(page).click();
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute('data-illegible', 'true');
    const back = await whereOnTheSheet(page, mark);
    expect(back.x).toBeCloseTo(placed.x, 3);
    expect(back.y).toBeCloseTo(placed.y, 3);
  });

  test('is Ctrl+Z on a keyboard, and forgets everything on Done', async ({
    page,
    hasTouch,
  }, info) => {
    test.skip(hasTouch, 'A phone has no keyboard shortcut; the button is the same undo.');
    await openADrawingOfYourOwn(page, `undo-keyboard-${info.project.name}`);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await clickAt(page, 0.3, 0.3);
    await clickAt(page, 0.6, 0.6);
    await expect(page.getByTestId('drawing-mark')).toHaveCount(2);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('drawing-mark')).toHaveCount(1);

    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await expect(undo(page)).toBeDisabled();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.getByTestId('drawing-mark')).toHaveCount(1);
  });

  test('refuses a circle somebody else has changed since, and changes nothing', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `undo-stale-${info.project.name}`);
    const tavolaId = /\/tavole\/([^/?]+)/.exec(page.url())?.[1];
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await clickAt(page, 0.3, 0.3);
    await expect(markFor(page, '1')).toHaveCount(1);

    // Another Editor, at another screen, moves the same circle.
    const sheet = await (await page.request.get(`/api/tavole/${tavolaId}`)).json();
    const markId = sheet.positions[0].marks[0].id as string;
    await page.request.patch(`/api/marks/${markId}`, { data: { x: 0.8, y: 0.8 } });

    await undo(page).click();

    await expect(page.getByText('That Mark has changed since')).toBeVisible();
    const after = await (await page.request.get(`/api/tavole/${tavolaId}`)).json();
    expect(after.positions[0].marks).toEqual([{ id: markId, x: 0.8, y: 0.8, illegible: false }]);
  });

  test('asks before removing a Position, which no undo brings back', async ({ page }, info) => {
    await openADrawingOfYourOwn(page, `undo-position-${info.project.name}`);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await clickAt(page, 0.3, 0.3);
    await expect(markFor(page, '1')).toHaveCount(1);
    await markFor(page, '1').click();

    await page.getByRole('button', { name: 'Remove Position 1' }).click();
    await expect(markFor(page, '1')).toHaveCount(1);
    await page.getByRole('button', { name: 'Keep it' }).click();
    await expect(markFor(page, '1')).toHaveCount(1);

    await page.getByRole('button', { name: 'Remove Position 1' }).click();
    await page.getByRole('button', { name: 'Yes, remove it' }).click();
    await expect(page.locator('[data-testid="position-chip"][data-position="1"]')).toHaveCount(0);

    // Not the removal, and nothing done to the number before it, which has nothing left to be
    // undone on.
    await expect(undo(page)).toBeDisabled();
  });
});
