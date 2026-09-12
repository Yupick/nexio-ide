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

  test('produces an approval-ready patch summary from the principal execution', async () => {
    const runtime = new WorkflowRuntime();
    const snapshot: ProjectSnapshot = {
      name: 'nexio-ide',
      rootPath: process.cwd(),
      files: ['src/backend/workflow-runtime.ts'],
      lastUpdated: '2026-09-10T00:00:00Z'
    };

    const result = await runtime.runWorkflow(snapshot, {
      id: 'wf-patch-001',
      title: 'Prepare approval-ready patch',
      description: 'Create a staged patch preview for review and approval.',
      priority: 'high',
      dependencies: []
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('approvalStatus', 'awaiting_review');
    expect((result.data as any)?.principalResult?.data?.patchSummary).toEqual(expect.any(Array));
    expect(String((result.data as any)?.principalResult?.data?.patchSummary?.[0]?.message ?? '')).toContain('processed');
  });

  test('uses the configured runtime provider and exposes the available plugins', async () => {
    const runtime = new WorkflowRuntime({
      provider: 'gemini',
      agent: 'principal',
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
      model: 'grok-2-latest',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: '',
      temperature: 0.5
    });

    const snapshot: ProjectSnapshot = {
      name: 'nexio-ide',
      rootPath: process.cwd(),
      files: ['src/backend/workflow-runtime.ts', 'scripts/etl.py'],
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

  test('routes the workflow through ideas, planning, orchestrator and principal execution stages', async () => {
    const runtime = new WorkflowRuntime({
      provider: 'ollama',
      agent: 'orchestrator',
      model: 'llama3.1',
      baseUrl: 'http://chat.nightslayer.com.ar:11434',
      apiKey: '',
      temperature: 0.4
    });

    const snapshot: ProjectSnapshot = {
      name: 'nexio-ide',
      rootPath: process.cwd(),
      files: ['src/backend/workflow-runtime.ts', 'src/agents/planning-agent.ts'],
      lastUpdated: '2026-09-10T00:00:00Z'
    };

    const result = await runtime.runWorkflow(snapshot, {
      id: 'wf-004',
      title: 'Stage orchestration contract',
      description: 'Ensure the authoring flow respects ideas → planning → orchestrator → principal execution.',
      priority: 'high',
      dependencies: []
    });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('ideaResult');
    expect(result.data).toHaveProperty('planResult');
    expect(result.data).toHaveProperty('orchestratorResult');
    expect(result.data).toHaveProperty('principalResult');
    expect((result.data as any)?.orchestratorResult?.ok).toBe(true);
  });
});
