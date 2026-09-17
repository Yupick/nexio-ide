/**
 * Runtime state for the complete IDE workflow.
 * Provides a durable operational representation of the ideas -> plan -> execute -> approval flow.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { IdeasAgent } from '../agents/ideas-agent';
import { PlanningAgent } from '../agents/planning-agent';
import { PrincipalAgent } from '../agents/principal-agent';
import { AgentOrchestrator } from './orchestrator';
import type { AgentRuntimeSettings } from './config';
import { PluginManager } from './plugin-manager';
import { PromptManager } from './llm/prompt-manager';
import type { AgentContext, AgentExecutionResult, AgentTask, ProjectSnapshot, Roadmap } from '../shared/types';

export type ApprovalStatus = 'awaiting_review' | 'approved' | 'rejected';

export interface WorkflowState {
  id: string;
  title: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

function createExecutionMetadata(task: AgentTask, settings: AgentRuntimeSettings, snapshot: ProjectSnapshot): Record<string, string> {
  const snapshotHash = createHash('sha256')
    .update(JSON.stringify({
      name: snapshot.name,
      rootPath: snapshot.rootPath,
      files: [...snapshot.files].sort(),
      lastUpdated: snapshot.lastUpdated
    }))
    .digest('hex')
    .slice(0, 16);

  return {
    taskId: task.id,
    agent: settings.agent,
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    snapshotHash,
    startedAt: new Date().toISOString()
  };
}

function detectLanguageFromSnapshot(snapshot: ProjectSnapshot): string {
  const counts = new Map<string, number>();

  for (const file of snapshot.files) {
    const extension = file.split('.').pop()?.toLowerCase();
    if (!extension) {
      continue;
    }

    const language =
      ['ts', 'tsx'].includes(extension) ? 'typescript' :
      ['js', 'jsx'].includes(extension) ? 'javascript' :
      extension === 'py' ? 'python' :
      extension === 'md' ? 'markdown' :
      null;

    if (!language) {
      continue;
    }

    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  if (counts.get('python')) {
    return 'python';
  }
  if (counts.get('typescript')) {
    return 'typescript';
  }
  if (counts.get('javascript')) {
    return 'javascript';
  }
  if (counts.get('markdown')) {
    return 'markdown';
  }

  return 'typescript';
}

export class WorkflowRuntime {
  private readonly ideasAgent = new IdeasAgent();
  private readonly planningAgent = new PlanningAgent();
  private readonly orchestrator = new AgentOrchestrator();
  private readonly principalAgent: PrincipalAgent;
  private readonly pluginManager: PluginManager;
  private readonly promptManager: PromptManager;
  private readonly runtimeSettings: AgentRuntimeSettings;

  constructor(runtimeSettings: AgentRuntimeSettings = {
    provider: 'ollama',
    agent: 'principal',
    model: 'qwen2.5-coder:0.5b',
    baseUrl: 'http://chat.nightslayer.com.ar:11434',
    apiKey: '',
    temperature: 0.4,
    executionMode: 'manual'
  }) {
    this.runtimeSettings = runtimeSettings;
    const pluginDirectory = fs.existsSync(path.resolve(process.cwd(), 'dist', 'src', 'plugins'))
      ? path.resolve(process.cwd(), 'dist', 'src', 'plugins')
      : path.resolve(process.cwd(), 'src', 'plugins');
    this.pluginManager = new PluginManager(pluginDirectory);
    this.promptManager = new PromptManager();
    this.principalAgent = new PrincipalAgent();
  }

  public createState(id: string, title: string): WorkflowState {
    return {
      id,
      title,
      approvalStatus: 'awaiting_review',
      createdAt: new Date().toISOString()
    };
  }

  public setApprovalState(state: WorkflowState, approvalStatus: ApprovalStatus): void {
    state.approvalStatus = approvalStatus;
  }

  private buildAutonomousFileContent(task: AgentTask): string {
    const title = task.title.toLowerCase();
    const htmlPage = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${task.title}</title>
    <style>
      :root { color-scheme: light dark; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      .card {
        width: min(720px, 90vw);
        background: rgba(15, 23, 42, 0.8);
        border: 1px solid rgba(148, 163, 184, 0.3);
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 15px 30px rgba(15, 23, 42, 0.3);
      }
      h1 { margin: 0 0 0.75rem; }
      p { line-height: 1.6; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${task.title}</h1>
      <p>${task.description}</p>
      <p>Este archivo fue generado automáticamente dentro del workspace activo por el runtime del editor.</p>
    </main>
  </body>
</html>`;

    if (title.includes('html') || title.includes('page') || title.includes('web')) {
      return htmlPage;
    }

    return `# ${task.title}\n\n${task.description}\n`;
  }

  private applyAutonomousApproval(snapshot: ProjectSnapshot, task: AgentTask, principalResult: AgentExecutionResult): { approvalStatus: ApprovalStatus; pendingPatch: string; createdFiles: string[] } {
    if (this.runtimeSettings.executionMode !== 'autonomous') {
      return {
        approvalStatus: 'awaiting_review',
        pendingPatch: principalResult.message,
        createdFiles: []
      };
    }

    const targetFile = path.resolve(snapshot.rootPath, 'index.html');
    const content = this.buildAutonomousFileContent(task);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, content, 'utf8');

    return {
      approvalStatus: 'approved',
      pendingPatch: content,
      createdFiles: [path.relative(snapshot.rootPath, targetFile)]
    };
  }

  public async runWorkflow(snapshot: ProjectSnapshot, task: AgentTask): Promise<AgentExecutionResult> {
    const context: AgentContext = {
      snapshot,
      roadmap: {
        version: '1.0.0',
        summary: 'Operational QA workflow initialized.',
        tasks: []
      } as Roadmap,
      sandbox: {
        allowedRoots: [snapshot.rootPath],
        readOnly: true
      }
    };

    const auditTrail: Array<Record<string, unknown>> = [];
    const pushAudit = (stage: string, metadata: Record<string, unknown> = {}): void => {
      auditTrail.push({
        stage,
        timestamp: new Date().toISOString(),
        ...metadata
      });
    };

    pushAudit('workflow-started', { taskId: task.id, agent: this.runtimeSettings.agent });

    const detectedLanguage = detectLanguageFromSnapshot(snapshot);

    const pluginInstances = await this.pluginManager.loadAll({
      projectPath: snapshot.rootPath,
      logger: (message: string) => console.log(`[${this.runtimeSettings.agent}] ${message}`)
    });

    pluginInstances.forEach((plugin) => this.principalAgent.registerPlugin(plugin));

    const promptContext = {
      template: this.runtimeSettings.agent,
      provider: this.runtimeSettings.provider,
      language: detectedLanguage,
      renderedPrompt: this.promptManager.render(this.runtimeSettings.agent, {
        project: snapshot.name,
        task: task.title,
        provider: this.runtimeSettings.provider,
        language: detectedLanguage,
        agent: this.runtimeSettings.agent
      })
    };

    const ideaResult = await this.ideasAgent.think(context, task);
    pushAudit('idea-generation', { taskId: task.id, ok: ideaResult.ok });

    const planResult = await this.planningAgent.plan(context, task);
    pushAudit('planning', { taskId: task.id, ok: planResult.ok });

    const orchestratorResult = await this.orchestrator.runIdeaWorkflow(snapshot, task);
    pushAudit('orchestrator', { taskId: task.id, ok: orchestratorResult.ok });

    const principalResult = await this.principalAgent.execute(context, task);
    pushAudit('principal-execution', { taskId: task.id, ok: principalResult.ok, pluginCount: principalResult.data?.executedPlugins ?? 0 });

    const executionMetadata = createExecutionMetadata(task, this.runtimeSettings, snapshot);
    const patchSummary = Array.isArray((principalResult.data as Record<string, unknown> | undefined)?.patchSummary)
      ? ((principalResult.data as Record<string, unknown>).patchSummary as Array<Record<string, unknown>>)
      : [];
    const pendingPatchBase = patchSummary.length > 0
      ? patchSummary.map((entry) => String(entry.diff ?? entry.message ?? '')).filter(Boolean).join('\n\n')
      : principalResult.message;

    const automatedOutcome = this.applyAutonomousApproval(snapshot, task, principalResult);
    const resultOk = ideaResult.ok && planResult.ok && orchestratorResult.ok && principalResult.ok;
    pushAudit('workflow-complete', { taskId: task.id, ok: resultOk, approvalStatus: automatedOutcome.approvalStatus });

    return {
      ok: resultOk,
      message: `End-to-end workflow reached the ${automatedOutcome.approvalStatus === 'approved' ? 'autonomous execution' : 'approval'} gate using ${this.runtimeSettings.provider} for agent ${this.runtimeSettings.agent}. The system honored the ideas -> planning -> orchestrator -> principal execution chain.`,
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        orchestratorResult,
        principalResult,
        executionMetadata,
        approvalStatus: automatedOutcome.approvalStatus,
        pendingPatch: automatedOutcome.pendingPatch || pendingPatchBase,
        createdFiles: automatedOutcome.createdFiles,
        agentRuntime: { ...this.runtimeSettings },
        availablePlugins: this.pluginManager.getDefinitions().map((plugin) => plugin.id),
        promptContext,
        auditTrail
      }
    };
  }
}
