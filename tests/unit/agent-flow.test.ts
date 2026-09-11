import { IdeasAgent } from '../../src/agents/ideas-agent';
import { PlanningAgent } from '../../src/agents/planning-agent';
import { PrincipalAgent } from '../../src/agents/principal-agent';
import { AgentOrchestrator } from '../../src/backend/orchestrator';
import { LlmManager } from '../../src/backend/llm/llm-manager';
import { createProjectSnapshot } from '../../src/backend/project-snapshot';
import { Sandbox } from '../../src/backend/sandbox';
import { PromptManager } from '../../src/backend/llm/prompt-manager';
import type { AgentContext, AgentTask } from '../../src/shared/types';

describe('Nexio IDE scaffold', () => {
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

  test('orchestrator combines ideas and planning into a concrete result', async () => {
    const orchestrator = new AgentOrchestrator();
    const task: AgentTask = {
      id: 'task-4',
      title: 'Add plugin marketplace',
      description: 'Create a plugin marketplace view.',
      priority: 'high',
      dependencies: []
    };

    const result = await orchestrator.runIdeaWorkflow(
      {
        name: 'nexio-ide',
        rootPath: '/workspace',
        files: ['src/ui/index.html', 'src/backend/plugin-loader.ts'],
        lastUpdated: '2026-09-10T00:00:00Z'
      },
      task
    );

    expect(result.ok).toBe(true);
    expect(result.data).toHaveProperty('roadmap');
  });

  test('llm manager falls back between providers when primary fails', async () => {
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
