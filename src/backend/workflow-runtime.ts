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
    temperature: 0.4
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
    const planResult = await this.planningAgent.plan(context, task);
    const orchestratorResult = await this.orchestrator.runIdeaWorkflow(snapshot, task);
    const principalResult = await this.principalAgent.execute(context, task);
    const executionMetadata = createExecutionMetadata(task, this.runtimeSettings, snapshot);
    const patchSummary = Array.isArray((principalResult.data as Record<string, unknown> | undefined)?.patchSummary)
      ? ((principalResult.data as Record<string, unknown>).patchSummary as Array<Record<string, unknown>>)
      : [];
    const pendingPatch = patchSummary.length > 0
      ? patchSummary.map((entry) => String(entry.diff ?? entry.message ?? '')).filter(Boolean).join('\n\n')
      : principalResult.message;

    return {
      ok: ideaResult.ok && planResult.ok && orchestratorResult.ok && principalResult.ok,
      message: `End-to-end workflow reached the approval gate using ${this.runtimeSettings.provider} for agent ${this.runtimeSettings.agent}. The system honored the ideas -> planning -> orchestrator -> principal execution chain.`,
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        orchestratorResult,
        principalResult,
        executionMetadata,
        approvalStatus: 'awaiting_review',
        pendingPatch,
        agentRuntime: { ...this.runtimeSettings },
        availablePlugins: this.pluginManager.getDefinitions().map((plugin) => plugin.id),
        promptContext
      }
    };
  }
}
