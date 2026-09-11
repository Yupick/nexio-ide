import { test, expect } from '@playwright/test';

const ideShellUrl = 'file:///home/mkd/Programacion/nexioIde/src/ui/index.html';

test('app loads the main workspace shell', async ({ page }) => {
  await page.goto(ideShellUrl);

  await expect(page).toHaveTitle(/Nexio IDE/i);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('body')).toContainText('Nexio IDE');
  await expect(page.locator('text=Monaco Workspace')).toBeVisible();
  await expect(page.locator('text=AI Console')).toBeVisible();
});

test('workspace shell exposes the core approval and planning panels', async ({ page }) => {
  await page.goto(ideShellUrl);

  await expect(page.locator('.badge')).toContainText('Workspace');
  await expect(page.getByRole('heading', { name: 'Monaco Workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI Console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Roadmap' })).toBeVisible();
  await expect(page.getByText('Execution')).toBeVisible();
  await expect(page.getByText('Ideas')).toBeVisible();
});

test('approval workflow shows a diff preview and allows accept or reject actions', async ({ page }) => {
  await page.goto(ideShellUrl);

  await expect(page.getByRole('button', { name: 'Approve diff' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reject diff' })).toBeVisible();
  await expect(page.locator('#approval-status')).toContainText('Awaiting review');

  await page.getByRole('button', { name: 'Approve diff' }).click();
  await expect(page.locator('#approval-status')).toContainText('Approved');

  await page.getByRole('button', { name: 'Reject diff' }).click();
  await expect(page.locator('#approval-status')).toContainText('Rejected');
});
