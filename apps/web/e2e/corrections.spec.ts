import { expect, test, type Page } from '@playwright/test';
import { openADrawingOfYourOwn, placeMarks } from './support/archive.js';

/**
 * Correcting a Part, and correcting where it is listed.
 *
 * **What this seam can see that the API seam cannot** is that the correction *arrives* — that an
 * Editor who fixes a name under one number is looking at the fixed name under another a moment
 * later, on a screen a member reads. A Part is one thing (ADR 0001), and every request and
 * response in the archive can prove that about the database while a browser goes on showing what
 * it cached.
 *
 * The third test is the one that could not be written before this ticket at all. A Part whose
 * last Listing was removed is on no drawing, in no index and behind no circle — there was no
 * screen in the archive from which it could be seen, and it was still holding a Catalog Number
 * the archive refused to everybody who typed it.
 */

/**
 * Two numbers on a sheet of this test's own, placed the way an Editor places them.
 *
 * Every test here writes, and the suite runs its files in parallel and each of them twice — once
 * on a desktop and once on a phone — so a test that shared a drawing with another run would be
 * counting somebody else's circles.
 */
async function aSheetWithTwoNumbers(page: Page, named: string): Promise<void> {
  await openADrawingOfYourOwn(page, named);

  await page.getByRole('button', { name: 'Mark positions' }).click();
  await placeMarks(page, [
    { x: 0.3, y: 0.3 },
    { x: 0.7, y: 0.6 },
  ]);
  await page.getByRole('button', { name: 'Done' }).click();
}

/** Open the number's circle on the drawing, which is how a member gets to what sits at it. */
function circle(page: Page, number: string) {
  return page.locator(`[data-testid="drawing-mark"][data-position="${number}"]`);
}

async function recordAPart(
  page: Page,
  fields: { nameEn: string; catalogNumber?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Record a part here' }).click();
  await page.getByLabel('Name (English)').fill(fields.nameEn);
  if (fields.catalogNumber) {
    await page.getByLabel('Catalog number').fill(fields.catalogNumber);
  }
  await page.getByRole('button', { name: 'Record this part' }).click();
}

/**
 * **A correction reaches a member's screen.**
 *
 * The Part is listed at two numbers, corrected from one of them, and read at the other. Nothing
 * in a request or a response can say that: correcting a Part corrects it wherever it is listed,
 * and whether the *browser* knows that is a separate fact from whether the database does.
 */
test('a correction made at one number is read at another', async ({ page }, info) => {
  // Every sheet name in this suite is its own: a Tavola number is unique within a Model, so two
  // files reaching for one is a 409 in a helper rather than a failure anybody can read.
  const named = `correcting-${info.project.name}`;
  const part = `Throttle bracket ${info.project.name}`;

  await aSheetWithTwoNumbers(page, named);

  await circle(page, '1').click();
  await recordAPart(page, { nameEn: part });
  await expect(page.getByTestId('part-reading')).toContainText(part);

  // The same Part at the second number — **without re-describing it**, which is the path ticket
  // 06 had no way to reach for a Part carrying no Catalog Number to collide with.
  await circle(page, '2').click();
  await page.getByRole('button', { name: 'List a part the archive already has' }).click();
  await page.getByTestId('part-lookup').fill(part);
  await page.getByRole('button', { name: 'Find it' }).click();

  const found = page.getByTestId('found-part').filter({ hasText: part });
  await expect(found).toContainText('Listed on');
  await found.getByRole('button', { name: 'List it here' }).click();
  await expect(page.getByTestId('part-reading')).toContainText(part);

  // Corrected here, and the screen says how far that goes before anything is typed.
  await page.getByRole('button', { name: 'Correct the part' }).click();
  await expect(page.getByTestId('part-reach')).toContainText('one drawing');
  await expect(page.getByTestId('part-reach')).toContainText(`Tavola ${named}`);

  await page.getByLabel('Name (English)').fill(`${part}, late`);
  await page.getByLabel('Material and finish').fill('Steel, cadmium plated');
  await page.getByRole('button', { name: 'Correct this part' }).click();

  // And it has arrived at the other number, on the panel a member reads.
  await circle(page, '1').click();
  await expect(page.getByTestId('part-reading')).toContainText(`${part}, late`);
  await expect(page.getByTestId('part-reading')).toContainText('Steel, cadmium plated');
});

/**
 * **Where a Part sits, corrected — and the correction on the screen a moment later.**
 *
 * The narrow half of correcting: a count and a flag that are true of this drawing and of no
 * other. What only a browser can catch here is the re-reading. A Listing moved from one number to
 * another leaves a number it is no longer at, and a cache that re-read only the number the Editor
 * happened to be looking at would go on showing the Part at both — the archive contradicting
 * itself about where a component sits, which is the exact failure the drawn flag exists to avoid.
 */
test('a listing corrected where it sits leaves the number it was at', async ({ page }, info) => {
  const named = `where-${info.project.name}`;
  const part = `Bracket screw ${info.project.name}`;

  await aSheetWithTwoNumbers(page, named);

  await circle(page, '1').click();
  await recordAPart(page, { nameEn: part });
  await expect(page.getByTestId('part-reading')).toContainText(part);

  await page.getByRole('button', { name: 'Where it sits' }).click();
  await page.getByTestId('listing-quantity').fill('6');
  await page.getByTestId('listing-drawn').uncheck();
  await page.getByTestId('listing-position').selectOption({ label: '2' });
  await page.getByRole('button', { name: 'Correct where it sits' }).click();

  // The number it left has nothing at it, said in the words a member reads.
  await expect(page.getByTestId('part-reading')).toContainText(
    'Nothing is recorded at this position yet',
  );

  // And the number it arrived at has it, as a fixing needed as well rather than an alternative.
  await circle(page, '2').click();
  await expect(page.getByTestId('part-reading')).toContainText(part);
  await expect(page.getByTestId('part-reading')).toContainText('Also needed');
  await expect(page.locator('[data-testid="listed-part"]', { hasText: part })).toHaveAttribute(
    'data-drawn',
    'false',
  );
});

/**
 * **The identity rule holds wherever the number is typed** (ADR 0001).
 *
 * Entering a Catalog Number that is already recorded is refused when a Part is being described;
 * this asserts the same refusal when one is being corrected, which is a different screen and was
 * an obvious place for the rule to be missing.
 */
test('a catalog number corrected into one another part holds is refused', async ({
  page,
}, info) => {
  // Unique per project: chromium and the phone write to one archive, and the whole rule under
  // test is that this number exists in it exactly once.
  const suffix = info.project.name === 'mobile' ? '012' : '011';
  const held = `710 00 ${suffix}`;
  const mine = `710 00 ${info.project.name === 'mobile' ? '022' : '021'}`;
  const first = `Brake hose ${info.project.name}`;

  await aSheetWithTwoNumbers(page, `clashes-${info.project.name}`);

  await circle(page, '1').click();
  await recordAPart(page, { nameEn: first, catalogNumber: held });

  await circle(page, '2').click();
  await recordAPart(page, { nameEn: `Caliper ${info.project.name}`, catalogNumber: mine });

  await page.getByRole('button', { name: 'Correct the part' }).click();
  await page.getByLabel('Catalog number').fill(held);
  await page.getByRole('button', { name: 'Correct this part' }).click();

  const clash = page.getByTestId('catalog-number-clash');
  await expect(clash).toContainText('That number is already recorded');
  await expect(clash).toContainText(first);

  // **No merge offered here, deliberately**, and this is what distinguishes this refusal from
  // the one recording a Part gets: both parts already exist, and folding two of them into one is
  // an operation the archive does not have.
  await expect(clash.getByRole('button', { name: 'List that part here' })).toHaveCount(0);

  // Nothing was written: the number the Editor started with is the number the Part still has.
  await page.getByRole('button', { name: 'Cancel' }).first().click();
  await expect(page.getByTestId('part-reading')).toContainText(mine);
});

/**
 * **The phantom, found and removed.**
 *
 * Removing a Part's last Listing leaves a Part listed nowhere: invisible on every screen that
 * reads from a drawing, and still holding a Catalog Number the archive refuses to anybody who
 * types it. The lookup is the only thing in the archive that can see one, which is what turns an
 * unrecoverable state into an ordinary afternoon.
 */
test('a part listed nowhere is found and removed', async ({ page }, info) => {
  const number = `720 00 ${info.project.name === 'mobile' ? '002' : '001'}`;
  const orphan = `Orphan bracket ${info.project.name}`;

  await aSheetWithTwoNumbers(page, `orphans-${info.project.name}`);

  await circle(page, '1').click();
  await recordAPart(page, { nameEn: orphan, catalogNumber: number });
  await expect(page.getByTestId('listed-row')).toHaveCount(1);

  // Taking it off this number leaves the Part behind — which is the right behaviour and
  // exactly how a Part ends up reachable from nothing.
  await page.getByRole('button', { name: 'Remove from this position' }).click();
  await expect(page.getByTestId('listed-row')).toHaveCount(0);
  await expect(page.getByTestId('part-reading')).not.toContainText(orphan);

  await page.getByRole('button', { name: 'List a part the archive already has' }).click();
  // By its number, with the spacing the catalog prints taken out of it — because the number in
  // somebody's hand is stamped on a bracket, not typeset.
  await page.getByTestId('part-lookup').fill(number.replaceAll(' ', ''));
  await page.getByRole('button', { name: 'Find it' }).click();

  const found = page.getByTestId('found-part').filter({ hasText: orphan });
  await expect(found).toContainText('Listed on no drawing');

  await found.getByRole('button', { name: 'Correct it' }).click();
  await expect(page.getByTestId('part-reach')).toContainText('listed on no drawing');

  await page.getByRole('button', { name: 'Remove this part' }).click();
  await page.getByRole('button', { name: 'Yes, remove it' }).click();

  // Gone, and the archive no longer knows the number — which is what makes it typeable again.
  await page.getByRole('button', { name: 'List a part the archive already has' }).click();
  await page.getByTestId('part-lookup').fill(number);
  await page.getByRole('button', { name: 'Find it' }).click();
  await expect(page.getByText('Nothing in the archive matches that.')).toBeVisible();
});
