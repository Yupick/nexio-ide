import { WorkflowRuntime } from '../../src/backend/workflow-runtime';
import type { AgentTask, ProjectSnapshot } from '../../src/shared/types';

describe('workflow runtime', () => {
  test('creates an end-to-end operational workflow state', async () => {
    const runtime = new WorkflowRuntime();
    const snapshot: ProjectSnapshot = {
      name: 'nexio-ide',
      rootPath: process.cwd(),
      files: ['src/ui/index.html', 'src/backend/orchestrator.ts'],
      lastUpdated: '2026-09-10T00:00:00Z'
    };

    const task: AgentTask = {
      id: 'wf-001',
      title: 'Prepare release candidate',
      description: 'Finalize the product for internal QA and testing.',
      priority: 'high',
      dependencies: []
    };

    const result = await runtime.runWorkflow(snapshot, task);

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('ideaResult');
    expect(result.data).toHaveProperty('planResult');
    expect(result.data).toHaveProperty('approvalStatus', 'awaiting_review');
  });

  test('supports approval and rejection transitions', async () => {
    const runtime = new WorkflowRuntime();

    const state = runtime.createState('task-approve', 'Test approval flow');
    runtime.setApprovalState(state, 'approved');
    expect(state.approvalStatus).toBe('approved');

    runtime.setApprovalState(state, 'rejected');
    expect(state.approvalStatus).toBe('rejected');
  });
});
