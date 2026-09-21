import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WorkflowEventStore } from '../../src/backend/workflow-event-store';
import type { WorkflowEvent } from '../../src/shared/types';

function createEvent(taskId = 'task-1'): WorkflowEvent {
  return {
    type: 'stage-completed',
    taskId,
    message: 'Task completed',
    timestamp: new Date().toISOString(),
    metadata: { provider: 'local', apiKey: 'must-not-persist', attempt: 1 }
  };
}

describe('workflow event store', () => {
  test('appends correlated events and filters them without persisting secrets', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-events-'));
    const store = new WorkflowEventStore(workspaceRoot);
    const event = store.append(createEvent(), { planId: 'plan-1', planRevision: 2, runId: 'run-1', pluginId: 'testing-plugin', status: 'succeeded' });

    expect(event).toMatchObject({ taskId: 'task-1', planId: 'plan-1', planRevision: 2, runId: 'run-1', pluginId: 'testing-plugin' });
    expect(store.list({ runId: 'run-1' })).toHaveLength(1);
    expect(store.list({ taskId: 'missing' })).toHaveLength(0);
    expect(JSON.stringify(store.list())).not.toContain('must-not-persist');
  });

  test('rotates old events while preserving the newest entries', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-event-rotation-'));
    const store = new WorkflowEventStore(workspaceRoot, 2);
    store.append(createEvent('task-1'));
    store.append(createEvent('task-2'));
    store.append(createEvent('task-3'));

    expect(store.list().map((event) => event.taskId)).toEqual(['task-2', 'task-3']);
  });
});