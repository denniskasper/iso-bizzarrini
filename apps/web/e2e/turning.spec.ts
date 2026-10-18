import { expect, test } from '@playwright/test';
import { openADrawingOfYourOwn } from './support/archive.js';

/**
 * **Turning a sheet scanned on its side** (issue #34): the drawing turns a quarter, and every
 * circle on it turns with it, so nothing has to be marked again.
 */
test('a quarter turn clockwise takes the drawing and its circles round together', async ({
  page,
}) => {
  const drawing = await openADrawingOfYourOwn(page, `turn-${test.info().project.name}`);
  const tavolaId = page.url().split('/tavole/')[1]?.split('?')[0] ?? '';

  const placed = await page.request.post(`/api/tavole/${tavolaId}/marks`, {
    data: { number: '1', x: 0.2, y: 0.1 },
  });
  expect(placed.ok()).toBe(true);
  await page.reload();
  const before = await drawing.getAttribute('src');

  await page.getByRole('button', { name: 'Turn clockwise' }).click();

  // A new picture at a new address, and the circle where the turn put it: (x, y) → (1 − y, x).
  await expect(drawing).not.toHaveAttribute('src', before ?? '');
  const sheet = (await (await page.request.get(`/api/tavole/${tavolaId}`)).json()) as {
    positions: { number: string; marks: { x: number; y: number }[] }[];
  };
  const [mark] = sheet.positions.find((position) => position.number === '1')?.marks ?? [];
  expect(mark?.x).toBeCloseTo(0.9);
  expect(mark?.y).toBeCloseTo(0.2);
  await expect(page.locator('[data-testid="drawing-mark"][data-position="1"]')).toBeVisible();
});
