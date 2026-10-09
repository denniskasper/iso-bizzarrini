import { expect, test, type Locator, type Page } from '@playwright/test';
import { borrowAnImage, openADrawingOfYourOwn } from './support/archive.js';
import { landed, MEMBER_PASSWORD, PRACTICE, signInAs } from './support/gate.js';

/**
 * Contributions — **what a member knows, sent from where they are standing** (stories 83–91).
 *
 * The API seam proves the rule this all rests on: that nobody else is shown a Contribution until
 * it has been checked, at any address. What only a browser can say is whether a member can
 * actually *do* it — find the way in at a number with nothing recorded, write, attach a picture,
 * and see afterwards that it arrived and is waiting rather than wondering and sending it twice.
 *
 * Publishing is an Editor's and arrives with issue #6, so what a published Contribution looks
 * like to the rest of the Club is not driven here: there is no screen yet that publishes one.
 */

function reading(page: Page): Locator {
  return page.getByTestId('part-reading');
}

/** In as somebody else, in the same browser — a plain Member, who may read and may contribute. */
async function becomeAMember(page: Page): Promise<void> {
  await page.context().clearCookies();
  await signInAs(page, PRACTICE.member);
  await landed(page);
}

/**
 * A sheet of this test's own with one number on it and nothing recorded there, read by a Member.
 * The sheet is an Administrator's to make; everything after this line is the Member's.
 */
async function openAnEmptyNumberAsAMember(page: Page, named: string): Promise<string> {
  await openADrawingOfYourOwn(page, named);
  const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  await page.request.post(`/api/tavole/${tavolaId}/positions`, { data: { number: '14' } });

  await becomeAMember(page);
  await page.goto(`/tavole/${tavolaId}?position=14`);
  await expect(reading(page).getByTestId('selected-position')).toHaveText('14');
  return tavolaId;
}

test.describe('a member who knows something', () => {
  /**
   * **The gap and the way to fill it are on the same screen** (story 84). The archive says
   * plainly that nothing is recorded at this number, and the very next thing is how to say what
   * is — written, sent, and then still there, marked as waiting.
   */
  test('writes about a number nothing is recorded at, and sees that it is waiting', async ({
    page,
  }, info) => {
    await openAnEmptyNumberAsAMember(page, `knows-${info.project.name}`);

    await expect(reading(page)).toContainText('Nothing is recorded at this position yet');
    await reading(page)
      .getByRole('button', { name: 'Add what you know about this position' })
      .click();

    const form = reading(page).getByTestId('contribution-form');
    await form
      .getByLabel('What you know about position 14')
      .fill('This is the dust shield.\nMine is stamped 7.02.114 on the back.');
    await form.getByRole('button', { name: 'Send to the Editors' }).click();

    const sent = reading(page).getByTestId('contribution');
    await expect(sent).toHaveCount(1);
    await expect(sent).toHaveAttribute('data-state', 'waiting');
    await expect(sent).toContainText('Waiting to be checked');
    await expect(sent).toContainText('Mine is stamped 7.02.114 on the back.');
    // The form has gone and the way to write another is back: one arrived, and it shows.
    await expect(form).toHaveCount(0);

    // Still there on coming back to the number, which is how a member knows not to send it again.
    await page.reload();
    await expect(reading(page).getByTestId('contribution')).toContainText('the dust shield');
  });

  /**
   * **Showing rather than describing** (story 85): the picture is chosen in the form, seen before
   * it goes, and is with the words afterwards — rendered, not merely requested, because it is
   * behind the gate and a refused image is "visible" too.
   */
  test('attaches a photograph, sees it before sending and with what they wrote after', async ({
    page,
  }, info) => {
    await openAnEmptyNumberAsAMember(page, `shows-${info.project.name}`);
    const picture = await borrowAnImage(page);

    await reading(page)
      .getByRole('button', { name: 'Add what you know about this position' })
      .click();
    const form = reading(page).getByTestId('contribution-form');
    await form.getByLabel('What you know about position 14').fill('Here is mine, off the car.');

    // Both ways in are offered, and the camera is one of them: it asks the phone for its rear
    // lens rather than sending the member off to another app.
    await expect(form.getByText('Take a photograph')).toBeVisible();
    await expect(form.getByTestId('contribution-camera')).toHaveAttribute('capture', 'environment');

    await form
      .getByTestId('contribution-gallery')
      .setInputFiles({ name: 'dust-shield.webp', mimeType: 'image/webp', buffer: picture });
    // Seen before it goes, and really seen: a member who has just taken a picture in a dim
    // garage is checking whether it is the part or their thumb.
    const chosen = form.getByTestId('chosen-photographs').getByRole('img');
    await expect(chosen).toHaveCount(1);
    await expect
      .poll(() => chosen.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    await form.getByRole('button', { name: 'Send to the Editors' }).click();

    const sent = reading(page).getByTestId('contribution');
    await expect(sent.getByTestId('photograph')).toHaveCount(1);
    const shown = sent.getByTestId('photograph').locator('img');
    await expect
      .poll(() => shown.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
  });

  /**
   * **Nobody else is shown it** — proved address by address at the API, and proved here once on
   * the screen it would actually appear on: the Editor opens the same number and reads nothing
   * from members at all.
   */
  test('is the only one who can see it while it waits', async ({ page }, info) => {
    const tavolaId = await openAnEmptyNumberAsAMember(page, `private-${info.project.name}`);

    await reading(page)
      .getByRole('button', { name: 'Add what you know about this position' })
      .click();
    const form = reading(page).getByTestId('contribution-form');
    await form.getByLabel('What you know about position 14').fill('Only I should see this yet.');
    await form.getByRole('button', { name: 'Send to the Editors' }).click();
    await expect(reading(page).getByTestId('contribution')).toHaveCount(1);

    await page.context().clearCookies();
    await signInAs(page, PRACTICE.editor);
    await landed(page);
    await page.goto(`/tavole/${tavolaId}?position=14`);

    await expect(reading(page)).toContainText('Nothing is recorded at this position yet');
    await expect(reading(page).getByTestId('contribution')).toHaveCount(0);
  });
});

test.describe('a browser two members share', () => {
  /**
   * **The workshop computer.** One member writes, signs out, and the next signs in at the same
   * tab without anything being reloaded — which is the one way a waiting Contribution could
   * reach somebody else with the API never having sent it to them: out of this browser's own
   * memory. The rule holds there too.
   */
  test('does not show the next person what the last one is waiting on', async ({ page }, info) => {
    await openAnEmptyNumberAsAMember(page, `shared-${info.project.name}`);

    await reading(page)
      .getByRole('button', { name: 'Add what you know about this position' })
      .click();
    const form = reading(page).getByTestId('contribution-form');
    await form.getByLabel('What you know about position 14').fill('Left on a shared computer.');
    await form.getByRole('button', { name: 'Send to the Editors' }).click();
    await expect(reading(page).getByTestId('contribution')).toHaveCount(1);

    // Out and in again through the screens, so the page — and whatever it remembers — stays.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('link', { name: 'Sign in' }).first().click();
    await page.getByLabel('E-mail address').fill(PRACTICE.editor);
    await page.getByLabel('Password').fill(MEMBER_PASSWORD);

    // Held back until asserted on, so that what is on screen is what the browser remembered
    // and not what the archive has since answered.
    await page.route('**/api/positions/*/contributions', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(reading(page).getByTestId('selected-position')).toHaveText('14');
    // **Asked once and not waited for.** An assertion that retried would wait the remembered
    // answer out and pass — which is exactly how this was missed the first time.
    expect(await reading(page).getByTestId('contribution').count()).toBe(0);
    await expect(reading(page)).toContainText('Nothing is recorded at this position yet');
    await expect(reading(page).getByTestId('contribution')).toHaveCount(0);
  });
});

test.describe('a member reading a part', () => {
  /**
   * **The same mechanism, with one more word** (story 90). There is no form of fields to
   * propose: the member says what is wrong, and it waits for an Editor like anything else.
   */
  test('can say its record is wrong, and what they said waits like any other', async ({
    page,
  }, info) => {
    await openADrawingOfYourOwn(page, `wrong-${info.project.name}`);
    const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
    const sheet = (await (
      await page.request.post(`/api/tavole/${tavolaId}/positions`, { data: { number: '3' } })
    ).json()) as { positions: { id: string; number: string }[] };
    await page.request.post(`/api/tavole/${tavolaId}/listings`, {
      data: {
        positionId: sheet.positions.find((position) => position.number === '3')?.id,
        drawn: true,
        part: {
          nameEn: `Brake hose ${info.project.name}`,
          nameIt: '',
          catalogNumber: '',
          disegnoOrigine: '',
          description: '',
          dimensions: '',
          materialFinish: '',
          catalogNote: '',
          note: '',
        },
      },
    });

    await becomeAMember(page);
    await page.goto(`/tavole/${tavolaId}?position=3`);

    const hose = page.getByTestId('listed-part');
    await hose.getByRole('button', { name: 'Report something wrong' }).click();
    await hose
      .getByLabel(`What is wrong with Brake hose ${info.project.name}`)
      .fill('This is the rear hose. The front one is 40 mm longer.');
    await hose.getByRole('button', { name: 'Send to the Editors' }).click();

    const sent = hose.getByTestId('contribution');
    await expect(sent).toContainText('Says the record is wrong');
    await expect(sent).toContainText('Waiting to be checked');
  });
});
