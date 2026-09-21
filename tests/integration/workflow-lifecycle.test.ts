import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AgentOrchestrator } from '../../src/backend/orchestrator';
import { createProjectSnapshot } from '../../src/backend/project-snapshot';
import { createProjectSnapshotHash } from '../../src/backend/snapshot-hash';
import { WorkflowRunStore } from '../../src/backend/workflow-run-store';
import { WorkflowRuntime } from '../../src/backend/workflow-runtime';
import type { PlanRun, ProjectSnapshot, Roadmap } from '../../src/shared/types';

function createWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-workflow-lifecycle-'));
  fs.writeFileSync(path.join(root, 'README.md'), '# lifecycle\n', 'utf8');
  return root;
}

function createPlan(snapshot: ProjectSnapshot, roadmap: Roadmap, status: PlanRun['status'] = 'handed_off'): PlanRun {
  const snapshotHash = createProjectSnapshotHash(snapshot);
  return {
    planId: `plan-lifecycle-${Date.now()}`,
    sessionId: 'session-lifecycle',
    revision: 1,
    status,
    proposal: {
      id: 'proposal-lifecycle',
      sessionId: 'session-lifecycle',
      summary: 'Lifecycle validation',
      objective: 'Lifecycle validation',
      scope: ['workspace'],
      constraints: [],
      acceptanceCriteria: ['The lifecycle is reproducible.'],
      openQuestions: [],
      transcript: { sessionId: 'session-lifecycle', messages: [{ role: 'user', text: 'Validate lifecycle' }] },
      snapshotHash,
      createdAt: new Date().toISOString()
    },
    snapshotHash,
    roadmap,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

const localSettings = {
  provider: 'local' as const,
  agent: 'principal' as const,
  model: 'local-model',
  baseUrl: 'http://localhost',
  apiKey: '',
  temperature: 0.2
};

describe('workflow lifecycle integration', () => {
  test('covers pause, resume, retry, expired lease, blocked plugin and stale snapshot without remote providers', async () => {
    const workspaceRoot = createWorkspace();
    const snapshot = createProjectSnapshot(workspaceRoot);
    const roadmap: Roadmap = {
      version: '1.0.0',
      summary: 'Lifecycle plan',
      tasks: [{ id: 'lifecycle-task', title: 'Validate lifecycle', description: 'Validate lifecycle', priority: 'high', dependencies: [], suggestedAgent: 'testing-plugin', readPaths: ['README.md'] }]
    };
    const plan = createPlan(snapshot, roadmap);
    const runtime = new WorkflowRuntime(localSettings);

    const paused = await runtime.runPlanWorkflow(snapshot, plan, undefined, undefined, 'run-lifecycle-paused', () => true);
    expect(paused.data).toMatchObject({ runId: 'run-lifecycle-paused', status: 'paused' });

    const resumed = await runtime.runPlanWorkflow(snapshot, plan, undefined, undefined, 'run-lifecycle-paused');
    expect(resumed.ok).toBe(true);

    const orchestrator = new AgentOrchestrator();
    let retryRun = orchestrator.createWorkflowRun(snapshot, { planId: plan.planId, snapshotHash: plan.snapshotHash, roadmap }, 1, 3, 'run-lifecycle-retry');
    retryRun = orchestrator.markTaskRunning(retryRun, 'lifecycle-task');
    retryRun = orchestrator.markTaskResult(retryRun, 'lifecycle-task', false, { message: 'temporary failure' });
    expect(orchestrator.retryTask(retryRun, 'lifecycle-task').tasks[0].status).toBe('ready');

    const runStore = new WorkflowRunStore(workspaceRoot);
    runStore.save({ ...retryRun, tasks: [{ ...retryRun.tasks[0], leaseExpiresAt: '2000-01-01T00:00:00.000Z', status: 'running' }] });
    expect(runStore.recoverExpiredLeases(new Date('2026-01-01T00:00:00.000Z'))[0].tasks[0].result).toMatchObject({ recovery: 'lease-expired' });

    const blockedPlan = createPlan(snapshot, { ...roadmap, tasks: [{ ...roadmap.tasks[0], suggestedAgent: 'missing-plugin' }] });
    const blocked = await runtime.runPlanWorkflow(snapshot, blockedPlan, undefined, undefined, 'run-lifecycle-blocked');
    expect(blocked.ok).toBe(false);
    expect((blocked.data as any)?.workflowRun.tasks[0]).toMatchObject({ status: 'blocked' });

    const stale = await runtime.runPlanWorkflow({ ...snapshot, files: [...snapshot.files, 'stale.txt'] }, plan, undefined, undefined, 'run-lifecycle-stale');
    expect(stale.ok).toBe(false);
    expect(stale.message).toContain('obsoleto');
  });
});