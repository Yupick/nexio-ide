import { test, expect } from '@playwright/test';

const ideShellUrl = 'file:///home/mkd/Programacion/nexioIde/src/ui/index.html';

test('app loads the main workspace shell', async ({ page }) => {
  await page.goto(ideShellUrl);

  await expect(page).toHaveTitle(/Nexio IDE/i);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('body')).toContainText('Nexio IDE');
  await expect(page.getByText('Editor de escritorio')).toBeVisible();
  await expect(page.getByText('Agente de ideas')).toBeVisible();
});

test('workspace shell exposes the core approval and planning panels', async ({ page }) => {
  await page.goto(ideShellUrl);

  await expect(page.getByText('Workspace', { exact: true })).toBeVisible();
  await expect(page.getByText('Operación en tiempo real')).toBeVisible();
  await expect(page.getByText('Resumen del cambio')).toBeVisible();
  await expect(page.locator('#workflow-phase-label')).toContainText('Ideas');
  await expect(page.getByText('Agente de ideas')).toBeVisible();
});

test('approval workflow shows a diff preview and allows accept or reject actions', async ({ page }) => {
  await page.goto(ideShellUrl);

  const approveButton = page.getByRole('button', { name: 'Aplicar cambios' });
  const rejectButton = page.getByRole('button', { name: 'Descartar cambios' });

  await expect(approveButton).toBeVisible();
  await expect(rejectButton).toBeVisible();
  await expect(approveButton).toBeDisabled();
  await expect(rejectButton).toBeDisabled();
  await expect(page.locator('#approval-status')).toContainText('Sin cambio estructurado aplicable');
});
