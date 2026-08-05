import { expect, test, type Page } from '@playwright/test';
import { signIn } from './support/gate.js';

/**
 * **The Club's annual membership list, loaded instead of typed** (ticket 16), in a real browser.
 *
 * Deliberately thin, like the rest of this seam — and thinner than it first was, on purpose. Every
 * rule about what an import may and may not do is proved at the API seam, where a request and a
 * response can prove it: that it never deletes, never shortens a term, never sends an invitation,
 * and refuses a date it cannot read one way only. Two tests here, because **each one costs a real
 * sign-in** and a sign-in is a scrypt hash the whole suite is queueing for; four of them made this
 * file flake on the mobile project and told nobody anything the two do not.
 *
 * What is left is what only a browser can show: that a file picked off a disk becomes a plan on the
 * screen and **nothing is written until it has been read**, and that what the plan promised is what
 * the roster then holds.
 *
 * The suite runs in parallel against one database it does not empty, so every file written here
 * names people nobody else's test has heard of.
 */

/** A file, as the Administrator's own spreadsheet saves one. */
function asUpload(csv: string) {
  return { name: 'roster.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') };
}

async function choose(page: Page, csv: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(asUpload(csv));
}

test.describe('loading the roster from a spreadsheet', () => {
  /**
   * The preview, and the row it could not read beside the one it can — which is the ordinary shape
   * of a real membership list. The unreadable row has to be findable without reading the other
   * ninety-nine, which is what the rule down its left edge is for.
   */
  test('says what the file will do, and writes nothing yet', async ({ page }) => {
    const email = `leggibile-${Date.now()}@example.invalid`;

    await signIn(page);
    await page.goto('/roster');
    await page.getByRole('link', { name: 'Load a spreadsheet' }).click();

    await expect(
      page.getByRole('heading', { name: 'Load the roster from a spreadsheet' }),
    ).toBeVisible();

    /*
     * **Built for a garage**, asserted here rather than in the sweep over the Administrator's
     * screens in `members.spec.ts`. What a cold hand presses to open the picker is the `<label>`;
     * the `<input>` behind it is visually hidden so that the label can operate it, and that sweep
     * deliberately does not measure hidden controls or captions.
     */
    const picker = page.getByText('Choose a file', { exact: true });
    expect(Math.round((await picker.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);

    await choose(
      page,
      [
        'Name,E-mail,Paid through',
        `Riga Leggibile,${email},2099-12-31`,
        'Riga Illeggibile,not an address at all,2099-12-31',
      ].join('\n'),
    );
    await page.getByRole('button', { name: 'Show me what this will do' }).click();

    // The readable row, with the address and the term it would grant.
    const arriving = page.locator('.import-row').filter({ hasText: email });
    await expect(arriving).toHaveAttribute('data-outcome', 'new-member');
    await expect(arriving).toContainText('2099-12-31');

    // And the one that could not be read: its line number as the Administrator's own spreadsheet
    // shows it, and why, in words they can act on.
    const refused = page.locator('.import-row[data-outcome="refused"]');
    await expect(refused).toHaveCount(1);
    await expect(refused).toContainText('3');
    await expect(refused).toContainText('not an e-mail address');

    // **The sentence that is the whole safety argument** — everybody the file does not mention,
    // and what becomes of them.
    await expect(page.getByText('An import never removes anybody')).toBeVisible();

    // Nothing has been written: the roster does not have them yet.
    await page.goto('/roster');
    await expect(page.locator('.roster-row').filter({ hasText: email })).toHaveCount(0);
  });

  test('records what the preview promised, and invites nobody', async ({ page }) => {
    const stamp = Date.now();
    const first = `arrivato-${stamp}@example.invalid`;
    const second = `arrivata-${stamp}@example.invalid`;

    await signIn(page);
    await page.goto('/roster/import');

    await choose(
      page,
      [
        'Name,E-mail,Paid through',
        `Primo Arrivato,${first},2099-12-31`,
        `Seconda Arrivata,${second},2099-06-30`,
      ].join('\n'),
    );
    await page.getByRole('button', { name: 'Show me what this will do' }).click();
    await page.getByRole('button', { name: 'Import 2 members' }).click();

    const said = page.getByTestId('roster-imported');
    await expect(said).toContainText('2 members recorded');
    // An import records people and invites nobody, and the screen has to say so — otherwise an
    // Administrator walks away believing a hundred letters went out.
    await expect(said).toContainText('still need inviting');

    await page.goto('/roster');
    for (const email of [first, second]) {
      const row = page.locator('.roster-row').filter({ hasText: email });
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute('data-standing', 'invited');
    }
  });
});
