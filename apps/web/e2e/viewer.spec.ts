import { expect, test, type Locator, type Page } from '@playwright/test';
import { drawingOf, openFirstDrawing } from './support/archive.js';

/**
 * Reading a drawing — the surface the whole product is for, and the one thing at this seam that
 * genuinely cannot be proved anywhere else. A request and a response can say the scan was sent;
 * only a browser can say it **fits the screen**, that magnifying it makes a position number big
 * enough to read, and that it never slides off its own frame while a member is dragging it.
 *
 * Every assertion below is on where the drawing actually is on the glass. Nothing reads the
 * viewer's internal state, so the arithmetic could be rewritten — or replaced by tiles, which
 * ADR 0013 leaves open — without touching a line of this file.
 *
 * Both projects run it, and the phone is the one that matters: the Pixel 7 is the mid-range
 * device in the garage that story 40 is about.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const TOLERANCE = 1;

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('That element is not on the page.');
  }
  return box;
}

function frameOf(page: Page): Locator {
  return page.getByTestId('drawing-frame');
}

/**
 * The whole sheet, as large as the frame allows — which is both halves of the promise. "Fits"
 * would also be true of a drawing rendered at a tenth of the size, and that is not what a member
 * opening a Tavola is owed.
 */
async function expectTheWholeDrawingFits(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const frame = await boxOf(frameOf(page));
      const drawing = await boxOf(drawingOf(page));

      return {
        inside:
          drawing.x >= frame.x - TOLERANCE &&
          drawing.y >= frame.y - TOLERANCE &&
          drawing.x + drawing.width <= frame.x + frame.width + TOLERANCE &&
          drawing.y + drawing.height <= frame.y + frame.height + TOLERANCE,
        fills: Math.max(drawing.width / frame.width, drawing.height / frame.height) > 0.99,
      };
    })
    .toEqual({ inside: true, fills: true });
}

/**
 * No blank paper at an edge, at any zoom: an axis the drawing overflows is covering the frame
 * on both sides, and one it does not is inside it. This is "without losing track of where you
 * are" stated as geometry — the failure it rules out is a drag that flings the sheet away and
 * leaves a member looking at nothing.
 */
async function expectTheFrameIsFullOfDrawing(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const frame = await boxOf(frameOf(page));
      const drawing = await boxOf(drawingOf(page));

      return {
        horizontally: edgeOf({
          drawn: drawing.width,
          at: drawing.x,
          framed: frame.width,
          framedAt: frame.x,
        }),
        vertically: edgeOf({
          drawn: drawing.height,
          at: drawing.y,
          framed: frame.height,
          framedAt: frame.y,
        }),
      };
    })
    .toEqual({ horizontally: 'full of drawing', vertically: 'full of drawing' });
}

function edgeOf(axis: { drawn: number; at: number; framed: number; framedAt: number }): string {
  const held =
    axis.drawn > axis.framed + TOLERANCE
      ? axis.at <= axis.framedAt + TOLERANCE &&
        axis.at + axis.drawn >= axis.framedAt + axis.framed - TOLERANCE
      : axis.at >= axis.framedAt - TOLERANCE &&
        axis.at + axis.drawn <= axis.framedAt + axis.framed + TOLERANCE;

  return held ? 'full of drawing' : 'blank paper at an edge';
}

async function zoomIn(page: Page, presses: number): Promise<void> {
  for (let press = 0; press < presses; press += 1) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
  }
}

/**
 * Where the sheet sits in its frame. Measured against the frame rather than the page, because
 * the page scrolls under both of them and only the difference means anything.
 */
async function offsetOf(page: Page): Promise<Point> {
  const frame = await boxOf(frameOf(page));
  const drawing = await boxOf(drawingOf(page));
  return { x: drawing.x - frame.x, y: drawing.y - frame.y };
}

/** A drag from the middle of the frame, the way a hand on the sheet moves it. */
async function dragBy(page: Page, by: Point, times = 1): Promise<void> {
  await frameOf(page).scrollIntoViewIfNeeded();
  const frame = await boxOf(frameOf(page));
  const from = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };

  for (let pull = 0; pull < times; pull += 1) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 8 });
    await page.mouse.up();
  }
}

/**
 * How far across the sheet the middle of the frame is, as a fraction of the drawing. `0.5` is
 * the middle of the sheet, which is where every drawing opens.
 */
async function middleOfTheView(page: Page): Promise<number> {
  const frame = await boxOf(frameOf(page));
  const drawing = await boxOf(drawingOf(page));
  return (frame.x + frame.width / 2 - drawing.x) / drawing.width;
}

/** Pointing at a fraction of the navigator — its own corners are the sheet's corners. */
async function pointAtNavigator(page: Page, at: Point): Promise<void> {
  const navigator = page.getByTestId('drawing-navigator');
  const box = await boxOf(navigator);
  await navigator.click({ position: { x: box.width * at.x, y: box.height * at.y } });
}

test.describe('reading a drawing', () => {
  test('opens with the whole sheet on screen', async ({ page }) => {
    await openFirstDrawing(page);

    await expectTheWholeDrawingFits(page);
    await expect(page.getByTestId('drawing-magnification')).toHaveText('×1.0');
    // Nothing is off screen, so the navigator has nothing to point at and is not there.
    await expect(page.getByTestId('drawing-navigator')).toBeHidden();
  });

  test('fits the whole sheet again when the phone is turned over', async ({ page }) => {
    await openFirstDrawing(page);

    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error('This project runs without a viewport, so it cannot be turned over.');
    }
    await page.setViewportSize({ width: viewport.height, height: viewport.width });

    await expectTheWholeDrawingFits(page);
  });

  test('magnifies to the scan’s own resolution, so a position number can be read', async ({
    page,
  }) => {
    await openFirstDrawing(page);
    const drawing = drawingOf(page);

    await zoomIn(page, 6);

    // The promise the viewer makes about legibility, in the only terms that mean anything: at
    // full magnification the drawing is on the glass at no fewer pixels than it was scanned at,
    // so the smallest thing the factory printed — a position number, which measures about
    // 0.0124 of the shorter side on a real sheet and is set at that size here — is as large as
    // the scan can make it. Whether that is *enough* is a question about the scanning, and
    // ADR 0013 is where it is asked.
    const drawn = await boxOf(drawing);
    const scanned = await drawing.evaluate((image: HTMLImageElement) => image.naturalWidth);
    expect(drawn.width).toBeGreaterThanOrEqual(scanned * 0.99);
  });

  test('follows the pointer, and stops at the edge of the sheet', async ({ page }) => {
    await openFirstDrawing(page);
    await zoomIn(page, 2);

    // One to one with the hand: at this magnification there is room to move in both directions,
    // so the sheet goes exactly as far as it was dragged and no further.
    const before = await offsetOf(page);
    await dragBy(page, { x: 120, y: 120 });
    const after = await offsetOf(page);
    expect(after.x - before.x).toBeCloseTo(120, -1);
    expect(after.y - before.y).toBeCloseTo(120, -1);

    // And then dragged far past what is there: the sheet stops, rather than sailing off.
    await dragBy(page, { x: 150, y: 150 }, 8);
    await expectTheFrameIsFullOfDrawing(page);
  });

  test('zooms about the pointer, so a wheel magnifies what is under it', async ({ page }) => {
    await openFirstDrawing(page);

    const frame = await boxOf(frameOf(page));
    // Left of centre deliberately: a viewer that zoomed about the middle of the frame would
    // pass a test that only checked the drawing got bigger.
    const at = { x: frame.x + frame.width * 0.35, y: frame.y + frame.height * 0.35 };
    expect(await middleOfTheView(page)).toBeCloseTo(0.5, 2);

    // Far enough in that the sheet is wider than the frame: while it still fits, it is centred
    // by the rule that keeps blank paper out of the frame, and no anchor is observable.
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -600);

    await expect
      .poll(async () => (await page.getByTestId('drawing-magnification').textContent()) ?? '')
      .not.toBe('×1.0');

    // The view has closed in on the left of the sheet, where the pointer was — not on the
    // middle, which is where it started and where a centre-anchored zoom would have kept it.
    expect(await middleOfTheView(page)).toBeLessThan(0.48);
    await expectTheFrameIsFullOfDrawing(page);

    // And the wheel goes back the way it came.
    await page.mouse.wheel(0, 900);
    await expectTheWholeDrawingFits(page);
  });

  test('stays inside its frame at every zoom level', async ({ page }) => {
    await openFirstDrawing(page);

    for (let level = 0; level < 4; level += 1) {
      await zoomIn(page, 1);
      await expectTheFrameIsFullOfDrawing(page);

      // Dragged about at this magnification, not only jumped about — the navigator below is a
      // convenience, and the gesture a member actually uses has to hold up on its own.
      await dragBy(page, { x: 140, y: 140 }, 3);
      await expectTheFrameIsFullOfDrawing(page);

      // Thrown to each corner of the sheet in turn — the fastest way to the places where a
      // viewer that has lost its bearings shows blank paper.
      for (const corner of [
        { x: 0.02, y: 0.02 },
        { x: 0.98, y: 0.98 },
        { x: 0.98, y: 0.02 },
        { x: 0.02, y: 0.98 },
      ]) {
        await pointAtNavigator(page, corner);
        await expectTheFrameIsFullOfDrawing(page);
      }
    }
  });

  test('says where you are once part of the sheet is off screen', async ({ page }) => {
    await openFirstDrawing(page);

    await zoomIn(page, 2);

    const navigator = page.getByTestId('drawing-navigator');
    await expect(navigator).toBeVisible();
    await expect(page.getByTestId('drawing-magnification')).toHaveText('×4.0');

    // The lit part of the navigator is the part in view: well under half the sheet each way.
    const whole = await boxOf(navigator);
    const inView = await boxOf(page.getByTestId('drawing-region'));
    expect(inView.width).toBeLessThan(whole.width * 0.6);
    expect(inView.height).toBeLessThan(whole.height * 0.6);

    // And pointing at it takes the drawing there.
    const before = await offsetOf(page);
    await pointAtNavigator(page, { x: 0.1, y: 0.1 });
    await expect
      .poll(async () => Math.abs((await offsetOf(page)).x - before.x) > TOLERANCE)
      .toBe(true);
    await expectTheFrameIsFullOfDrawing(page);
  });

  test('gives the whole sheet back when the member asks for it', async ({ page }) => {
    await openFirstDrawing(page);

    await zoomIn(page, 3);
    await expect(page.getByTestId('drawing-navigator')).toBeVisible();

    await page.getByRole('button', { name: 'Fit the whole drawing' }).click();

    await expectTheWholeDrawingFits(page);
    await expect(page.getByTestId('drawing-magnification')).toHaveText('×1.0');
    await expect(page.getByTestId('drawing-navigator')).toBeHidden();
  });

  test('fills the screen, and gives it back', async ({ page }) => {
    await openFirstDrawing(page);
    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error('This project runs without a viewport, so nothing can fill it.');
    }

    await page.getByRole('button', { name: 'Full screen' }).click();

    const stage = page.getByTestId('drawing-stage');
    await expect(stage).toHaveAttribute('data-expanded', 'true');
    await expect
      .poll(async () => {
        const box = await boxOf(stage);
        return { width: Math.round(box.width), height: Math.round(box.height) };
      })
      .toEqual({ width: viewport.width, height: viewport.height });

    // Every pixel of a small screen, and the whole drawing still on it.
    await expectTheWholeDrawingFits(page);

    await page.getByRole('button', { name: 'Leave full screen' }).click();
    await expect(stage).toHaveAttribute('data-expanded', 'false');
    await expectTheWholeDrawingFits(page);
  });
});
