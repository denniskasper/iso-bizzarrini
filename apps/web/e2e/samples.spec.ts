import { expect, test } from '@playwright/test';
import { expectTheSheetIsDrawn, markFor, openADrawingOfYourOwn } from './support/archive.js';

/**
 * **Showing a drawing to Visitors** (ADR 0019, issue #129): an Administrator picks the number
 * Visitors may read by pressing its circle on the drawing, opens another the same way, and stops
 * showing it in one press.
 *
 * Thin on purpose. Who may do it, what is refused and what the public copy is are proved at the
 * API seam; what only a browser can say is that pressing a circle is what chooses the number.
 */
test('an Administrator shows a drawing by picking its number, and stops showing it', async ({
  page,
  playwright,
  baseURL,
}, info) => {
  const drawing = await openADrawingOfYourOwn(page, `sample-${info.project.name}`);

  // Two numbers on the sheet, put there through the archive rather than through the marking tool,
  // which has its own suite.
  const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  for (const [number, x] of [
    ['1', 0.3],
    ['2', 0.7],
  ] as const) {
    const placed = await page.request.post(`/api/tavole/${tavolaId}/marks`, {
      data: { number, x, y: 0.5 },
    });
    expect(placed.ok()).toBe(true);
  }
  await page.reload();
  await expectTheSheetIsDrawn(drawing);

  const band = page.getByTestId('show-to-visitors');
  await band.getByRole('button', { name: 'Show to Visitors' }).click();
  await expect(page.getByTestId('picking-open-number')).toBeVisible();

  await markFor(page, '1').click();
  await expect(page.getByTestId('sample-open-number')).toHaveText('1');

  // The public copy answers somebody who has not signed in, and the Scan does not.
  const sample = (await (await page.request.get(`/api/tavole/${tavolaId}`)).json()) as {
    tavola: { scan: { displayUrl: string }; sample: { drawing: { url: string } } };
  };
  const visitor = await playwright.request.newContext({ baseURL });
  expect((await visitor.get(sample.tavola.sample.drawing.url)).status()).toBe(200);
  expect((await visitor.get(sample.tavola.scan.displayUrl)).status()).toBe(401);

  await band.getByRole('button', { name: 'Open another number' }).click();
  await markFor(page, '2').click();
  await expect(page.getByTestId('sample-open-number')).toHaveText('2');

  await band.getByRole('button', { name: 'Stop showing' }).click();
  await expect(band.getByRole('button', { name: 'Show to Visitors' })).toBeVisible();
  expect((await visitor.get(sample.tavola.sample.drawing.url)).status()).toBe(404);
  await visitor.dispose();
});

/**
 * **A Sample ends when its open number goes** (issue #130): an Administrator finds the drawing
 * says so, and why, where they would show it again. The ending itself is proved at the API seam.
 */
test('an Administrator is told a drawing stopped being shown when its open number was removed', async ({
  page,
}, info) => {
  const drawing = await openADrawingOfYourOwn(page, `sample-ended-${info.project.name}`);
  const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const placed = await page.request.post(`/api/tavole/${tavolaId}/marks`, {
    data: { number: '1', x: 0.3, y: 0.5 },
  });
  expect(placed.ok()).toBe(true);
  const { positions } = (await placed.json()) as { positions: { id: string; number: string }[] };
  const one = positions.find((position) => position.number === '1')?.id ?? '';
  const shown = await page.request.put(`/api/tavole/${tavolaId}/sample`, {
    data: { positionId: one },
  });
  expect(shown.ok()).toBe(true);

  expect((await page.request.delete(`/api/positions/${one}`)).ok()).toBe(true);
  await page.reload();
  await expectTheSheetIsDrawn(drawing);

  const band = page.getByTestId('show-to-visitors');
  await expect(band.getByTestId('sample-ended')).toContainText('number 1');
  await expect(band.getByTestId('sample-ended')).toContainText('was removed');

  await band.getByRole('button', { name: 'Dismiss' }).click();
  await expect(band.getByTestId('sample-ended')).toBeHidden();
  await expect(band.getByRole('button', { name: 'Show to Visitors' })).toBeVisible();
});
