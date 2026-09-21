/**
 * Orchestrator that coordinates the ideas -> planning -> execution flow.
 * The user only interacts with the ideas agent; the planning agent restructures the
 * problem into phases, milestones and execution groups, and the orchestrator then
 * splits the work across the downstream agents.
 */
import { validateRoadmap } from './roadmap-validator';
import { createProjectSnapshotHash } from './snapshot-hash';
import type { AgentExecutionResult, OrchestrationInput, ProjectSnapshot, Roadmap, WorkflowRun, WorkflowTaskState } from '../shared/types';

export class AgentOrchestrator {
  public createWorkflowRun(snapshot: ProjectSnapshot, input: OrchestrationInput, planRevision: number, maxAttempts = 3, requestedRunId?: string): WorkflowRun {
    const validation = validateRoadmap(input.roadmap);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const now = new Date().toISOString();
    const tasks: WorkflowTaskState[] = input.roadmap.tasks.map((entry) => ({
      taskId: entry.id,
      planId: input.planId,
      planRevision,
      title: entry.title,
      description: entry.description,
      dependencies: [...entry.dependencies],
      ...(entry.readPaths ? { readPaths: [...entry.readPaths] } : {}),
      ...(entry.writePaths ? { writePaths: [...entry.writePaths] } : {}),
      ...(entry.resourceKeys ? { resourceKeys: [...entry.resourceKeys] } : {}),
      priority: entry.priority,
      acceptanceCriteria: [...(entry.acceptanceCriteria ?? [])],
      ...(entry.suggestedAgent ? { pluginId: entry.suggestedAgent } : {}),
      requiredCapabilities: [...(entry.requiredCapabilities ?? [])],
      status: entry.dependencies.length === 0 ? 'ready' : 'pending',
      attempt: 0,
      maxAttempts,
      updatedAt: now
    }));

    return {
      runId: requestedRunId || `run-${input.planId}-${Date.now()}`,
      planId: input.planId,
      planRevision,
      snapshotHash: input.snapshotHash,
      status: 'pending',
      tasks,
      createdAt: now,
      updatedAt: now
    };
  }

  public getRunnableTasks(run: WorkflowRun): WorkflowTaskState[] {
    const completed = new Set(run.tasks.filter((task) => task.status === 'succeeded').map((task) => task.taskId));
    return run.tasks.filter((task) => (
      (task.status === 'pending' || task.status === 'ready' || task.status === 'retryable')
      && task.dependencies.every((dependency) => completed.has(dependency))
    ));
  }

  public markTaskRunning(run: WorkflowRun, taskId: string, leaseMs = 60_000): WorkflowRun {
    const now = new Date();
    const leaseId = `lease-${run.runId}-${taskId}-${Date.now()}`;
    return this.updateTask(run, taskId, (task) => ({
      ...task,
      status: 'running',
      attempt: task.attempt + 1,
      leaseId,
      leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      heartbeatAt: now.toISOString(),
      updatedAt: now.toISOString()
    }), 'running');
  }

  public renewTaskLease(run: WorkflowRun, taskId: string, leaseMs = 60_000): WorkflowRun {
    const now = new Date();
    return this.updateTask(run, taskId, (task) => {
      if (task.status !== 'running' || !task.leaseId) {
        throw new Error(`La tarea ${taskId} no tiene un lease activo.`);
      }
      return {
        ...task,
        leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
        heartbeatAt: now.toISOString(),
        updatedAt: now.toISOString()
      };
    }, run.status);
  }

  public markTaskResult(run: WorkflowRun, taskId: string, ok: boolean, result: Record<string, unknown>): WorkflowRun {
    const now = new Date().toISOString();
    return this.updateTask(run, taskId, (task) => {
      const blocked = result.blocked === true;
      const retryable = !ok && !blocked && task.attempt < task.maxAttempts;
      return {
        ...task,
        status: blocked ? 'blocked' : ok ? 'succeeded' : retryable ? 'retryable' : 'failed',
        leaseId: undefined,
        leaseExpiresAt: undefined,
        heartbeatAt: undefined,
        result,
        updatedAt: now
      };
    }, run.status);
  }

  public retryTask(run: WorkflowRun, taskId: string): WorkflowRun {
    const task = run.tasks.find((entry) => entry.taskId === taskId);
    if (!task || !['failed', 'retryable', 'blocked'].includes(task.status)) {
      throw new Error(`La tarea ${taskId} no está disponible para reintento.`);
    }
    if (task.attempt >= task.maxAttempts) {
      throw new Error(`La tarea ${taskId} alcanzó el máximo de intentos.`);
    }

    const completed = new Set(run.tasks.filter((entry) => entry.status === 'succeeded').map((entry) => entry.taskId));
    const status = task.dependencies.every((dependency) => completed.has(dependency)) ? 'ready' : 'pending';
    return this.updateTask(run, taskId, (entry) => ({
      ...entry,
      status,
      result: undefined,
      leaseId: undefined,
      leaseExpiresAt: undefined,
      updatedAt: new Date().toISOString()
    }), 'paused');
  }

  public blockTasksWithFailedDependencies(run: WorkflowRun): WorkflowRun {
    const failed = new Set(run.tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').map((task) => task.taskId));
    if (failed.size === 0) {
      return run;
    }

    const now = new Date().toISOString();
    const tasks = run.tasks.map((task) => {
      if (!['pending', 'ready', 'retryable'].includes(task.status) || !task.dependencies.some((dependency) => failed.has(dependency))) {
        return task;
      }
      return {
        ...task,
        status: 'blocked' as const,
        result: { blockedBy: task.dependencies.filter((dependency) => failed.has(dependency)) },
        updatedAt: now
      };
    });

    return { ...run, tasks, updatedAt: now };
  }

  private updateTask(run: WorkflowRun, taskId: string, update: (task: WorkflowTaskState) => WorkflowTaskState, status: WorkflowRun['status']): WorkflowRun {
    const tasks = run.tasks.map((task) => task.taskId === taskId ? update(task) : task);
    return { ...run, status, tasks, updatedAt: new Date().toISOString() };
  }

  public runPlan(snapshot: ProjectSnapshot, input: OrchestrationInput): AgentExecutionResult {
    const currentSnapshotHash = createProjectSnapshotHash(snapshot);
    if (currentSnapshotHash !== input.snapshotHash) {
      return {
        ok: false,
        message: 'El snapshot del plan está obsoleto; genera el plan nuevamente antes de enviarlo al orquestador.',
        data: {
          planId: input.planId,
          expectedSnapshotHash: input.snapshotHash,
          currentSnapshotHash
        }
      };
    }

    const roadmap = input.roadmap;
    const executionThreads = roadmap.tasks.map((entry, index) => ({
      id: entry.id,
      planId: input.planId,
      title: entry.title,
      description: entry.description,
      order: entry.order ?? index + 1,
      owner: 'orchestrator',
      delegateTo: entry.suggestedAgent || 'principal-agent',
      status: 'pending',
      dependencies: [...entry.dependencies],
      priority: entry.priority,
      acceptanceCriteria: [...(entry.acceptanceCriteria ?? [])],
      createdAt: new Date().toISOString()
    }));

    return {
      ok: true,
      message: 'El orquestador recibió el roadmap validado sin volver a ejecutar Ideas ni Planificación.',
      data: {
        planId: input.planId,
        snapshotHash: input.snapshotHash,
        roadmap,
        executionThreads,
        stage: 'orchestrated'
      }
    };
  }

}
