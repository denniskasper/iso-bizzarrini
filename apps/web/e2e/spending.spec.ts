import { expect, test } from '@playwright/test';
import { landed, PRACTICE, signIn, signInAs } from './support/gate.js';

/**
 * **Spending**, in a real browser (issue #189). The figures — this month, the split, the twelve
 * months, the limit and whether anything was billed — are proved at the API seam. What is here
 * is that an Administrator finds the page and reads its four parts as this suite's server has
 * them: the practice methods bill nothing, so the month would have cost and has no bar, and no
 * Monthly limit is known (`playwright.config.ts`).
 */
test('an Administrator reads this month, what it was for, the twelve months and the Console', async ({
  page,
}) => {
  await signIn(page);
  await page.getByTestId('spending-link').click();
  await expect(page.getByRole('heading', { name: 'Spending', level: 1 })).toBeVisible();
  await expect(page.getByText('estimates at list prices')).toBeVisible();

  const thisMonth = page.getByTestId('spending-this-month');
  await expect(thisMonth.getByTestId('spending-total')).toHaveText(/^\$\d+\.\d\d$/);
  await expect(thisMonth).toContainText('would have cost');
  await expect(thisMonth).toContainText('No Monthly limit is known');
  await expect(page.getByRole('meter')).toHaveCount(0);

  await expect(page.getByTestId('spending-split')).toContainText('Proposals’ conversations');

  const months = page.getByTestId('spending-months');
  await expect(months.getByRole('columnheader')).toHaveText([
    'Month',
    'Proposals’ conversations',
    'Total',
  ]);
  await expect(months.locator('tbody tr')).toHaveCount(12);

  await expect(page.getByTestId('spending-console')).toHaveAttribute(
    'href',
    'https://platform.claude.com/cost',
  );
  await page.screenshot({ path: test.info().outputPath('spending.png'), fullPage: true });
});

test('an Editor is not offered it', async ({ page }) => {
  await signInAs(page, PRACTICE.editor);
  await landed(page);

  await expect(page.getByTestId('spending-link')).toHaveCount(0);

  await page.goto('/spending');
  await expect(page.getByRole('heading', { name: /is the Club's to keep/ })).toBeVisible();
  await expect(page.getByTestId('spending-this-month')).toHaveCount(0);
});
