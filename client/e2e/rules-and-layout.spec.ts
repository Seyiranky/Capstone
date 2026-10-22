import { expect, test } from '@playwright/test';
import { ACCOUNTS, postApprovedGig, signIn, unique } from './helpers';

test('a worker who does not meet a sensitive gig\'s rules is told what is missing, and cannot apply', async ({ page }, testInfo) => {
  // A gig the client marked sensitive (children, inside a home) needs a reviewed
  // skill in the trade, a confirmed phone and a record; the demo worker has no
  // confirmed phone.
  const gig = await postApprovedGig({ title: unique('E2E tutoring for my daughter', testInfo.project.name), sensitive: true });
  await signIn(page, ACCOUNTS.worker);
  await page.goto(`/gigs/${gig.id}`);
  await expect(page.getByText('This job needs a stronger record')).toBeVisible();
  // Each missing requirement is named, with where to fix it.
  await expect(page.getByText('A confirmed phone number.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Confirm your phone' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply to this gig' })).toHaveCount(0);
});

test('posting a gig with nothing filled in shows what is required', async ({ page }) => {
  await signIn(page, ACCOUNTS.client);
  await page.goto('/marketplace');
  await page.getByRole('button', { name: 'Post a gig' }).click();
  const drawer = page.locator('.ant-drawer:visible');
  await drawer.locator('button[type=submit]').click();
  await expect(drawer.locator('.ant-form-item-explain-error').first()).toBeVisible();
});

/** Every page fits the screen it is shown on: nothing scrolls sideways. */
for (const [label, path, who] of [
  ['sign-in', '/login', null],
  ['privacy', '/privacy', null],
  ['client dashboard', '/dashboard', ACCOUNTS.client],
  ['marketplace', '/marketplace', ACCOUNTS.worker],
  ['your matches', '/marketplace?tab=matches', ACCOUNTS.client],
  ['help centre', '/support', ACCOUNTS.worker],
] as const) {
  test(`the ${label} page fits the screen`, async ({ page }) => {
    if (who) await signIn(page, who);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
