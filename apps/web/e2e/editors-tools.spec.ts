import { expect, test, type Page } from '@playwright/test';
import { expectTheSheetIsDrawn, drawingOf, openGrifo } from './support/archive.js';
import { landed, PRACTICE, signInAs } from './support/gate.js';

/**
 * **Changing what the archive says is an Editor's** (GLOSSARY, issues #219–#221). The API
 * refuses a Member every write in the archive, and `authorisation.test.ts` proves it; what only a
 * browser can show is that a Member is not offered the forms that would be refused, and that an
 * Editor still is.
 */

/**
 * The catalog, the Grifo and its first Tavola, expecting the Editor's tool on each to be there or
 * not. Matches the scan control in either wording, so it holds on a Tavola without a Scan too.
 */
async function expectEditorsTools(page: Page, offered: boolean): Promise<void> {
  const count = offered ? 1 : 0;

  await expect(page.getByRole('button', { name: 'Add a car' })).toHaveCount(count);

  await openGrifo(page);
  await expect(page.getByRole('button', { name: 'Add a drawing' })).toHaveCount(count);

  await page.getByTestId('tavola-plate').first().click();
  await expectTheSheetIsDrawn(drawingOf(page));
  await expect(page.getByText(/^Choose a (new )?scan$/)).toHaveCount(count);
  // The marking tool, and with it removing numbers one at a time or several at once (#240).
  await expect(page.getByRole('button', { name: 'Mark positions' })).toHaveCount(count);
}

test('a Member reads the archive without being offered an Editor’s tools', async ({ page }) => {
  await signInAs(page, PRACTICE.member);
  await landed(page);

  await expectEditorsTools(page, false);
});

test('an Editor is offered a car, a drawing and a new scan', async ({ page }) => {
  await signInAs(page, PRACTICE.editor);
  await landed(page);

  await expectEditorsTools(page, true);
});
