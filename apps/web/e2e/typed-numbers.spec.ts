import { expect, test, type Locator } from '@playwright/test';
import { markFor, openADrawingOfYourOwn } from './support/archive.js';
import { landed, PRACTICE, signInAs } from './support/gate.js';

/** The colour a circle's inside is painted, which is the disc a typed number sits on. */
function insideOf(mark: Locator): Promise<string> {
  return mark.evaluate((element) => getComputedStyle(element, '::before').backgroundColor);
}

/**
 * **Typed numbers** (issue #250): a drawing that stands upright while the factory printed its
 * numbers sideways to it. An Editor has every Mark's number typed upright for the whole Tavola,
 * every reader sees it, and it can be switched off again. The Scan is never touched.
 */
test('an Editor has every number typed upright, and a Member reads them so', async ({
  page,
}, info) => {
  await openADrawingOfYourOwn(page, `typed-${info.project.name}`);
  const tavolaId = page.url().split('/tavole/')[1]?.split('?')[0] ?? '';
  for (const [number, x, y] of [
    ['7', 0.3, 0.3],
    ['102', 0.6, 0.6],
  ] as const) {
    const placed = await page.request.post(`/api/tavole/${tavolaId}/marks`, {
      data: { number, x, y },
    });
    expect(placed.ok()).toBe(true);
  }
  await page.reload();

  // The factory print, and nothing said about typing, until an Editor chooses it.
  await expect(markFor(page, '7')).toHaveText('');
  await expect(page.getByTestId('typed-upright-by-the-club')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Type the numbers upright' }).check();

  await expect(markFor(page, '7')).toHaveText('7');
  await expect(markFor(page, '102')).toHaveText('102');
  await expect(markFor(page, '7')).toHaveAttribute('data-typed', 'true');
  // Typed, and not Illegible: the print can be read, it only runs the wrong way.
  await expect(markFor(page, '7')).toHaveAttribute('data-illegible', 'false');
  await expect(page.getByTestId('typed-upright-by-the-club')).toBeVisible();

  // A Mark's card keeps "typed by the club" for a print that cannot be read.
  await markFor(page, '7').click();
  await expect(page.getByTestId('part-reading')).not.toContainText('Number typed by the club');

  // While marking, the print shows through the discs to aim the ring at; solid again after.
  const solid = await insideOf(markFor(page, '102'));
  await page.getByRole('button', { name: 'Mark positions' }).click();
  await expect(page.getByTestId('drawing-marks')).toHaveAttribute('data-see-through', 'true');
  await expect.poll(() => insideOf(markFor(page, '102'))).not.toBe(solid);

  // A Member sees the same sheet the same way.
  await page.context().clearCookies();
  await signInAs(page, PRACTICE.member);
  await landed(page);
  await page.goto(`/tavole/${tavolaId}`);
  await expect(markFor(page, '102')).toHaveText('102');
  await expect(page.getByTestId('typed-upright-by-the-club')).toBeVisible();
  // And is not offered the switch: it is an Editor's.
  await expect(page.getByRole('checkbox', { name: 'Type the numbers upright' })).toHaveCount(0);
});

test('switched off again, every reader sees the factory print', async ({ page }, info) => {
  await openADrawingOfYourOwn(page, `untyped-${info.project.name}`);
  const tavolaId = page.url().split('/tavole/')[1]?.split('?')[0] ?? '';
  const placed = await page.request.post(`/api/tavole/${tavolaId}/marks`, {
    data: { number: '4', x: 0.4, y: 0.4 },
  });
  expect(placed.ok()).toBe(true);
  const typed = await page.request.put(`/api/tavole/${tavolaId}/typed-numbers`, {
    data: { typedNumbers: true },
  });
  expect(typed.ok()).toBe(true);
  await page.reload();
  await expect(markFor(page, '4')).toHaveText('4');

  await page.getByRole('checkbox', { name: 'Type the numbers upright' }).uncheck();

  await expect(markFor(page, '4')).toHaveText('');
  await expect(page.getByTestId('typed-upright-by-the-club')).toHaveCount(0);

  await page.context().clearCookies();
  await signInAs(page, PRACTICE.member);
  await landed(page);
  await page.goto(`/tavole/${tavolaId}`);
  await expect(markFor(page, '4')).toHaveText('');
});
