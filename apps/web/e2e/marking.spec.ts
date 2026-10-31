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
