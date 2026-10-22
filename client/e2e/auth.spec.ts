import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';

test.describe('signing in', () => {
  test('a wrong password is refused with a message, and the visitor stays on sign-in', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[autocomplete=email]', ACCOUNTS.client);
    await page.fill('input[type=password]', 'not-the-password');
    await page.click('button[type=submit]');
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('an empty form is not sent', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type=submit]');
    await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('a signed-out visitor who opens a private page is sent to sign in', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page).toHaveURL(/\/login/);
  });

  for (const [role, email, landmark] of [
    ['client', ACCOUNTS.client, 'Find workers'],
    ['worker', ACCOUNTS.worker, 'Wallet'],
    ['admin', ACCOUNTS.admin, 'Gig approvals'],
  ] as const) {
    test(`a ${role} lands on their own dashboard`, async ({ page, isMobile }) => {
      await signIn(page, email);
      // On a phone the navigation is a drawer behind the menu button.
      if (isMobile) await page.locator('header button').first().click();
      await expect(page.getByRole('menuitem', { name: landmark })).toBeVisible();
    });
  }
});

test('the language choice is kept after a reload', async ({ page }) => {
  await page.goto('/login');
  await page.getByText('RW', { exact: true }).click();
  await expect(page.locator('button[type=submit]')).toHaveText(/Injira/);
  await page.reload();
  await expect(page.locator('button[type=submit]')).toHaveText(/Injira/);
  // Back to English for the next test.
  await page.getByText('EN', { exact: true }).click();
});
