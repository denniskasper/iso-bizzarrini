import { expect, test, type Locator, type Page } from '@playwright/test';
import { markFor, openADrawingOfYourOwn } from './support/archive.js';
import { landed, PRACTICE, signInAs } from './support/gate.js';

/**
 * **A Sub-assembly's outline on the drawing** (issue #113).
 *
 * The API seam proves an outline is accepted, refused, replaced and turned. Only a browser can
 * say that clicking corners draws one, that it lies on the drawing where it was drawn at every
 * zoom and after a turn, that it stays out of sight until it is asked for, and that the circles
 * inside it are still what a press lands on.
 *
 * Every test draws on a sheet of its own, so an outline drawn here never shows on a drawing
 * another test is reading.
 */

/** Drawn round number `1`, and round `3`, which is inside it but in no Sub-assembly. */
const SQUARE = [
  { x: 0.2, y: 0.2 },
  { x: 0.5, y: 0.2 },
  { x: 0.5, y: 0.5 },
  { x: 0.2, y: 0.5 },
];

interface Sheet {
  positions: { id: string; number: string }[];
  subAssemblies: { id: string; name: string; outline: { x: number; y: number }[] | null }[];
}

/**
 * A sheet of the test's own, with `1` at the top left in *Door Lock*, `3` near it in nothing, and
 * `2` far away at the bottom right, also in nothing.
 */
async function aSheetWithADoorLock(
  page: Page,
  named: string,
): Promise<{ tavolaId: string; subAssemblyId: string }> {
  await openADrawingOfYourOwn(page, `${named}-${test.info().project.name}`);
  const tavolaId = page.url().split('/tavole/')[1]?.split('?')[0] ?? '';

  let sheet: Sheet = { positions: [], subAssemblies: [] };
  for (const mark of [
    { number: '1', x: 0.3, y: 0.3 },
    { number: '2', x: 0.8, y: 0.8 },
    { number: '3', x: 0.32, y: 0.44 },
  ]) {
    const placed = await page.request.post(`/api/tavole/${tavolaId}/marks`, { data: mark });
    expect(placed.ok()).toBe(true);
    sheet = (await placed.json()) as Sheet;
  }

  const one = sheet.positions.find((position) => position.number === '1');
  const grouped = await page.request.post(`/api/tavole/${tavolaId}/sub-assemblies`, {
    data: { name: 'Door Lock', positionIds: [one?.id] },
  });
  expect(grouped.ok()).toBe(true);
  const subAssemblyId = ((await grouped.json()) as Sheet).subAssemblies[0]?.id ?? '';

  await page.reload();
  await expect(markFor(page, '1')).toBeVisible();
  return { tavolaId, subAssemblyId };
}

async function outlined(
  page: Page,
  subAssemblyId: string,
  corners: { x: number; y: number }[] = SQUARE,
): Promise<void> {
  const response = await page.request.put(`/api/sub-assemblies/${subAssemblyId}/outline`, {
    data: { corners },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(markFor(page, '1')).toBeVisible();
}

function outlineOf(page: Page): Locator {
  return page.getByTestId('sub-assembly-outline');
}

/** A place on the sheet, as fractions of it, clicked the way an Editor or a member clicks it. */
async function clickTheSheetAt(page: Page, at: { x: number; y: number }): Promise<void> {
  const sheet = await page.getByTestId('drawing-marks').boundingBox();
  const frame = await page.getByTestId('drawing-frame').boundingBox();
  if (!sheet || !frame) {
    throw new Error('The drawing is not on the page.');
  }
  await page.getByTestId('drawing-frame').click({
    position: {
      x: sheet.x + sheet.width * at.x - frame.x,
      y: sheet.y + sheet.height * at.y - frame.y,
    },
  });
}

/** Where the outline's box is on the sheet, in the fractions it was drawn in. */
async function outlineBoxOnTheSheet(page: Page) {
  const sheet = await page.getByTestId('drawing-marks').boundingBox();
  const box = await outlineOf(page).boundingBox();
  if (!sheet || !box) {
    throw new Error('The outline is not on the page.');
  }
  return {
    left: (box.x - sheet.x) / sheet.width,
    top: (box.y - sheet.y) / sheet.height,
    right: (box.x + box.width - sheet.x) / sheet.width,
    bottom: (box.y + box.height - sheet.y) / sheet.height,
  };
}

async function readOutline(page: Page, tavolaId: string) {
  const sheet = (await (await page.request.get(`/api/tavole/${tavolaId}`)).json()) as Sheet;
  return sheet.subAssemblies[0]?.outline ?? null;
}

test.describe('drawing an outline', () => {
  test('an Editor clicks its corners, closes it on the first, and it is still there after a reload', async ({
    page,
  }) => {
    const { tavolaId } = await aSheetWithADoorLock(page, 'outline-draw');

    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByRole('button', { name: 'Draw outline' }).click();
    await expect(page.getByTestId('outline-panel')).toContainText('Outlining Door Lock');

    for (const corner of SQUARE) {
      await clickTheSheetAt(page, corner);
    }
    await expect(page.getByTestId('outline-draft')).toHaveAttribute('data-corners', '4');
    // No Mark was placed by any of those clicks: they were corners.
    await expect(page.getByTestId('drawing-mark')).toHaveCount(3);

    await page.getByTestId('outline-close').click();
    await expect(page.getByRole('button', { name: 'Redraw outline' })).toBeVisible();

    await page.reload();
    const corners = (await readOutline(page, tavolaId)) ?? [];
    expect(corners).toHaveLength(4);
    for (const [index, corner] of corners.entries()) {
      expect(corner.x).toBeCloseTo(SQUARE[index]?.x ?? NaN, 1);
      expect(corner.y).toBeCloseTo(SQUARE[index]?.y ?? NaN, 1);
    }
  });

  test('Enter closes it, and Escape abandons it', async ({ page }) => {
    const { tavolaId } = await aSheetWithADoorLock(page, 'outline-keys');
    await page.getByRole('button', { name: 'Mark positions' }).click();

    await page.getByRole('button', { name: 'Draw outline' }).click();
    await clickTheSheetAt(page, SQUARE[0] ?? { x: 0, y: 0 });
    await clickTheSheetAt(page, SQUARE[1] ?? { x: 0, y: 0 });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Draw outline' })).toBeVisible();
    expect(await readOutline(page, tavolaId)).toBeNull();

    await page.getByRole('button', { name: 'Draw outline' }).click();
    for (const corner of SQUARE.slice(0, 3)) {
      await clickTheSheetAt(page, corner);
    }
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Redraw outline' })).toBeVisible();
    expect(await readOutline(page, tavolaId)).toHaveLength(3);

    await page.getByRole('button', { name: 'Remove outline' }).click();
    await expect(page.getByRole('button', { name: 'Draw outline' })).toBeVisible();
    expect(await readOutline(page, tavolaId)).toBeNull();
  });
});

test.describe('seeing an outline', () => {
  test('is hidden until a Sub-assembly is pointed at or selected, or one of its numbers is', async ({
    page,
  }, info) => {
    const { subAssemblyId } = await aSheetWithADoorLock(page, 'outline-see');
    await outlined(page, subAssemblyId);

    await expect(outlineOf(page)).toHaveCount(0);

    // Pointing at its name, where there is a pointer that can rest.
    if (info.project.name === 'chromium') {
      await page.getByTestId('sheet-sub-assembly').hover();
      await expect(outlineOf(page)).toBeVisible();
      await page.getByRole('heading', { level: 1 }).hover();
      await expect(outlineOf(page)).toHaveCount(0);
    }

    // Selecting it, until something else is selected.
    await page.getByTestId('show-outline').click();
    await expect(outlineOf(page)).toBeVisible();
    await markFor(page, '2').click();
    await expect(page.getByTestId('selected-position')).toHaveText('2');
    await expect(outlineOf(page)).toHaveCount(0);

    // Selecting one of its numbers shows the Sub-assembly that number is in.
    await markFor(page, '1').click();
    await expect(page.getByTestId('selected-position')).toHaveText('1');
    await expect(outlineOf(page)).toBeVisible();
  });

  test('leaves a Mark inside it clickable, and opens the Sub-assembly when clicked', async ({
    page,
  }) => {
    const { tavolaId, subAssemblyId } = await aSheetWithADoorLock(page, 'outline-click');
    await outlined(page, subAssemblyId);

    await page.getByTestId('show-outline').click();
    await expect(outlineOf(page)).toBeVisible();

    // `3` is inside the outline and in no Sub-assembly: the press is the circle's.
    await markFor(page, '3').click();
    await expect(page.getByTestId('selected-position')).toHaveText('3');

    // Back to the outline, and a press inside it away from every circle.
    await page.getByTestId('show-outline').click();
    await clickTheSheetAt(page, { x: 0.44, y: 0.25 });
    await expect(page).toHaveURL(new RegExp(`/tavole/${tavolaId}/sub-assemblies/${subAssemblyId}`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Door Lock');
  });

  test('lines up with the drawing at several zoom levels, and on a turned drawing', async ({
    page,
  }) => {
    const { tavolaId, subAssemblyId } = await aSheetWithADoorLock(page, 'outline-zoom');
    await outlined(page, subAssemblyId);
    await page.getByTestId('show-outline').click();

    for (const step of [0, 1, 2]) {
      if (step > 0) {
        await page.getByRole('button', { name: 'Zoom in' }).click();
      }
      await expect(async () => {
        const box = await outlineBoxOnTheSheet(page);
        expect(box.left).toBeCloseTo(0.2, 1);
        expect(box.top).toBeCloseTo(0.2, 1);
        expect(box.right).toBeCloseTo(0.5, 1);
        expect(box.bottom).toBeCloseTo(0.5, 1);
      }).toPass();
    }

    // A quarter clockwise: (x, y) → (1 − y, x), so the square is now 0.5–0.8 across.
    await page.getByRole('button', { name: 'Turn clockwise' }).click();
    await expect
      .poll(async () => (await readOutline(page, tavolaId))?.[0]?.x ?? NaN)
      .toBeCloseTo(0.8);
    await page.reload();
    await page.getByTestId('show-outline').click();
    await expect(async () => {
      const box = await outlineBoxOnTheSheet(page);
      expect(box.left).toBeCloseTo(0.5, 1);
      expect(box.top).toBeCloseTo(0.2, 1);
      expect(box.right).toBeCloseTo(0.8, 1);
      expect(box.bottom).toBeCloseTo(0.5, 1);
    }).toPass();
  });
});

/**
 * **Reshaping an outline already drawn** (issue #115): the corners are moved, added and taken off
 * on the drawing itself, each change saved as it is made.
 */
test.describe('reshaping an outline', () => {
  async function reshapeDoorLock(page: Page, name: string): Promise<string> {
    const { tavolaId, subAssemblyId } = await aSheetWithADoorLock(page, name);
    await outlined(page, subAssemblyId);
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByRole('button', { name: 'Reshape outline' }).click();
    await expect(page.getByTestId('outline-panel')).toContainText('Reshaping Door Lock');
    await expect(page.getByTestId('outline-corner')).toHaveCount(4);
    // The panel sits under the drawing, and pressing its button scrolled the page down to it,
    // taking the drawing up under the header: back to the top, where a hand can reach it.
    await page.evaluate(() => window.scrollTo(0, 0));
    return tavolaId;
  }

  /** Where a place on the sheet is on the page, for a hand to press there. */
  async function onThePage(page: Page, at: { x: number; y: number }) {
    const sheet = await page.getByTestId('drawing-marks').boundingBox();
    if (!sheet) {
      throw new Error('The drawing is not on the page.');
    }
    return { x: sheet.x + sheet.width * at.x, y: sheet.y + sheet.height * at.y };
  }

  test('a corner is dragged to a new place, a side takes a new corner, and both are still there after a reload', async ({
    page,
  }) => {
    const tavolaId = await reshapeDoorLock(page, 'outline-reshape-drag');

    // Zoomed in about the corner first, which stays under the pointer: reshaping is for
    // following a dense sheet closely.
    const corner = await onThePage(page, { x: 0.2, y: 0.2 });
    await page.mouse.move(corner.x, corner.y);
    const magnification = page.getByTestId('drawing-magnification');
    const before = await magnification.textContent();
    await page.mouse.wheel(0, -400);
    await expect.poll(() => magnification.textContent()).not.toBe(before);

    const from = await onThePage(page, { x: 0.2, y: 0.2 });
    const to = await onThePage(page, { x: 0.1, y: 0.12 });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await expect
      .poll(async () => (await readOutline(page, tavolaId))?.[0]?.x ?? NaN)
      .toBeCloseTo(0.1, 1);

    // The bottom side, from (0.5, 0.5) to (0.2, 0.5): a click halfway along it.
    await page.getByRole('button', { name: 'Fit the whole drawing' }).click();
    await expect(magnification).toHaveText('×1.0');
    // The sheet glides back to fit, and a click aimed at a side has to wait for it to arrive.
    let last = '';
    await expect
      .poll(async () => {
        const now = JSON.stringify(await page.getByTestId('drawing-marks').boundingBox());
        const still = now === last;
        last = now;
        return still;
      })
      .toBe(true);
    await clickTheSheetAt(page, { x: 0.35, y: 0.5 });
    await expect(page.getByTestId('outline-corner')).toHaveCount(5);
    await expect.poll(async () => (await readOutline(page, tavolaId))?.length).toBe(5);

    await page.reload();
    const corners = (await readOutline(page, tavolaId)) ?? [];
    expect(corners[0]?.x).toBeCloseTo(0.1, 1);
    expect(corners[0]?.y).toBeCloseTo(0.12, 1);
    expect(corners[3]?.x).toBeCloseTo(0.35, 1);
    expect(corners[3]?.y).toBeCloseTo(0.5, 2);
  });

  test('a corner is taken off, but never the one that would leave fewer than three', async ({
    page,
  }) => {
    const tavolaId = await reshapeDoorLock(page, 'outline-reshape-remove');
    const remove = page.getByRole('button', { name: 'Remove corner' });
    await expect(remove).toBeDisabled();

    await page.getByTestId('outline-corner').nth(1).click();
    await remove.click();
    await expect(page.getByTestId('outline-corner')).toHaveCount(3);
    await expect.poll(async () => (await readOutline(page, tavolaId))?.length).toBe(3);

    await page.getByTestId('outline-corner').nth(0).click();
    await remove.click();
    await expect(page.getByTestId('outline-panel')).toContainText(
      'An outline keeps at least 3 corners.',
    );
    await expect(page.getByTestId('outline-corner')).toHaveCount(3);

    await page.getByRole('button', { name: 'Done' }).click();
    await page.reload();
    expect(await readOutline(page, tavolaId)).toHaveLength(3);
  });

  test('Backspace while drawing takes back the last corner', async ({ page }) => {
    await aSheetWithADoorLock(page, 'outline-undo');
    await page.getByRole('button', { name: 'Mark positions' }).click();
    await page.getByRole('button', { name: 'Draw outline' }).click();

    for (const corner of SQUARE.slice(0, 3)) {
      await clickTheSheetAt(page, corner);
    }
    await expect(page.getByTestId('outline-draft')).toHaveAttribute('data-corners', '3');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('outline-draft')).toHaveAttribute('data-corners', '2');
    await page.getByRole('button', { name: 'Undo last corner' }).click();
    await expect(page.getByTestId('outline-draft')).toHaveAttribute('data-corners', '1');
  });
});

test.describe('a Mark outside its outline', () => {
  /** A triangle in the top left that leaves `1`, at (0.3, 0.3), outside it. */
  const MISSES_ONE = [
    { x: 0.05, y: 0.05 },
    { x: 0.25, y: 0.05 },
    { x: 0.05, y: 0.25 },
  ];

  test('is named to an Editor, and a Member sees nothing of it', async ({ page }) => {
    const { tavolaId, subAssemblyId } = await aSheetWithADoorLock(page, 'outline-outside');

    await outlined(page, subAssemblyId);
    await expect(page.getByTestId('sheet-sub-assembly')).toBeVisible();
    await expect(page.getByTestId('outside-outline')).toHaveCount(0);

    await outlined(page, subAssemblyId, MISSES_ONE);
    await expect(page.getByTestId('outside-outline')).toHaveText('Outside its outline: 1');

    await page.context().clearCookies();
    await signInAs(page, PRACTICE.member);
    await landed(page);
    await page.goto(`/tavole/${tavolaId}`);
    await expect(page.getByTestId('sheet-sub-assembly')).toBeVisible();
    await expect(page.getByTestId('outside-outline')).toHaveCount(0);
  });
});
