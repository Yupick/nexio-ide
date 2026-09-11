/**
 * Runtime state for the complete IDE workflow.
 * Provides a durable operational representation of the ideas -> plan -> execute -> approval flow.
 */
import path from 'node:path';

import { IdeasAgent } from '../agents/ideas-agent';
import { PlanningAgent } from '../agents/planning-agent';
import { PrincipalAgent } from '../agents/principal-agent';
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

export class WorkflowRuntime {
  private readonly ideasAgent = new IdeasAgent();
  private readonly planningAgent = new PlanningAgent();
  private readonly principalAgent: PrincipalAgent;
  private readonly pluginManager: PluginManager;
  private readonly promptManager: PromptManager;
  private readonly runtimeSettings: AgentRuntimeSettings;

  constructor(runtimeSettings: AgentRuntimeSettings = {
    provider: 'ollama',
    agent: 'ideas',
    language: 'typescript',
    model: 'llama3.1',
    baseUrl: 'http://localhost:11434',
    apiKey: '',
    temperature: 0.4
  }) {
    this.runtimeSettings = runtimeSettings;
    this.pluginManager = new PluginManager(path.resolve(process.cwd(), 'src/plugins'));
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

    const pluginInstances = await this.pluginManager.loadAll({
      projectPath: snapshot.rootPath,
      logger: (message: string) => console.log(`[${this.runtimeSettings.agent}] ${message}`)
    });

    pluginInstances.forEach((plugin) => this.principalAgent.registerPlugin(plugin));

    const promptContext = {
      template: this.runtimeSettings.agent,
      provider: this.runtimeSettings.provider,
      language: this.runtimeSettings.language,
      renderedPrompt: this.promptManager.render(this.runtimeSettings.agent, {
        project: snapshot.name,
        task: task.title,
        provider: this.runtimeSettings.provider,
        language: this.runtimeSettings.language,
        agent: this.runtimeSettings.agent
      })
    };

    const ideaResult = await this.ideasAgent.think(context, task);
    const planResult = await this.planningAgent.plan(context, task);
    const principalResult = await this.principalAgent.execute(context, task);

    return {
      ok: ideaResult.ok && planResult.ok && principalResult.ok,
      message: `End-to-end workflow reached the approval gate using ${this.runtimeSettings.provider} for agent ${this.runtimeSettings.agent}.`,
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        principalResult,
        approvalStatus: 'awaiting_review',
        agentRuntime: { ...this.runtimeSettings },
        availablePlugins: this.pluginManager.getDefinitions().map((plugin) => plugin.id),
        promptContext
      }
    };
  }
}
