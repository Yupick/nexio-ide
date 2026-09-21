import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AgentOrchestrator } from '../../src/backend/orchestrator';
import { PlanService } from '../../src/backend/plan-service';
import { createProjectSnapshot } from '../../src/backend/project-snapshot';
import { createProjectSnapshotHash } from '../../src/backend/snapshot-hash';
import type { PlanGenerationRequest } from '../../src/shared/types';

const runtimeSettings = {
  provider: 'local' as const,
  agent: 'planning' as const,
  model: 'local-model',
  baseUrl: 'http://localhost',
  apiKey: '',
  temperature: 0.2
};

function createWorkspace(): string {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexio-plan-'));
  fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'src', 'app.ts'), 'export const app = true;\n', 'utf8');
  return workspaceRoot;
}

function createRequest(): PlanGenerationRequest {
  return {
    sessionId: 'session-plan-1',
    transcript: {
      sessionId: 'session-plan-1',
      messages: [
        { role: 'user', text: 'Quiero añadir validación al formulario.' },
        { role: 'agent', text: 'Podemos revisar el flujo de entrada y sus pruebas.' },
        { role: 'user', text: 'Genera un plan con implementación y tests.' }
      ],
      context: { activeFile: 'src/app.ts', activeFileContent: 'export const app = true;' }
    },
    settings: { provider: 'local', model: 'local-model' }
  };
}

describe('plan service and orchestrator handoff', () => {
  test('passes the Ideas transcript to Planning and persists a validated roadmap', async () => {
    const workspaceRoot = createWorkspace();
    const completeWithFallback = jest.fn().mockResolvedValue({
      provider: 'local',
      text: JSON.stringify({
        version: '1.0.0',
        summary: 'Plan de validación',
        tasks: [{
          id: 'validate-form',
          title: 'Validar formulario',
          description: 'Añadir validación y pruebas.',
          priority: 'high',
          dependencies: [],
          acceptanceCriteria: ['Las entradas inválidas muestran errores.'],
          suggestedAgent: 'testing-plugin'
        }]
      }),
      metadata: { provider: 'local', model: 'local-model' }
    });

    const result = await new PlanService({ completeWithFallback }).generatePlan(
      createRequest(),
      workspaceRoot,
      runtimeSettings
    );

    expect(result.ok).toBe(true);
    expect(result.data?.plan.status).toBe('ready');
    expect(result.data?.plan.roadmap?.tasks[0]).toMatchObject({
      id: 'validate-form',
      suggestedAgent: 'testing-plugin',
      acceptanceCriteria: ['Las entradas inválidas muestran errores.']
    });
    expect(completeWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ agent: 'planning' }),
        prompt: expect.any(String)
      }),
      expect.any(Array)
    );
    const planningPrompt = String(completeWithFallback.mock.calls[0][0].prompt);
    expect(planningPrompt).toContain('Quiero añadir validación');
    expect(planningPrompt).toContain('Genera un plan con implementación y tests.');
    expect(planningPrompt).toContain('src/app.ts');
    expect(completeWithFallback.mock.calls[0][1]).toEqual(expect.arrayContaining(['local', 'ollama']));

    const persisted = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.nexio', 'plan-runs.json'), 'utf8'));
    expect(persisted[0]).toMatchObject({
      planId: result.data?.plan.planId,
      sessionId: 'session-plan-1',
      status: 'ready'
    });
  });

  test('uses a safe fallback roadmap when the provider does not return JSON', async () => {
    const workspaceRoot = createWorkspace();
    const result = await new PlanService({
      completeWithFallback: jest.fn().mockResolvedValue({
        provider: 'local',
        text: 'No puedo devolver JSON',
        metadata: { provider: 'local', model: 'local-model' }
      })
    }).generatePlan(createRequest(), workspaceRoot, runtimeSettings);

    expect(result.ok).toBe(true);
    expect(result.data?.plan.metadata?.warnings).toEqual([
      'El modelo no devolvió JSON válido; se utilizó un roadmap seguro de respaldo.'
    ]);
    expect(result.data?.plan.roadmap?.tasks.length).toBeGreaterThan(0);
  });

  test('creates a new linked revision from the previous plan in the same session', async () => {
    const workspaceRoot = createWorkspace();
    const completeWithFallback = jest.fn().mockResolvedValue({
      provider: 'local',
      text: JSON.stringify({
        version: '1.0.0',
        summary: 'Plan revisado',
        tasks: [{ id: 'task-revised', title: 'Aplicar revisión', description: 'Aplicar la nueva intención.', priority: 'medium', dependencies: [] }]
      }),
      metadata: { provider: 'local', model: 'local-model' }
    });
    const service = new PlanService({ completeWithFallback });
    const first = await service.generatePlan(createRequest(), workspaceRoot, runtimeSettings);
    const second = await service.generatePlan({
      ...createRequest(),
      parentPlanId: first.data?.plan.planId,
      transcript: {
        ...createRequest().transcript,
        messages: [...createRequest().transcript.messages, { role: 'user', text: 'Añade también una prueba de regresión.' }]
      },
      sourceMessageIds: ['message-1', 'message-2', 'message-3', 'message-4']
    }, workspaceRoot, runtimeSettings);

    expect(first.data?.plan.revision).toBe(1);
    expect(second.data?.plan).toMatchObject({
      revision: 2,
      parentPlanId: first.data?.plan.planId,
      supersedesPlanId: first.data?.plan.planId,
      sourceMessageIds: ['message-1', 'message-2', 'message-3', 'message-4']
    });
    expect(second.data?.plan.planId).not.toBe(first.data?.plan.planId);
    expect(new Set(JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.nexio', 'plan-runs.json'), 'utf8')).map((plan: { planId: string }) => plan.planId))).toEqual(new Set([first.data?.plan.planId, second.data?.plan.planId]));
  });

  test('orchestrator consumes the validated roadmap and rejects stale snapshots', () => {
    const workspaceRoot = createWorkspace();
    const snapshot = createProjectSnapshot(workspaceRoot);
    const orchestrator = new AgentOrchestrator();
    const roadmap = {
      version: '1.0.0',
      summary: 'Plan listo',
      tasks: [{
        id: 'task-1',
        title: 'Ejecutar validación',
        description: 'Ejecutar pruebas.',
        priority: 'high' as const,
        dependencies: [],
        acceptanceCriteria: ['Las pruebas pasan.'],
        suggestedAgent: 'testing-plugin'
      }]
    };

    const staleResult = orchestrator.runPlan(snapshot, {
      planId: 'plan-1',
      snapshotHash: 'stale-hash',
      roadmap
    });

    expect(staleResult.ok).toBe(false);
    expect(staleResult.message).toContain('obsoleto');

    const result = orchestrator.runPlan(snapshot, {
      planId: 'plan-1',
      snapshotHash: createProjectSnapshotHash(snapshot),
      roadmap
    });

    expect(result.ok).toBe(true);
    const executionThreads = result.data?.executionThreads as Array<Record<string, unknown>> | undefined;
    expect(executionThreads?.[0]).toMatchObject({
      planId: 'plan-1',
      id: 'task-1',
      delegateTo: 'testing-plugin'
    });
  });

  test('blocks dependent tasks after an upstream task fails', () => {
    const workspaceRoot = createWorkspace();
    const snapshot = createProjectSnapshot(workspaceRoot);
    const orchestrator = new AgentOrchestrator();
    let run = orchestrator.createWorkflowRun(snapshot, {
      planId: 'plan-blocked',
      snapshotHash: createProjectSnapshotHash(snapshot),
      roadmap: {
        version: '1.0.0',
        summary: 'Blocked plan',
        tasks: [
          { id: 'first', title: 'First', description: '', priority: 'high', dependencies: [] },
          { id: 'second', title: 'Second', description: '', priority: 'medium', dependencies: ['first'] }
        ]
      }
    }, 1, 1);
    run = orchestrator.markTaskRunning(run, 'first');
    run = orchestrator.markTaskResult(run, 'first', false, { error: 'plugin failed' });
    run = orchestrator.blockTasksWithFailedDependencies(run);

    expect(run.tasks.find((task) => task.taskId === 'second')).toMatchObject({
      status: 'blocked',
      result: { blockedBy: ['first'] }
    });
  });

  test('retries a failed task only within the confirmed run limits', () => {
    const workspaceRoot = createWorkspace();
    const snapshot = createProjectSnapshot(workspaceRoot);
    const orchestrator = new AgentOrchestrator();
    let run = orchestrator.createWorkflowRun(snapshot, {
      planId: 'plan-retry',
      snapshotHash: createProjectSnapshotHash(snapshot),
      roadmap: {
        version: '1.0.0',
        summary: 'Retry plan',
        tasks: [{ id: 'retry-task', title: 'Retry', description: '', priority: 'medium', dependencies: [] }]
      }
    }, 2, 3);
    run = orchestrator.markTaskRunning(run, 'retry-task');
    run = orchestrator.markTaskResult(run, 'retry-task', false, { error: 'temporary failure' });
    const retried = orchestrator.retryTask(run, 'retry-task');

    expect(retried).toMatchObject({ status: 'paused' });
    expect(retried.tasks[0]).toMatchObject({ status: 'ready', attempt: 1 });
  });

  test('renews the lease and heartbeat of a running task', () => {
    const workspaceRoot = createWorkspace();
    const snapshot = createProjectSnapshot(workspaceRoot);
    const orchestrator = new AgentOrchestrator();
    let run = orchestrator.createWorkflowRun(snapshot, {
      planId: 'plan-heartbeat',
      snapshotHash: createProjectSnapshotHash(snapshot),
      roadmap: { version: '1.0.0', summary: 'Heartbeat plan', tasks: [{ id: 'heartbeat-task', title: 'Heartbeat', description: '', priority: 'medium', dependencies: [] }] }
    }, 1);
    run = orchestrator.markTaskRunning(run, 'heartbeat-task');
    const renewed = orchestrator.renewTaskLease(run, 'heartbeat-task', 120_000);

    expect(renewed.tasks[0]).toMatchObject({
      status: 'running',
      leaseId: run.tasks[0].leaseId,
      heartbeatAt: expect.any(String)
    });
    expect(new Date(renewed.tasks[0].leaseExpiresAt as string).getTime()).toBeGreaterThan(new Date(run.tasks[0].leaseExpiresAt as string).getTime());
  });
});
