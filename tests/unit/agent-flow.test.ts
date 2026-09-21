import { IdeasAgent } from '../../src/agents/ideas-agent';
import { PlanningAgent } from '../../src/agents/planning-agent';
import { PrincipalAgent } from '../../src/agents/principal-agent';
import { AgentOrchestrator } from '../../src/backend/orchestrator';
import { buildWorkflowPreview } from '../../src/backend/agent-preview';
import { LlmManager } from '../../src/backend/llm/llm-manager';
import { createProjectSnapshot } from '../../src/backend/project-snapshot';
import { Sandbox } from '../../src/backend/sandbox';
import { PromptManager } from '../../src/backend/llm/prompt-manager';
import type { AgentContext, AgentTask } from '../../src/shared/types';

describe('Nexio IDE scaffold', () => {
  test('ollama connector exposes a real health check for the configured endpoint', async () => {
    const manager = new LlmManager();
    const health = await manager.checkProviderHealth('ollama');

    expect(health).toMatchObject({
      provider: 'ollama',
      ok: expect.any(Boolean),
      baseUrl: expect.any(String)
    });
  });

  test('ideas agent returns read-only guidance', async () => {
    const agent = new IdeasAgent();
    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['src/app.ts', 'README.md'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-1',
      title: 'Add AI code assistant panel',
      description: 'Adds a new AI panel to the IDE.',
      priority: 'high',
      dependencies: []
    };

    const result = await agent.think(context, task);
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ readOnly: true });
  });

  test('planning agent emits roadmap payload', async () => {
    const agent = new PlanningAgent();
    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['src/agents.ts'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-2',
      title: 'Add plugin scaffolder',
      description: 'Create a plugin scaffolder command.',
      priority: 'medium',
      dependencies: []
    };

    const result = await agent.plan(context, task);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('roadmap');
  });

  test('principal agent executes assigned task via plugins', async () => {
    const agent = new PrincipalAgent([]);
    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['src/backend/sandbox.ts'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-3',
      title: 'Validate plugin contract',
      description: 'Ensure plugin contracts stay compatible.',
      priority: 'low',
      dependencies: []
    };

    const result = await agent.execute(context, task);
    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('results');
  });

  test('principal agent executes with workspace context and passes it to the selected plugin', async () => {
    const agent = new PrincipalAgent([
      {
        id: 'docs-plugin',
        name: 'Docs Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['docs', 'documentation', 'readme'],
        async init() {},
        async execute(task: AgentTask, context?: AgentContext) {
          return { ok: true, message: `Docs plugin handled ${task.title}.`, data: { plugin: 'docs-plugin', contextRoot: context?.snapshot.rootPath ?? 'missing' } };
        }
      } as any
    ]);

    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['README.md'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-context-1',
      title: 'Document the API for the workspace',
      description: 'Create the missing documentation for the IDE project.',
      priority: 'high',
      dependencies: []
    };

    const result = await agent.execute(context, task);

    expect(result.ok).toBe(true);
    expect((result.data as any)?.taskDispatch).toEqual(['docs-plugin']);
    expect((result.data as any)?.results[0].data).toMatchObject({ contextRoot: '/workspace' });
  });

  test('principal agent routes tasks to relevant plugin capabilities', async () => {
    const agent = new PrincipalAgent([
      {
        id: 'docs-plugin',
        name: 'Docs Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['docs', 'documentation', 'readme'],
        async init() {},
        async execute(task: AgentTask) {
          return { ok: true, message: `Docs plugin handled ${task.title}.`, data: { plugin: 'docs-plugin' } };
        }
      } as any,
      {
        id: 'testing-plugin',
        name: 'Testing Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['testing', 'qa', 'validation'],
        async init() {},
        async execute(task: AgentTask) {
          return { ok: true, message: `Testing plugin handled ${task.title}.`, data: { plugin: 'testing-plugin' } };
        }
      } as any,
      {
        id: 'refactor-plugin',
        name: 'Refactor Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['refactor', 'cleanup', 'code'],
        async init() {},
        async execute(task: AgentTask) {
          return { ok: true, message: `Refactor plugin handled ${task.title}.`, data: { plugin: 'refactor-plugin' } };
        }
      } as any
    ]);

    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['README.md', 'src/app.ts'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-capability-1',
      title: 'Document the API and validate the QA flow',
      description: 'Update docs and validate the regression test workflow.',
      priority: 'high',
      dependencies: []
    };

    const result = await agent.execute(context, task);

    expect(result.ok).toBe(true);
    expect((result.data as any)?.taskDispatch).toEqual(expect.arrayContaining(['docs-plugin', 'testing-plugin']));
    expect((result.data as any)?.availableCapabilities).toEqual(expect.arrayContaining(['docs', 'testing', 'refactor']));
  });

  test('principal agent honors the plugin selected by the planning roadmap', async () => {
    const executed: string[] = [];
    const agent = new PrincipalAgent([
      {
        id: 'docs-plugin',
        name: 'Docs Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['documentation'],
        async init() {},
        async execute(task: AgentTask) {
          executed.push(`docs:${task.id}`);
          return { ok: true, message: 'docs', data: { plugin: 'docs-plugin' } };
        }
      } as any,
      {
        id: 'testing-plugin',
        name: 'Testing Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['testing'],
        async init() {},
        async execute(task: AgentTask) {
          executed.push(`testing:${task.id}`);
          return { ok: true, message: 'testing', data: { plugin: 'testing-plugin' } };
        }
      } as any
    ]);

    const result = await agent.execute({
      snapshot: { name: 'workspace', rootPath: '/workspace', files: [], lastUpdated: '2026-09-19T00:00:00Z' },
      sandbox: { allowedRoots: ['/workspace'], readOnly: true }
    }, {
      id: 'task-selected-plugin',
      title: 'Document and test the feature',
      description: 'The roadmap selected testing explicitly.',
      priority: 'medium',
      dependencies: [],
      metadata: { suggestedAgent: 'testing-plugin' }
    });

    expect(result.ok).toBe(true);
    expect(executed).toEqual(['testing:task-selected-plugin']);
    expect((result.data as any)?.taskDispatch).toEqual(['testing-plugin']);
  });

  test('principal agent selects a plugin by required manifest capabilities', async () => {
    const agent = new PrincipalAgent([
      {
        id: 'docs-plugin',
        name: 'Docs Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['documentation'],
        async init() {},
        async execute() {
          return { ok: true, message: 'docs', data: { plugin: 'docs-plugin' } };
        }
      } as any,
      {
        id: 'testing-plugin',
        name: 'Testing Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['testing'],
        async init() {},
        async execute() {
          return { ok: true, message: 'testing', data: { plugin: 'testing-plugin' } };
        }
      } as any
    ]);

    const result = await agent.execute({
      snapshot: { name: 'workspace', rootPath: '/workspace', files: [], lastUpdated: '2026-09-19T00:00:00Z' },
      sandbox: { allowedRoots: ['/workspace'], readOnly: true }
    }, {
      id: 'task-manifest-capability',
      title: 'Prepare the release artifact',
      description: 'Generic wording without the plugin capability name.',
      priority: 'medium',
      dependencies: [],
      metadata: { requiredCapabilities: ['testing'] }
    });

    expect(result.ok).toBe(true);
    expect((result.data as any)?.taskDispatch).toEqual(['testing-plugin']);
  });

  test('principal agent blocks a task when the selected plugin is unavailable', async () => {
    const agent = new PrincipalAgent([]);
    const result = await agent.execute({
      snapshot: { name: 'workspace', rootPath: '/workspace', files: [], lastUpdated: '2026-09-19T00:00:00Z' },
      sandbox: { allowedRoots: ['/workspace'], readOnly: true }
    }, {
      id: 'task-missing-plugin',
      title: 'Run security scan',
      description: 'Requires the security plugin.',
      priority: 'high',
      dependencies: [],
      metadata: { suggestedAgent: 'security-plugin' }
    });

    expect(result.ok).toBe(false);
    expect((result.data as any)?.results[0].data).toMatchObject({ blocked: true, plugin: 'none' });
  });

  test('principal agent converts a plugin timeout into a retryable result', async () => {
    const agent = new PrincipalAgent([{
      id: 'slow-plugin',
      name: 'Slow Plugin',
      type: 'agent',
      version: '0.1.0',
      capabilities: ['testing'],
      timeoutMs: 5,
      async init() {},
      async execute() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: true, message: 'late', data: { plugin: 'slow-plugin' } };
      }
    } as any]);

    const result = await agent.execute({
      snapshot: { name: 'workspace', rootPath: '/workspace', files: [], lastUpdated: '2026-09-19T00:00:00Z' },
      sandbox: { allowedRoots: ['/workspace'], readOnly: true }
    }, {
      id: 'task-timeout',
      title: 'Run timeout test',
      description: 'testing',
      priority: 'high',
      dependencies: [],
      metadata: { suggestedAgent: 'slow-plugin' }
    });

    expect(result.ok).toBe(false);
    expect((result.data as any)?.results[0].data).toMatchObject({ timeout: true, retryable: true });
  });

  test('principal agent blocks changes from read-only plugins', async () => {
    const agent = new PrincipalAgent([{
      id: 'readonly-plugin',
      name: 'Readonly Plugin',
      type: 'agent',
      version: '0.1.0',
      capabilities: ['testing'],
      permissions: { readOnly: true },
      async init() {},
      async execute() {
        return { ok: true, message: 'invalid change', data: { plugin: 'readonly-plugin', targetPath: 'src/app.ts', patch: '--- src/app.ts\n+++ src/app.ts\n@@\n+bad' } };
      }
    } as any]);

    const result = await agent.execute({
      snapshot: { name: 'workspace', rootPath: '/workspace', files: [], lastUpdated: '2026-09-19T00:00:00Z' },
      sandbox: { allowedRoots: ['/workspace'], readOnly: true }
    }, {
      id: 'task-readonly',
      title: 'Run readonly validation',
      description: 'testing',
      priority: 'medium',
      dependencies: [],
      metadata: { suggestedAgent: 'readonly-plugin' }
    });

    expect(result.ok).toBe(false);
    expect((result.data as any)?.results[0].data).toMatchObject({ blocked: true, permissionDenied: true });
  });

  test('principal agent blocks unhealthy plugins before execution', async () => {
    const execute = jest.fn().mockResolvedValue({ ok: true, message: 'unexpected', data: { plugin: 'unhealthy-plugin' } });
    const agent = new PrincipalAgent([{
      id: 'unhealthy-plugin',
      name: 'Unhealthy Plugin',
      type: 'agent',
      version: '0.1.0',
      capabilities: ['testing'],
      async init() {},
      async healthCheck() { return { ok: false, message: 'provider unavailable' }; },
      execute
    } as any]);

    const result = await agent.execute({
      snapshot: { name: 'workspace', rootPath: '/workspace', files: [], lastUpdated: '2026-09-19T00:00:00Z' },
      sandbox: { allowedRoots: ['/workspace'], readOnly: true }
    }, {
      id: 'task-health',
      title: 'Health check',
      description: 'testing',
      priority: 'medium',
      dependencies: [],
      metadata: { suggestedAgent: 'unhealthy-plugin' }
    });

    expect(result.ok).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect((result.data as any)?.results[0].data).toMatchObject({ blocked: true, healthCheck: true, retryable: true });
  });

  test('principal agent coordinates plugin communication through a message bus', async () => {
    const agent = new PrincipalAgent([
      {
        id: 'docs-plugin',
        name: 'Docs Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['docs', 'documentation', 'readme'],
        async init() {},
        async handleMessage(message: any) {
          return {
            id: `message-${Date.now()}`,
            type: 'result',
            from: 'docs-plugin',
            to: message.from,
            correlationId: message.id,
            payload: { ok: true, message: `Docs plugin handled ${message.payload.task.title}.` }
          };
        },
        async execute(task: AgentTask) {
          return { ok: true, message: `Docs plugin handled ${task.title}.`, data: { plugin: 'docs-plugin' } };
        }
      } as any
    ]);

    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['README.md'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-message-bus-1',
      title: 'Document the module contract',
      description: 'Write a concise module description and share the result back to the orchestrator.',
      priority: 'high',
      dependencies: []
    };

    const result = await agent.execute(context, task);

    expect(result.ok).toBe(true);
    expect((result.data as any)?.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'task', to: 'docs-plugin' }),
      expect.objectContaining({ type: 'result', from: 'docs-plugin' })
    ]));
  });

  test('sandbox denies writes outside allowed roots', () => {
    const sandbox = new Sandbox({ allowedRoots: ['/workspace'] });

    expect(() => {
      sandbox.writeText('/tmp/outside.txt', 'nope');
    }).toThrow(/Access denied/);
  });

  test('sandbox rejects traversal and sibling-root confusion', () => {
    const sandbox = new Sandbox({ allowedRoots: ['/workspace'] });

    expect(() => {
      sandbox.readText('/workspace/../etc/passwd');
    }).toThrow(/Access denied/);

    expect(() => {
      sandbox.readText('/workspace2/secret.txt');
    }).toThrow(/Access denied/);
  });

  test('sandbox blocks symlink escapes outside the allowed workspace', () => {
    const projectRoot = require('node:fs').mkdtempSync('/tmp/nexio-sandbox-');
    const escapeTarget = '/etc';
    const linkPath = `${projectRoot}/escape`;

    require('node:fs').symlinkSync(escapeTarget, linkPath);
    const sandbox = new Sandbox({ allowedRoots: [projectRoot] });

    expect(() => {
      sandbox.readText(`${linkPath}/passwd`);
    }).toThrow(/Access denied/);
  });

  test('prompt manager renders versioned templates', () => {
    const manager = new PromptManager();
    const rendered = manager.render('ideas', { project: 'Nexio IDE' });

    expect(rendered).toContain('Ideas agent');
    expect(rendered).toContain('Nexio IDE');
  });

  test('editor plugin handles code edits with an approval-ready patch', async () => {
    const agent = new PrincipalAgent([
      {
        id: 'editor-plugin',
        name: 'Editor Plugin',
        type: 'agent',
        version: '0.1.0',
        capabilities: ['edit', 'code', 'implement', 'fix', 'create'],
        async init() {},
        async execute(task: AgentTask) {
          return {
            ok: true,
            message: `Editor plugin prepared a patch for ${task.title}.`,
            data: {
              plugin: 'editor-plugin',
              targetPath: 'src/demo.ts',
              patch: '--- src/demo.ts\n+++ src/demo.ts\n@@\n+export const demo = true;\n',
              approvalRequired: true
            }
          };
        }
      } as any
    ]);

    const context: AgentContext = {
      snapshot: {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['src/demo.ts'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      sandbox: {
        allowedRoots: ['/workspace'],
        readOnly: true
      }
    };

    const task: AgentTask = {
      id: 'task-edit-approval-1',
      title: 'Implement the demo helper',
      description: 'Create a helper function and prepare the patch for review before writing it to disk.',
      priority: 'high',
      dependencies: []
    };

    const result = await agent.execute(context, task);

    expect(result.ok).toBe(true);
    expect((result.data as any)?.taskDispatch).toEqual(['editor-plugin']);
    expect((result.data as any)?.patchSummary[0]).toMatchObject({ plugin: 'editor-plugin' });
    expect((result.data as any)?.changes).toEqual([
      expect.objectContaining({
        targetPath: 'src/demo.ts',
        patch: '--- src/demo.ts\n+++ src/demo.ts\n@@\n+export const demo = true;'
      })
    ]);
  });

  test('llm manager falls back between providers when primary fails and retains execution metadata', async () => {
    const manager = new LlmManager();
    const response = await manager.completeWithFallback(
      {
        prompt: 'Describe the next feature.',
        system: 'You are helpful.',
        metadata: {
          agent: 'ideas',
          taskId: 'task-llm',
          snapshotHash: 'abc123'
        }
      },
      ['openai', 'ollama']
    );

    expect(response.provider).toBe('openai');
    expect(response.text).toContain('Describe');
    expect(response.metadata).toMatchObject({
      agent: 'ideas',
      taskId: 'task-llm',
      snapshotHash: 'abc123'
    });
  });

  test('workflow preview falls back to the principal result when no suggestions are available', () => {
    const result = buildWorkflowPreview({
      ideaSuggestions: [],
      autocompleteExamples: [],
      roadmapTasks: [],
      principalMessage: 'Principal agent completed without patch preview.',
      fallbackPrompt: 'Genera la siguiente mejora del editor.'
    });

    expect(result.taskPreview).toContain('Principal agent completed without patch preview.');
    expect(result.pendingPatch).toContain('Principal agent completed without patch preview.');
  });

  test('project snapshot enumerates files from the workspace root', async () => {
    const snapshot = createProjectSnapshot(process.cwd());

    expect(snapshot.name).toBe('nexio-ide');
    expect(snapshot.files.length).toBeGreaterThan(0);
    expect(snapshot.files.some((file) => file.endsWith('README.md'))).toBe(true);
  });

  test('ideas and planning agents use the workspace context to generate actionable output', async () => {
    const ideasAgent = new IdeasAgent();
    const planningAgent = new PlanningAgent();
    const snapshot = createProjectSnapshot(process.cwd());
    const task: AgentTask = {
      id: 'task-context-1',
      title: 'Improve agent execution workflow',
      description: 'Create a concrete execution flow for the IDE agents.',
      priority: 'high',
      dependencies: []
    };

    const context: AgentContext = {
      snapshot,
      roadmap: {
        version: '1.0.0',
        summary: 'Context aware workflow',
        tasks: []
      },
      sandbox: {
        allowedRoots: [process.cwd()],
        readOnly: true
      }
    };

    const ideaResult = await ideasAgent.think(context, task);
    const planResult = await planningAgent.plan(context, task);

    expect(ideaResult.ok).toBe(true);
    expect(ideaResult.data).toHaveProperty('suggestions');
    expect(String(ideaResult.data?.suggestions).toLowerCase()).toContain('src');
    expect(planResult.ok).toBe(true);
    expect(planResult.data).toHaveProperty('roadmap');
    expect(Array.isArray((planResult.data as any)?.roadmap?.tasks)).toBe(true);
  });

  test('ideas agent suggests code completion examples from user intent and editor context', async () => {
    const ideasAgent = new IdeasAgent();
    const snapshot = createProjectSnapshot(process.cwd());
    const task: AgentTask = {
      id: 'task-completion-1',
      title: 'Provide autocomplete examples',
      description: 'Suggest completions while the user types in the editor.',
      priority: 'medium',
      dependencies: [],
      metadata: {
        prompt: 'Quiero una función que reciba un nombre y devuelva un saludo',
        editorContext: 'const greet = ',
        language: 'typescript'
      }
    };

    const context: AgentContext = {
      snapshot,
      roadmap: { version: '1.0.0', summary: 'Autocomplete examples', tasks: [] },
      sandbox: { allowedRoots: [process.cwd()], readOnly: true }
    };

    const result = await ideasAgent.think(context, task);

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('autocompleteExamples');
    expect(Array.isArray(result.data?.autocompleteExamples)).toBe(true);
    expect(String(result.data?.autocompleteExamples).toLowerCase()).toContain('greet');
    expect(String(result.data?.autocompleteExamples).toLowerCase()).toContain('function');
  });
});
