/**
 * Runtime state for the complete IDE workflow.
 * Provides a durable operational representation of the ideas -> plan -> execute -> approval flow.
 */
import fs from 'node:fs';
import path from 'node:path';

import { PrincipalAgent } from '../agents/principal-agent';
import { AgentOrchestrator } from './orchestrator';
import type { AgentRuntimeSettings } from './config';
import { PluginManager } from './plugin-manager';
import { hasDeclaredResources, ResourceLockManager, resourcesConflict } from './resource-lock-manager';
import { createProjectSnapshotHash } from './snapshot-hash';
import { WorkflowRunStore } from './workflow-run-store';
import { WorkflowEventStore } from './workflow-event-store';
import type { AgentContext, AgentExecutionResult, AgentTask, OrchestrationInput, PlanRun, ProjectSnapshot, PluginRuntimeProfile, ResourceContract, StructuredChange, WorkflowEvent, WorkflowTaskState } from '../shared/types';

export type ApprovalStatus = 'awaiting_review' | 'approved' | 'rejected';

export interface WorkflowState {
  id: string;
  title: string;
  approvalStatus: ApprovalStatus;
  createdAt: string;
}

function getTaskResources(task: Pick<WorkflowTaskState, 'readPaths' | 'writePaths' | 'resourceKeys'>): ResourceContract {
  return {
    ...(task.readPaths ? { readPaths: [...task.readPaths] } : {}),
    ...(task.writePaths ? { writePaths: [...task.writePaths] } : {}),
    ...(task.resourceKeys ? { resourceKeys: [...task.resourceKeys] } : {})
  };
}

function selectRunnableBatch(tasks: WorkflowTaskState[]): WorkflowTaskState[] {
  const selected: WorkflowTaskState[] = [];
  for (const task of tasks) {
    const resources = getTaskResources(task);
    if (!hasDeclaredResources(resources)) {
      return selected.length > 0 ? selected : [task];
    }
    if (selected.every((selectedTask) => !resourcesConflict(getTaskResources(selectedTask), resources))) {
      selected.push(task);
    }
  }
  return selected.length > 0 ? selected : tasks.slice(0, 1);
}

export class WorkflowRuntime {
  private readonly orchestrator = new AgentOrchestrator();
  private readonly principalAgent: PrincipalAgent;
  private readonly pluginManager: PluginManager;
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

  public async runPlanWorkflow(
    snapshot: ProjectSnapshot,
    plan: PlanRun,
    onEvent?: (event: WorkflowEvent) => void,
    isCancelled?: () => boolean,
    requestedRunId?: string,
    isPaused?: () => boolean
  ): Promise<AgentExecutionResult> {
    const runId = requestedRunId || `run-${plan.planId}-${Date.now()}`;
    const eventStore = new WorkflowEventStore(snapshot.rootPath);
    const emit = (event: Omit<WorkflowEvent, 'taskId' | 'timestamp'>, taskId = runId): void => {
      const workflowEvent: WorkflowEvent = {
        ...event,
        taskId,
        timestamp: new Date().toISOString()
      };
      eventStore.append(workflowEvent, {
        planId: plan.planId,
        planRevision: plan.revision,
        runId,
        pluginId: typeof event.metadata?.pluginId === 'string' ? event.metadata.pluginId : undefined,
        status: typeof event.metadata?.status === 'string' ? event.metadata.status : undefined
      });
      onEvent?.(workflowEvent);
    };
    const ensureActive = (): void => {
      if (isCancelled?.()) {
        emit({ type: 'workflow-cancelled', message: 'Workflow cancelado por el usuario.' });
        throw new Error('WORKFLOW_CANCELLED');
      }
    };

    if (!plan.roadmap || (plan.status !== 'ready' && plan.status !== 'handed_off')) {
      return { ok: false, message: 'El plan no está listo para ejecución.', data: { planId: plan.planId, status: plan.status } };
    }

    const currentSnapshotHash = createProjectSnapshotHash(snapshot);
    if (currentSnapshotHash !== plan.snapshotHash) {
      return {
        ok: false,
        message: 'El snapshot del plan está obsoleto; genera el plan nuevamente antes de ejecutarlo.',
        data: { planId: plan.planId, expectedSnapshotHash: plan.snapshotHash, currentSnapshotHash }
      };
    }

    emit({ type: 'workflow-started', message: `Ejecución del plan ${plan.planId} iniciada.` });
    ensureActive();
    const orchestration = this.orchestrator.runPlan(snapshot, {
      planId: plan.planId,
      snapshotHash: plan.snapshotHash,
      roadmap: plan.roadmap
    } satisfies OrchestrationInput);
    if (!orchestration.ok) {
      return orchestration;
    }

    const runStore = new WorkflowRunStore(snapshot.rootPath);
    runStore.recoverExpiredLeases();
    let workflowRun = runStore.get(runId) ?? this.orchestrator.createWorkflowRun(snapshot, {
      planId: plan.planId,
      snapshotHash: plan.snapshotHash,
      roadmap: plan.roadmap
    }, plan.revision, 3, runId);
    workflowRun = { ...workflowRun, status: 'running', updatedAt: new Date().toISOString() };
    runStore.save(workflowRun);

    const context: AgentContext = {
      snapshot,
      roadmap: plan.roadmap,
      sandbox: { allowedRoots: [snapshot.rootPath], readOnly: true }
    };
    const pluginInstances = await this.pluginManager.loadAll({
      projectPath: snapshot.rootPath,
      logger: (message: string) => console.log(`[${this.runtimeSettings.agent}] ${message}`)
    }, this.pluginProfiles);
    pluginInstances.forEach((plugin) => this.principalAgent.registerPlugin(plugin));

    const taskResults: Array<Record<string, unknown>> = workflowRun.tasks
      .filter((task) => task.status === 'succeeded' || task.status === 'failed' || task.status === 'blocked')
      .map((task) => ({
        taskId: task.taskId,
        title: task.title,
        ok: task.status === 'succeeded',
        message: typeof task.result?.message === 'string' ? task.result.message : `Tarea ${task.status}.`,
        ...(task.result ? { result: task.result } : {})
      }));
    const changes: StructuredChange[] = [];
    const resourceLocks = new ResourceLockManager();

    while (true) {
      if (isPaused?.()) {
        workflowRun = { ...workflowRun, status: 'paused', updatedAt: new Date().toISOString() };
        runStore.save(workflowRun);
        emit({ type: 'workflow-paused', message: `Plan ${plan.planId} pausado.` });
        return {
          ok: false,
          message: `Plan ${plan.planId} pausado y persistido para reanudarlo.`,
          data: { planId: plan.planId, runId, workflowRun, status: 'paused' }
        };
      }
      const runnableTasks = this.orchestrator.getRunnableTasks(workflowRun);
      if (runnableTasks.length === 0) {
        break;
      }

      const runnableBatch = selectRunnableBatch(runnableTasks);
      for (const taskState of runnableBatch) {
        ensureActive();
        workflowRun = this.orchestrator.markTaskRunning(workflowRun, taskState.taskId);
        runStore.save(workflowRun);
      }

      const executions = await Promise.all(runnableBatch.map(async (taskState) => {
        const taskId = taskState.taskId;
        const task: AgentTask = {
          id: taskId,
          title: taskState.title,
          description: taskState.description,
          priority: taskState.priority,
          dependencies: [...taskState.dependencies],
          ...(taskState.readPaths ? { readPaths: [...taskState.readPaths] } : {}),
          ...(taskState.writePaths ? { writePaths: [...taskState.writePaths] } : {}),
          ...(taskState.resourceKeys ? { resourceKeys: [...taskState.resourceKeys] } : {}),
          metadata: {
            planId: plan.planId,
            runId,
            suggestedAgent: taskState.pluginId,
            requiredCapabilities: taskState.requiredCapabilities,
            acceptanceCriteria: taskState.acceptanceCriteria,
            ...(taskState.readPaths ? { readPaths: [...taskState.readPaths] } : {}),
            ...(taskState.writePaths ? { writePaths: [...taskState.writePaths] } : {}),
            ...(taskState.resourceKeys ? { resourceKeys: [...taskState.resourceKeys] } : {})
          }
        };
        emit({ type: 'stage-started', stage: 'principal', message: `Ejecutando tarea planificada: ${task.title}.` }, taskId);
        let lease;
        try {
          const resources = getTaskResources(taskState);
          if (hasDeclaredResources(resources)) {
            lease = await resourceLocks.acquire(taskId, resources);
          }
          ensureActive();
          const result = await this.principalAgent.execute(context, task);
          ensureActive();
          return { taskState, task, result };
        } catch (error) {
          if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') {
            return { taskState, task, cancelled: true as const };
          }
          return {
            taskState,
            task,
            result: {
              ok: false,
              message: error instanceof Error ? error.message : 'La tarea falló durante la ejecución.',
              data: { taskId, resourceLock: true, retryable: true }
            }
          };
        } finally {
          lease?.release();
        }
      }));

      if (executions.some((execution) => execution.cancelled)) {
        throw new Error('WORKFLOW_CANCELLED');
      }

      for (const execution of executions) {
        const result = execution.result as AgentExecutionResult;
        const resultData = result.data && typeof result.data === 'object' ? result.data as Record<string, unknown> : {};
        const nestedResults = Array.isArray(resultData.results) ? resultData.results : [];
        const blocked = resultData.blocked === true || nestedResults.some((entry) => {
          if (!entry || typeof entry !== 'object') {
            return false;
          }
          const nestedData = (entry as Record<string, unknown>).data;
          return Boolean(nestedData && typeof nestedData === 'object' && (nestedData as Record<string, unknown>).blocked === true);
        });
        const taskChanges = Array.isArray(resultData.changes)
          ? resultData.changes.filter((change): change is StructuredChange => Boolean(change && typeof change === 'object' && typeof (change as Record<string, unknown>).targetPath === 'string' && typeof (change as Record<string, unknown>).patch === 'string'))
          : [];
        changes.push(...taskChanges);
        taskResults.push({ taskId: execution.task.id, title: execution.task.title, ok: result.ok, message: result.message, changes: taskChanges });
        workflowRun = this.orchestrator.markTaskResult(workflowRun, execution.task.id, result.ok, {
          ...resultData,
          message: result.message,
          ...(blocked ? { blocked: true } : {})
        });
        runStore.save(workflowRun);
        emit({ type: 'stage-completed', stage: 'principal', message: `Tarea planificada preparada para revisión: ${execution.task.title}.` }, execution.task.id);
      }
    }

    workflowRun = this.orchestrator.blockTasksWithFailedDependencies(workflowRun);
    runStore.save(workflowRun);
    const hasBlockedTask = workflowRun.tasks.some((task) => task.status === 'blocked' || task.status === 'failed');
    const hasPendingTask = workflowRun.tasks.some((task) => ['pending', 'ready', 'retryable', 'running'].includes(task.status));
    workflowRun = {
      ...workflowRun,
      status: hasBlockedTask || hasPendingTask ? 'blocked' : 'awaiting_review',
      updatedAt: new Date().toISOString()
    };
    runStore.save(workflowRun);
    emit({ type: 'workflow-completed', message: `Plan ${plan.planId} completado y listo para revisión.` });
    return {
      ok: !hasBlockedTask && !hasPendingTask && taskResults.every((result) => result.ok),
      message: `El plan ${plan.planId} fue ejecutado sin regenerar Ideas ni Planificación y quedó listo para aprobación.`,
      data: {
        planId: plan.planId,
        runId,
        orchestration,
        workflowRun,
        taskResults,
        changes,
        pendingPatch: changes.map((change) => change.patch).join('\n\n'),
        approvalStatus: 'awaiting_review',
        availablePlugins: pluginInstances.map((plugin) => plugin.id),
        executionMetadata: {
          taskId: runId,
          planId: plan.planId,
          agent: this.runtimeSettings.agent,
          provider: this.runtimeSettings.provider,
          model: this.runtimeSettings.model,
          snapshotHash: plan.snapshotHash,
          startedAt: new Date().toISOString()
        }
      }
    };
  }

}
