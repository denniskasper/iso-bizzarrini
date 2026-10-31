import { expect, test, type Locator, type Page } from '@playwright/test';
import { borrowAnImage, forThisAttempt, openADrawingOfYourOwn } from './support/archive.js';
import { landed, PRACTICE, signInAs } from './support/gate.js';

/**
 * Deciding Contributions — **an Editor working through what members have sent** (stories 115–120).
 *
 * The API seam proves the rules: oldest first, published to everybody, discarded to nobody, a
 * picture moved and a gap filled. What only a browser can say is whether an Editor *notices*
 * that something is waiting, and whether the screen it leads to lets them do the whole job in
 * one sitting — read what the member wrote beside what the archive says, put the knowledge in
 * the record, and decide.
 *
 * This suite shares its archive with every other file running beside it, so the queue here is
 * never this test's alone. Each test writes about a sheet of its own and opens its own line.
 */

async function become(page: Page, who: string): Promise<void> {
  await page.context().clearCookies();
  await signInAs(page, who);
  await landed(page);
}

/**
 * A sheet of this test's own with number 14 on it and nothing recorded there, and a Member who
 * has written about it — with a photograph when asked. Arranged over the API as that Member:
 * writing one is `contributions.spec.ts`'s to drive, and this file starts where that one stops.
 */
async function aMemberHasWritten(
  page: Page,
  named: string,
  written: { text: string; photograph?: boolean },
): Promise<string> {
  await openADrawingOfYourOwn(page, named);
  const tavolaId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const sheet = (await (
    await page.request.post(`/api/tavole/${tavolaId}/positions`, { data: { number: '14' } })
  ).json()) as { positions: { id: string; number: string }[] };
  const positionId = sheet.positions.find((position) => position.number === '14')?.id;
  const picture = written.photograph ? await borrowAnImage(page) : null;

  await become(page, PRACTICE.member);
  const sent = (await (
    await page.request.post(`/api/positions/${positionId}/contributions`, {
      data: { text: written.text },
    })
  ).json()) as { contribution: { id: string } };
  if (picture) {
    await page.request.post(`/api/contributions/${sent.contribution.id}/photographs`, {
      headers: { 'Content-Type': 'image/webp' },
      data: picture,
    });
  }
  return tavolaId;
}

/** The Contribution about this test's own sheet, on the screen and ready to be decided. */
async function openTheOneAbout(page: Page, named: string): Promise<Locator> {
  await page.getByTestId('review-link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Waiting to be checked');
  await expect(page.getByTestId('queue-summary')).toBeVisible();

  // Other files' members are waiting too, and the oldest of all of them is what opens first.
  const line = page.getByTestId('queue-line').filter({ hasText: `Tavola ${named},` });
  if ((await line.count()) > 0) {
    await line.click();
  }

  const reviewing = page.getByTestId('reviewing');
  await expect(reviewing.getByTestId('record-now')).toContainText(`Tavola ${named}`);
  return reviewing;
}

test.describe('an Editor with something waiting', () => {
  /**
   * **The whole job, in one sitting** — which is the point of the screen. The member said what
   * sits at an empty number and showed it; by the end the number has a Part, the Part has the
   * picture, and the member's words are published under it with their name.
   */
  test('is told so in the chrome, fills the gap from what the member wrote, and publishes it', async ({
    page,
  }, info) => {
    const named = forThisAttempt(`review-${info.project.name}`);
    const tavolaId = await aMemberHasWritten(page, named, {
      text: 'This is the dust shield.\nMine is stamped on the back.',
      photograph: true,
    });

    await become(page, PRACTICE.editor);
    // Noticed without being looked for: the number is in the chrome of the first screen they see.
    await expect(page.getByTestId('waiting-count')).toBeVisible();

    const reviewing = await openTheOneAbout(page, named);
    await expect(reviewing.getByTestId('contribution-text')).toContainText(
      'Mine is stamped on the back.',
    );
    // Beside what the archive says about it now, which is nothing.
    await expect(reviewing.getByTestId('record-now')).toContainText(
      'Nothing is recorded at this position',
    );
    // And the picture is really shown to the Editor checking it, not merely asked for.
    const theirs = reviewing.getByTestId('contribution-photographs').locator('img');
    await expect
      .poll(() => theirs.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    // The gap, filled by the person who knew (story 120).
    await reviewing.getByRole('button', { name: 'Record the part from this' }).click();
    const form = reviewing.getByTestId('record-from-contribution');
    await form.getByLabel('Name (English)').fill(`Dust shield ${named}`);
    await form.getByRole('button', { name: 'Record this part at 14' }).click();

    const record = reviewing.getByTestId('record-now');
    await expect(record.getByRole('heading', { name: `Dust shield ${named}` })).toBeVisible();

    // The picture, moved onto the Part (story 119): gone from what was sent, there on the record.
    await reviewing.getByRole('button', { name: 'Move it onto the part' }).click();
    await expect(record.getByTestId('photograph')).toHaveCount(1);
    await expect(reviewing.getByTestId('contribution-photographs')).toHaveCount(0);

    // Corrected directly while reviewing (story 118), with the archive's own form.
    await record.getByRole('button', { name: 'Correct this part' }).click();
    await record.getByLabel("The club's note").fill('Identified by a member from their own car.');
    await record.getByRole('button', { name: 'Correct this part' }).last().click();
    await expect(record).toContainText('Identified by a member from their own car.');

    await reviewing.getByRole('button', { name: 'Publish', exact: true }).click();
    // Decided, so it is no longer anything this screen offers.
    await expect(page.getByText(`Dust shield ${named}`)).toHaveCount(0);

    // And every member now reads the Part at the number, with what was said and who said it.
    await become(page, PRACTICE.member);
    await page.goto(`/tavole/${tavolaId}?position=14`);
    const part = page.getByTestId('listed-part');
    await expect(part).toContainText(`Dust shield ${named}`);
    await expect(part.getByTestId('photographs').getByTestId('photograph')).toHaveCount(1);
    const published = part.getByTestId('contribution');
    await expect(published).toHaveAttribute('data-state', 'published');
    await expect(published).toContainText('This is the dust shield.');
  });

  /** Discarding asks twice, because nobody can take it back and its author is never told. */
  test('discards one only after being asked again, and then nobody reads it', async ({
    page,
  }, info) => {
    const named = forThisAttempt(`discard-${info.project.name}`);
    const tavolaId = await aMemberHasWritten(page, named, { text: 'Cheap parts at my shop.' });

    await become(page, PRACTICE.editor);
    const reviewing = await openTheOneAbout(page, named);

    await reviewing.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(reviewing.getByTestId('decision')).toContainText('cannot be brought back');
    await reviewing.getByRole('button', { name: 'Yes, discard it' }).click();

    await expect(
      page.getByTestId('queue-line').filter({ hasText: `Tavola ${named},` }),
    ).toHaveCount(0);

    await become(page, PRACTICE.member);
    await page.goto(`/tavole/${tavolaId}?position=14`);
    await expect(page.getByTestId('part-reading')).toContainText(
      'Nothing is recorded at this position yet',
    );
    await expect(page.getByTestId('part-reading').getByTestId('contribution')).toHaveCount(0);
  });
});

test.describe('a member who is not an Editor', () => {
  test('is offered no queue, and is told whose job it is if they find the address', async ({
    page,
  }) => {
    await signInAs(page, PRACTICE.member);
    await landed(page);

    await expect(page.getByTestId('review-link')).toHaveCount(0);

    await page.goto('/review');
    await expect(page.getByText('is an Editor’s job')).toBeVisible();
    await expect(page.getByTestId('reviewing')).toHaveCount(0);
  });
});
