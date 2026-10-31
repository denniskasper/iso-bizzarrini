import type { RosterResponse } from '@ricambi/contracts';
import { expect, test } from '@playwright/test';
import { openGrifo } from './support/archive.js';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * **Proposing a Fix from a Tavola's page** (issues #152 and #153), in a real browser, against the
 * fake conversation, which answers everybody the same way and finishes every Fix alike. Who may
 * propose, what a Draft records, who is shown it and how its status may move are proved at the
 * API seam; this is the panel beside the page, an answer arriving in it, the finished Proposal
 * handed over, and its author seeing it Taken up.
 */
test('somebody let propose starts a Fix from a Tavola’s page, hands it over, and sees it taken up', async ({
  page,
  browser,
}) => {
  // An Administrator lets the practice Editor propose. Granting what is already granted changes
  // nothing, so both projects can do it on the one server.
  await signIn(page);
  const roster = (await (await page.request.get('/api/roster')).json()) as RosterResponse;
  // The Administrator lets themselves too: deciding about a Proposal means reading it first.
  for (const email of [PRACTICE.editor, PRACTICE.administrator]) {
    const member = roster.members.find((entry) => entry.email === email);
    expect(member).toBeDefined();
    const granted = await page.request.patch(`/api/roster/${member?.id}`, {
      data: { mayPropose: true },
    });
    expect(granted.ok()).toBe(true);
  }

  const context = await browser.newContext();
  const proposer = await context.newPage();
  await signInAs(proposer, PRACTICE.editor);
  await landed(proposer);

  await openGrifo(proposer);
  await proposer.getByTestId('tavola-plate').first().click();
  await expect(proposer.getByRole('heading', { level: 1 })).toBeVisible();

  await proposer.getByTestId('propose').click();
  const panel = proposer.getByTestId('proposal-panel');
  await expect(panel.getByText('What do you bring?')).toBeVisible();
  await panel.getByRole('button', { name: 'Fix Something is wrong.' }).click();

  // What was on screen is attached without typing it, beside the line about names.
  const attached = panel.getByTestId('proposal-context');
  await expect(attached).toContainText('A Fix, from');
  await expect(attached).toContainText('Tavola');
  await expect(attached).toContainText('Iso Grifo');
  await expect(attached).toContainText('/tavole/');
  await expect(panel.getByTestId('no-names')).toContainText('Please do not name members');
  await expect(panel.getByText('What went wrong?')).toBeVisible();

  await panel.getByLabel('Your answer').fill('The numbers on this sheet are hard to read.');
  await panel.getByRole('button', { name: 'Send' }).click();

  const conversation = panel.getByTestId('conversation');
  await expect(conversation).toContainText('The numbers on this sheet are hard to read.');
  await expect(conversation).toContainText('This is the practice conversation');
  await expect(panel.getByRole('button', { name: 'Send' })).toBeVisible();

  // Closed and opened again, the Draft is there to carry on.
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
  await proposer.getByTestId('propose').click();
  const drafts = panel.getByTestId('drafts');
  await drafts.getByText('The numbers on this sheet are hard to read.').first().click();
  await expect(panel.getByTestId('conversation')).toContainText(
    'This is the practice conversation',
  );

  // Finished: the summary in the shape of a Fix, the author's own words kept as written.
  await panel.getByRole('button', { name: 'Finish' }).click();
  const finished = panel.getByTestId('finished-proposal');
  await expect(finished).toContainText('A practice Fix');
  await expect(finished).toContainText('What was expected');
  await expect(finished).toContainText('The numbers on this sheet are hard to read.');

  await panel.getByRole('button', { name: 'Hand over' }).click();
  const handedOver = panel.getByTestId('handed-over');
  await expect(handedOver).toContainText('It is New');
  const address = await handedOver
    .getByRole('link', { name: 'Follow it on Proposals' })
    .getAttribute('href');
  expect(address).toMatch(/^\/proposals\//);

  // An Administrator takes it up from its own page.
  await page.goto(address ?? '');
  await expect(page.getByTestId('proposal-status')).toHaveText('New');
  await page.getByRole('button', { name: 'Take up' }).click();
  await expect(page.getByTestId('proposal-status')).toHaveText('Taken up');

  // Its author sees what became of it.
  await proposer.goto(address ?? '');
  await expect(proposer.getByTestId('proposal-status')).toHaveText('Taken up');
  await expect(proposer.getByRole('heading', { level: 1 })).toHaveText('A practice Fix');

  await context.close();
});
