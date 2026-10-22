import { expect, test } from '@playwright/test';
import { ACCOUNTS, confirmDialog, postApprovedGig, sessionFor, unique } from './helpers';

/**
 * The core journey, through the real screens, as two people at once:
 * a worker applies, the client chooses them, the worker confirms and says the
 * work is finished, and the client marks it done and pays with Mobile Money
 * (the simulated provider), getting a receipt.
 */
test('apply, choose, confirm, finish, mark done, pay, receipt', async ({ browser }, testInfo) => {
  const device = testInfo.project.use;
  const title = unique('E2E salon pages', testInfo.project.name);
  const gig = await postApprovedGig({ title });

  const worker = await sessionFor(browser, ACCOUNTS.worker, device);
  const client = await sessionFor(browser, ACCOUNTS.client, device);

  // The worker applies from the gig's page.
  await worker.page.goto(`/gigs/${gig.id}`);
  await worker.page.getByRole('button', { name: 'Apply to this gig' }).click();
  await confirmDialog(worker.page, 'Send application');
  await expect(worker.page.getByText('Application sent.')).toBeVisible();

  // The client chooses them, from the applicant's actions.
  await client.page.goto(`/gigs/${gig.id}`);
  await client.page.getByRole('button', { name: 'More actions' }).first().click();
  await client.page.getByRole('menuitem', { name: 'Approve' }).click();
  await confirmDialog(client.page, 'Approve');

  // The worker confirms, then says the work is finished.
  await worker.page.goto('/marketplace?tab=matches');
  const workerCard = worker.page.locator('.ant-card').filter({ hasText: title }).first();
  await workerCard.getByRole('button', { name: 'Confirm' }).click();
  await workerCard.getByRole('button', { name: "I've finished" }).click();
  await confirmDialog(worker.page, "I've finished");
  await expect(workerCard.getByText(/You told .* the work is finished/)).toBeVisible();

  // The client sees it, marks the job done, and pays.
  await client.page.goto('/marketplace?tab=matches');
  const clientCard = client.page.locator('.ant-card').filter({ hasText: title }).first();
  await expect(clientCard.getByText(/says the work is finished/)).toBeVisible();
  await clientCard.getByRole('button', { name: 'Mark job as done' }).click();
  await confirmDialog(client.page, 'Mark job as done');
  await clientCard.locator('input[inputmode=tel]').fill('788123456');
  await clientCard.getByRole('button', { name: /^Pay / }).click();
  await clientCard.getByRole('button', { name: 'Approve (simulated phone)' }).click();
  await expect(client.page.getByText(/Payment confirmed/)).toBeVisible();

  // Paid, with a receipt anyone can check.
  const paidCard = client.page.locator('.ant-card').filter({ hasText: title }).first();
  await expect(paidCard.getByText('Paid', { exact: true })).toBeVisible();
  const receipt = paidCard.getByRole('link', { name: /View receipt/ });
  await receipt.click();
  await expect(client.page.getByText('Payment receipt')).toBeVisible();
  await expect(client.page.getByText(title)).toBeVisible();

  await worker.context.close();
  await client.context.close();
});
