import type { AgentRuntimeSettings } from './config';
import { LlmManager } from './llm/llm-manager';
import type { LlmResponse } from './llm/types';
import { createProjectSnapshot } from './project-snapshot';
import { PlanStore } from './plan-store';
import { createProjectSnapshotHash } from './snapshot-hash';
import type {
  IdeaChatMessage,
  IdeaProposal,
  PlanGenerationRequest,
  PlanGenerationResult,
  PlanRun,
  ProjectSnapshot,
  Roadmap,
  RoadmapEntry,
  TaskPriority
} from '../shared/types';

const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TASKS = 40;
const PROMPT_VERSION = 'planning-v1';

function normalizeMessages(messages: IdeaChatMessage[]): IdeaChatMessage[] {
  return messages
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'agent') && typeof entry.text === 'string')
    .map((entry) => ({ role: entry.role, text: entry.text.trim().slice(0, MAX_MESSAGE_LENGTH) }))
    .filter((entry) => entry.text.length > 0)
    .slice(-MAX_MESSAGES);
}

function createProposal(request: PlanGenerationRequest, snapshot: ProjectSnapshot, hash: string): IdeaProposal {
  const messages = normalizeMessages(request.transcript.messages);
  const userMessages = messages.filter((entry) => entry.role === 'user').map((entry) => entry.text);
  const latestRequest = userMessages.at(-1) ?? 'Revisar y mejorar el proyecto actual.';

  return {
    id: `proposal-${Date.now()}`,
    sessionId: request.sessionId,
    summary: latestRequest,
    objective: latestRequest,
    scope: [
      `Trabajar sobre el workspace ${snapshot.name}`,
      request.transcript.context?.activeFile ? `Considerar ${request.transcript.context.activeFile}` : 'Considerar el contexto del workspace'
    ],
    constraints: ['Mantener los cambios dentro del workspace', 'Requerir aprobación humana antes de aplicar diffs'],
    acceptanceCriteria: ['El resultado debe ser validable con pruebas o checks del proyecto'],
    openQuestions: [],
    transcript: {
      ...request.transcript,
      sessionId: request.sessionId,
      messages
    },
    snapshotHash: hash,
    createdAt: new Date().toISOString()
  };
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringList(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : fallback;
}

function asPriority(value: unknown): TaskPriority {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function normalizeRoadmap(value: unknown, proposal: IdeaProposal): Roadmap | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Record<string, unknown>;
  const rawTasks = Array.isArray(input.tasks) ? input.tasks : [];
  const tasks: RoadmapEntry[] = rawTasks.slice(0, MAX_TASKS).map((entry, index) => {
    const task = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const id = asString(task.id, `plan-task-${index + 1}`);
    return {
      id,
      title: asString(task.title, `Task ${index + 1}`),
      description: asString(task.description, proposal.objective),
      priority: asPriority(task.priority),
      dependencies: asStringList(task.dependencies, []),
      ...(Array.isArray(task.readPaths) ? { readPaths: asStringList(task.readPaths, []) } : {}),
      ...(Array.isArray(task.writePaths) ? { writePaths: asStringList(task.writePaths, []) } : {}),
      ...(Array.isArray(task.resourceKeys) ? { resourceKeys: asStringList(task.resourceKeys, []) } : {}),
      acceptanceCriteria: asStringList(task.acceptanceCriteria, proposal.acceptanceCriteria),
      suggestedAgent: asString(task.suggestedAgent, 'principal-agent'),
      requiredCapabilities: asStringList(task.requiredCapabilities, []),
      order: index + 1
    };
  });

  if (tasks.length === 0) {
    return null;
  }

  const ids = new Set(tasks.map((task) => task.id));
  if (ids.size !== tasks.length || tasks.some((task) => task.dependencies.some((dependency) => !ids.has(dependency)))) {
    return null;
  }

  return {
    version: asString(input.version, '1.0.0'),
    summary: asString(input.summary, proposal.summary),
    tasks
  };
}

function fallbackRoadmap(proposal: IdeaProposal): Roadmap {
  return {
    version: '1.0.0',
    summary: `Plan generado a partir de la propuesta: ${proposal.summary}`,
    tasks: [
      {
        id: `${proposal.id}-context`,
        title: 'Validar contexto y alcance',
        description: proposal.scope.join('. '),
        priority: 'high',
        dependencies: [],
        acceptanceCriteria: proposal.acceptanceCriteria,
        suggestedAgent: 'principal-agent',
        order: 1
      },
      {
        id: `${proposal.id}-implementation`,
        title: proposal.objective,
        description: proposal.objective,
        priority: 'medium',
        dependencies: [`${proposal.id}-context`],
        acceptanceCriteria: proposal.acceptanceCriteria,
        suggestedAgent: 'principal-agent',
        order: 2
      }
    ]
  };
}

function buildPlanningPrompt(proposal: IdeaProposal, snapshot: ProjectSnapshot): string {
  const transcript = proposal.transcript.messages
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Ideas'}: ${entry.text}`)
    .join('\n');

  return [
    `Project: ${snapshot.name}`,
    `Project files: ${snapshot.files.slice(0, 80).join(', ')}`,
    `Proposal summary: ${proposal.summary}`,
    `Objective: ${proposal.objective}`,
    `Scope: ${proposal.scope.join('; ')}`,
    `Constraints: ${proposal.constraints.join('; ')}`,
    `Acceptance criteria: ${proposal.acceptanceCriteria.join('; ')}`,
    `Conversation transcript:\n${transcript}`,
    'Return only JSON with this shape: {"version":"1.0.0","summary":"...","tasks":[{"id":"...","title":"...","description":"...","priority":"low|medium|high","dependencies":[],"acceptanceCriteria":[],"suggestedAgent":"principal-agent"}]}'
  ].join('\n\n');
}

export class PlanService {
  public constructor(private readonly llmManager: Pick<LlmManager, 'completeWithFallback'> = new LlmManager()) {}

  public async generatePlan(
    request: PlanGenerationRequest,
    workspaceRoot: string,
    runtimeSettings: AgentRuntimeSettings
  ): Promise<PlanGenerationResult> {
    const sessionId = request.sessionId?.trim();
    const messages = normalizeMessages(request.transcript?.messages ?? []);
    if (!sessionId || messages.length === 0) {
      return { ok: false, message: 'Plan generation requires a session id and a non-empty transcript.' };
    }

    const snapshot = createProjectSnapshot(workspaceRoot);
    const hash = createProjectSnapshotHash(snapshot);
    const proposal = createProposal({ ...request, sessionId, transcript: { ...request.transcript, sessionId, messages } }, snapshot, hash);
    const store = new PlanStore(workspaceRoot);
    const parentPlan = request.parentPlanId ? store.get(request.parentPlanId) : store.getLatestForSession(sessionId);
    const revision = (parentPlan?.revision ?? 0) + 1;
    const planId = `plan-${sessionId}-${revision}-${Date.now()}`;
    const basePlan: PlanRun = {
      planId,
      sessionId,
      revision,
      ...(parentPlan ? { parentPlanId: parentPlan.planId, supersedesPlanId: parentPlan.planId } : {}),
      ...(request.sourceMessageIds?.length ? { sourceMessageIds: [...request.sourceMessageIds] } : {}),
      status: 'generating',
      proposal,
      snapshotHash: hash,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    store.save(basePlan);

    const settings = request.settings ?? {};
    const model = settings.model?.trim() || runtimeSettings.model;
    const provider = settings.provider || runtimeSettings.provider;
    let response: LlmResponse;

    try {
      response = await this.llmManager.completeWithFallback({
        prompt: buildPlanningPrompt(proposal, snapshot),
        system: 'You are the Planning Agent. Convert the Ideas proposal into a valid JSON roadmap. Do not execute tasks, call plugins, write files, or return markdown outside the JSON object.',
        temperature: settings.temperature ?? runtimeSettings.temperature,
        model,
        metadata: { agent: 'planning', taskId: planId, snapshotHash: hash }
      }, [provider, 'ollama', 'openai', 'gemini', 'grok', 'local']);
    } catch (error) {
      const failedPlan: PlanRun = {
        ...basePlan,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        metadata: { provider, model, promptVersion: PROMPT_VERSION, error: error instanceof Error ? error.message : 'Planning provider failed.' }
      };
      store.save(failedPlan);
      return { ok: false, message: failedPlan.metadata?.error ?? 'Planning provider failed.', data: { plan: failedPlan, message: failedPlan.metadata?.error ?? 'Planning provider failed.' } };
    }

    const parsedRoadmap = normalizeRoadmap(parseJson(response.text), proposal) ?? fallbackRoadmap(proposal);
    const plan: PlanRun = {
      ...basePlan,
      status: 'ready',
      roadmap: parsedRoadmap,
      updatedAt: new Date().toISOString(),
      metadata: {
        provider: response.metadata?.provider || response.provider,
        model: response.metadata?.model || model,
        promptVersion: PROMPT_VERSION,
        ...(parseJson(response.text) ? {} : { warnings: ['El modelo no devolvió JSON válido; se utilizó un roadmap seguro de respaldo.'] })
      }
    };
    store.save(plan);

    return {
      ok: true,
      message: 'Plan generado y validado a partir de la conversación de Ideas.',
      data: { plan, message: 'Plan generado y validado a partir de la conversación de Ideas.' }
    };
  }

  public getPlan(planId: string, workspaceRoot: string): PlanRun | undefined {
    return new PlanStore(workspaceRoot).get(planId);
  }
}