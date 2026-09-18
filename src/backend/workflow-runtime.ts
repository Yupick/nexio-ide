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
import { LlmManager } from './llm/llm-manager';
import { PromptManager } from './llm/prompt-manager';
import type { AgentContext, AgentExecutionResult, AgentTask, ProjectSnapshot, PluginRuntimeProfile, Roadmap, StructuredChange, WorkflowEvent } from '../shared/types';
import type { LlmResponse } from './llm/types';

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

  const metadata: Record<string, string> = {
    taskId: task.id,
    agent: settings.agent,
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    snapshotHash,
    startedAt: new Date().toISOString()
  };

  const ideaSessionId = task.metadata?.ideaSessionId;
  const ideaModel = task.metadata?.ideaModel;
  if (typeof ideaSessionId === 'string' && ideaSessionId.trim()) {
    metadata.ideaSessionId = ideaSessionId;
  }
  if (typeof ideaModel === 'string' && ideaModel.trim()) {
    metadata.ideaModel = ideaModel;
  }

  return metadata;
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
  private readonly llmManager = new LlmManager();
  private readonly promptManager: PromptManager;
  private readonly runtimeSettings: AgentRuntimeSettings;
  private readonly pluginProfiles: Record<string, PluginRuntimeProfile>;

  constructor(runtimeSettings: AgentRuntimeSettings = {
    provider: 'ollama',
    agent: 'principal',
    model: 'qwen2.5-coder:0.5b',
    baseUrl: 'http://chat.nightslayer.com.ar:11434',
    apiKey: '',
    temperature: 0.4
  }, pluginProfiles: Record<string, PluginRuntimeProfile> = {}) {
    this.runtimeSettings = runtimeSettings;
    this.pluginProfiles = pluginProfiles;
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

  private async runStageLlm(stage: 'ideas' | 'planning' | 'orchestrator' | 'principal', snapshot: ProjectSnapshot, task: AgentTask, promptText: string, snapshotHash: string): Promise<{ stage: string; response: LlmResponse; }> {
    const stagePrompt = stage === 'ideas'
      ? `You are the ideas agent. Convert the user request into a safe, read-only proposal for the project and preserve the request context without returning final code directly to the user chat.`
      : stage === 'planning'
        ? `You are the planning agent. Convert the incoming proposal into structured tasks, dependencies, and execution priorities. Do not paste raw code into the chat; return a plan only.`
        : stage === 'orchestrator'
          ? `You are the orchestrator. Coordinate the plan into execution threads and delegate to the right agents. The user must not see raw code yet.`
          : `You are the principal agent. Prepare the execution patch, determine the relevant plugin, and keep the output approval-ready.`;

    const response = await this.llmManager.completeWithFallback({
      prompt: `${promptText}\n\nStage: ${stage}`,
      system: stagePrompt,
      temperature: this.runtimeSettings.temperature,
      model: this.runtimeSettings.model,
      metadata: {
        agent: stage,
        taskId: task.id,
        snapshotHash
      }
    }, [this.runtimeSettings.provider, 'ollama', 'openai', 'gemini', 'grok', 'local']);

    console.log('[workflow-runtime] stage llm response', {
      stage,
      provider: response.provider,
      model: response.metadata?.model ?? this.runtimeSettings.model,
      textPreview: String(response.text ?? '').slice(0, 220)
    });

    return { stage, response };
  }

  public async runWorkflow(snapshot: ProjectSnapshot, task: AgentTask, onEvent?: (event: WorkflowEvent) => void, isCancelled?: () => boolean): Promise<AgentExecutionResult> {
    const emit = (event: Omit<WorkflowEvent, 'taskId' | 'timestamp'>): void => {
      onEvent?.({
        ...event,
        taskId: task.id,
        timestamp: new Date().toISOString()
      });
    };

    const ensureActive = (): void => {
      if (isCancelled?.()) {
        emit({ type: 'workflow-cancelled', message: 'Workflow cancelado por el usuario.' });
        throw new Error('WORKFLOW_CANCELLED');
      }
    };

    emit({ type: 'workflow-started', message: 'Workflow iniciado.' });
    ensureActive();
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
    const snapshotHash = createHash('sha256')
      .update(JSON.stringify({
        name: snapshot.name,
        rootPath: snapshot.rootPath,
        files: [...snapshot.files].sort(),
        lastUpdated: snapshot.lastUpdated
      }))
      .digest('hex')
      .slice(0, 16);
    const llmPrompt = String(task.metadata?.prompt ?? task.title ?? 'Review the current workspace and propose the next best action.').trim();
    const stageLlmResponses: Array<Record<string, unknown>> = [];

    ensureActive();
    emit({ type: 'stage-started', stage: 'ideas', message: 'El agente de ideas está preparando la propuesta.' });
    const ideaLlm = await this.runStageLlm('ideas', snapshot, task, llmPrompt, snapshotHash);
    ensureActive();
    stageLlmResponses.push({ stage: ideaLlm.stage, provider: ideaLlm.response.provider, text: ideaLlm.response.text });
    pushAudit('llm-call', { taskId: task.id, stage: 'ideas', provider: ideaLlm.response.provider, model: ideaLlm.response.metadata?.model ?? this.runtimeSettings.model, ok: Boolean(ideaLlm.response.text) });
    emit({ type: 'stage-completed', stage: 'ideas', message: 'La propuesta de ideas está lista.', metadata: { provider: ideaLlm.response.provider } });

    const pluginInstances = await this.pluginManager.loadAll({
      projectPath: snapshot.rootPath,
      logger: (message: string) => console.log(`[${this.runtimeSettings.agent}] ${message}`)
    }, this.pluginProfiles);

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
    ensureActive();
    pushAudit('idea-generation', { taskId: task.id, ok: ideaResult.ok });

    emit({ type: 'stage-started', stage: 'planning', message: 'El agente de planificación está organizando las tareas.' });
    const planLlm = await this.runStageLlm('planning', snapshot, task, `Ideas result: ${ideaResult.message}. User request: ${llmPrompt}`, snapshotHash);
    ensureActive();
    stageLlmResponses.push({ stage: planLlm.stage, provider: planLlm.response.provider, text: planLlm.response.text });
    pushAudit('llm-call', { taskId: task.id, stage: 'planning', provider: planLlm.response.provider, model: planLlm.response.metadata?.model ?? this.runtimeSettings.model, ok: Boolean(planLlm.response.text) });
    emit({ type: 'stage-completed', stage: 'planning', message: 'El plan técnico está listo.', metadata: { provider: planLlm.response.provider } });

    const planResult = await this.planningAgent.plan(context, task);
    ensureActive();
    pushAudit('planning', { taskId: task.id, ok: planResult.ok });

    emit({ type: 'stage-started', stage: 'orchestrator', message: 'El orquestador está asignando las tareas.' });
    const orchestratorLlm = await this.runStageLlm('orchestrator', snapshot, task, `Plan summary: ${planResult.message}. User request: ${llmPrompt}`, snapshotHash);
    ensureActive();
    stageLlmResponses.push({ stage: orchestratorLlm.stage, provider: orchestratorLlm.response.provider, text: orchestratorLlm.response.text });
    pushAudit('llm-call', { taskId: task.id, stage: 'orchestrator', provider: orchestratorLlm.response.provider, model: orchestratorLlm.response.metadata?.model ?? this.runtimeSettings.model, ok: Boolean(orchestratorLlm.response.text) });
    emit({ type: 'stage-completed', stage: 'orchestrator', message: 'Las tareas fueron asignadas a los agentes disponibles.', metadata: { provider: orchestratorLlm.response.provider } });

    const orchestratorResult = await this.orchestrator.runIdeaWorkflow(snapshot, task);
    ensureActive();
    pushAudit('orchestrator', { taskId: task.id, ok: orchestratorResult.ok });

    emit({ type: 'stage-started', stage: 'principal', message: 'El agente principal está preparando los cambios.' });
    const principalLlm = await this.runStageLlm('principal', snapshot, task, `Execution plan: ${orchestratorResult.message}. User request: ${llmPrompt}`, snapshotHash);
    ensureActive();
    stageLlmResponses.push({ stage: principalLlm.stage, provider: principalLlm.response.provider, text: principalLlm.response.text });
    pushAudit('llm-call', { taskId: task.id, stage: 'principal', provider: principalLlm.response.provider, model: principalLlm.response.metadata?.model ?? this.runtimeSettings.model, ok: Boolean(principalLlm.response.text) });
    emit({ type: 'stage-completed', stage: 'principal', message: 'La ejecución quedó preparada para revisión.', metadata: { provider: principalLlm.response.provider } });

    const principalResult = await this.principalAgent.execute(context, task);
    ensureActive();
    pushAudit('principal-execution', { taskId: task.id, ok: principalResult.ok, pluginCount: principalResult.data?.executedPlugins ?? 0 });

    const executionMetadata = createExecutionMetadata(task, this.runtimeSettings, snapshot);
    const changes = Array.isArray((principalResult.data as Record<string, unknown> | undefined)?.changes)
      ? ((principalResult.data as Record<string, unknown>).changes as StructuredChange[])
      : [];
    const pendingPatch = changes.map((change) => change.patch).filter(Boolean).join('\n\n');

    const resultOk = ideaResult.ok && planResult.ok && orchestratorResult.ok && principalResult.ok;
    pushAudit('workflow-complete', { taskId: task.id, ok: resultOk });
    emit({ type: 'workflow-completed', message: resultOk ? 'Workflow completado y listo para revisión.' : 'Workflow completado con errores.' });

    return {
      ok: resultOk,
      message: `End-to-end workflow reached the approval gate using ${this.runtimeSettings.provider} for agent ${this.runtimeSettings.agent}. The system honored the ideas -> planning -> orchestrator -> principal execution chain with sequential model calls at each stage.`,
      data: {
        taskId: task.id,
        ideaResult,
        planResult,
        orchestratorResult,
        principalResult,
        executionMetadata,
        llmResponse: principalLlm.response,
        stageLlmResponses,
        approvalStatus: 'awaiting_review',
        pendingPatch,
        changes,
        agentRuntime: { ...this.runtimeSettings },
        availablePlugins: pluginInstances.map((plugin) => plugin.id),
        promptContext,
        auditTrail
      }
    };
  }
}
