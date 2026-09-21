import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron as electron } from 'playwright';
import { test, expect } from '@playwright/test';
import { createProjectSnapshot } from '../../src/backend/project-snapshot';
import { createProjectSnapshotHash } from '../../src/backend/snapshot-hash';
import { PlanStore } from '../../src/backend/plan-store';
import type { PlanRun } from '../../src/shared/types';

test('opens Electron with preload and runs a persisted plan by planId using the local provider', async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-electron-workspace-'));
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), '# Electron workflow\n', 'utf8');
  fs.mkdirSync(path.join(workspaceRoot, '.nexio'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, '.nexio', 'workflow-history.json'), '[]\n', 'utf8');
  const snapshot = createProjectSnapshot(workspaceRoot);
  const snapshotHash = createProjectSnapshotHash(snapshot);
  const plan: PlanRun = {
    planId: 'plan-electron-e2e',
    sessionId: 'session-electron-e2e',
    revision: 1,
    status: 'ready',
    proposal: {
      id: 'proposal-electron-e2e',
      sessionId: 'session-electron-e2e',
      summary: 'Electron flow',
      objective: 'Run local plan',
      scope: ['workspace'],
      constraints: [],
      acceptanceCriteria: ['The local plan runs.'],
      openQuestions: [],
      transcript: { sessionId: 'session-electron-e2e', messages: [{ role: 'user', text: 'Run local plan' }] },
      snapshotHash,
      createdAt: new Date().toISOString()
    },
    snapshotHash,
    roadmap: {
      version: '1.0.0',
      summary: 'Electron E2E plan',
      tasks: [{ id: 'electron-task', title: 'Validate Electron workflow', description: 'Validate Electron workflow', priority: 'high', dependencies: [], suggestedAgent: 'testing-plugin', readPaths: ['README.md'] }]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const planStore = new PlanStore(workspaceRoot);
  planStore.save(plan);
  const persistedSnapshot = createProjectSnapshot(workspaceRoot);
  const persistedSnapshotHash = createProjectSnapshotHash(persistedSnapshot);
  planStore.save({ ...plan, snapshotHash: persistedSnapshotHash, proposal: { ...plan.proposal, snapshotHash: persistedSnapshotHash } });

  const electronApp = await electron.launch({
    args: [
      `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-electron-userdata-'))}`,
      path.resolve(process.cwd(), 'dist/src/electron/main.js')
    ],
    env: { ...process.env, NEXIO_WORKSPACE_ROOT: workspaceRoot },
    executablePath: require('electron') as string
  });
  try {
    const page = await test.step('open Electron window and preload', () => electronApp.firstWindow());
    await test.step('verify UI and preload', async () => {
      await expect(page).toHaveTitle(/Nexio IDE/i);
      await expect(page.locator('#app')).toBeVisible();
    });
    const config = await test.step('read workspace config', () => page.evaluate(() => window.electronAPI.getConfig()));
    expect(config.workspaceRoot).toBe(workspaceRoot);
    const loaded = await test.step('load persisted plan', () => page.evaluate(() => window.electronAPI.getPlan('plan-electron-e2e')));
    expect(loaded).toMatchObject({ ok: true, data: { plan: { planId: 'plan-electron-e2e' } } });
    const handoff = await test.step('handoff plan', () => page.evaluate(() => window.electronAPI.handoffPlan('plan-electron-e2e')));
    expect(handoff.ok, JSON.stringify(handoff)).toBe(true);
    const run = await test.step('run plan with local provider', () => page.evaluate(() => window.electronAPI.runAgentWorkflow('plan-electron-e2e', { provider: 'local', model: 'local-model' })));
    expect(run.ok).toBe(true);
    expect((run.data as any)?.workflowRun.tasks[0]).toMatchObject({ taskId: 'electron-task', status: 'succeeded' });
    const runId = (run.data as any)?.runId as string;
    const recovered = await test.step('recover workflow state and activity', async () => ({
      run: await page.evaluate((id) => window.electronAPI.getWorkflowRun(id), runId),
      activity: await page.evaluate((id) => window.electronAPI.getWorkflowActivity(id), runId)
    }));
    expect(recovered.run).toMatchObject({ ok: true, data: { run: { runId } } });
    expect(recovered.activity).toMatchObject({ ok: true, data: { events: expect.arrayContaining([expect.objectContaining({ type: 'workflow-started' }), expect.objectContaining({ type: 'workflow-completed' })]) } });
  } finally {
    await electronApp.close();
  }
});