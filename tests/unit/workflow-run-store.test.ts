import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WorkflowRunStore } from '../../src/backend/workflow-run-store';
import type { WorkflowRun } from '../../src/shared/types';

function createRun(): WorkflowRun {
  return {
    runId: 'run-1',
    planId: 'plan-1',
    planRevision: 1,
    snapshotHash: 'snapshot-1',
    status: 'running',
    tasks: [{
      taskId: 'task-1',
      planId: 'plan-1',
      planRevision: 1,
      title: 'Run task',
      description: 'Run task',
      dependencies: [],
      priority: 'high',
      acceptanceCriteria: [],
      status: 'running',
      attempt: 1,
      maxAttempts: 3,
      leaseId: 'lease-1',
      leaseExpiresAt: '2026-09-19T12:00:00.000Z',
      updatedAt: '2026-09-19T11:00:00.000Z'
    }],
    createdAt: '2026-09-19T11:00:00.000Z',
    updatedAt: '2026-09-19T11:00:00.000Z'
  };
}

describe('workflow run store', () => {
  test('persists runs independently from approval history', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-runs-'));
    const store = new WorkflowRunStore(workspaceRoot);
    store.save(createRun());

    expect(store.get('run-1')).toMatchObject({ planId: 'plan-1', planRevision: 1 });
    expect(fs.existsSync(path.join(workspaceRoot, '.nexio', 'workflow-runs.json'))).toBe(true);
    expect(fs.existsSync(path.join(workspaceRoot, '.nexio', 'workflow-history.json'))).toBe(false);
  });

  test('recovers expired running leases as retryable tasks', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-recovery-'));
    const store = new WorkflowRunStore(workspaceRoot);
    store.save(createRun());

    const recovered = store.recoverExpiredLeases(new Date('2026-09-19T13:00:00.000Z'));
    expect(recovered[0].tasks[0]).toMatchObject({
      status: 'retryable',
      result: { recovery: 'lease-expired' }
    });
    expect(recovered[0].tasks[0].leaseId).toBeUndefined();
  });

  test('updates a persisted run status for pause and resume controls', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-status-'));
    const store = new WorkflowRunStore(workspaceRoot);
    store.save(createRun());

    expect(store.updateStatus('run-1', 'paused')?.status).toBe('paused');
    expect(store.get('run-1')?.status).toBe('paused');
    expect(store.updateStatus('run-1', 'running')?.status).toBe('running');
  });
});