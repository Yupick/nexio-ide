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

  test('uses the configured runtime provider and exposes the available plugins', async () => {
    const runtime = new WorkflowRuntime({
      provider: 'gemini',
      agent: 'principal',
      language: 'typescript',
      model: 'gemini-2.0-flash',
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: '',
      temperature: 0.3
    });

    const snapshot: ProjectSnapshot = {
      name: 'nexio-ide',
      rootPath: process.cwd(),
      files: ['src/ui/index.html', 'src/backend/workflow-runtime.ts'],
      lastUpdated: '2026-09-10T00:00:00Z'
    };

    const result = await runtime.runWorkflow(snapshot, {
      id: 'wf-002',
      title: 'Verify configured provider',
      description: 'Ensure backend runtime honors provider and plugin selection.',
      priority: 'medium',
      dependencies: []
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('agentRuntime');
    expect((result.data as any)?.agentRuntime.provider).toBe('gemini');
    expect((result.data as any)?.availablePlugins).toEqual(expect.arrayContaining([
      'syntax-plugin',
      'refactor-plugin',
      'docs-plugin',
      'testing-plugin'
    ]));
  });

  test('builds a config-aware prompt payload for the selected agent/provider/language', async () => {
    const runtime = new WorkflowRuntime({
      provider: 'grok',
      agent: 'orchestrator',
      language: 'python',
      model: 'grok-2-latest',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: '',
      temperature: 0.5
    });

    const snapshot: ProjectSnapshot = {
      name: 'nexio-ide',
      rootPath: process.cwd(),
      files: ['src/backend/workflow-runtime.ts', 'src/backend/plugin-manager.ts'],
      lastUpdated: '2026-09-10T00:00:00Z'
    };

    const result = await runtime.runWorkflow(snapshot, {
      id: 'wf-003',
      title: 'Generate orchestrator prompt',
      description: 'Validate runtime-config prompt generation for the selected mode.',
      priority: 'high',
      dependencies: []
    });

    expect(result.ok).toBe(true);
    expect((result.data as any)?.promptContext).toMatchObject({
      template: 'orchestrator',
      provider: 'grok',
      language: 'python'
    });
    expect(String((result.data as any)?.promptContext.renderedPrompt)).toContain('orchestrator');
  });
});
