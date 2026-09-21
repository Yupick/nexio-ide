import { WorkflowRuntime } from '../../src/backend/workflow-runtime';
import { PrincipalAgent } from '../../src/agents/principal-agent';
import { createProjectSnapshotHash } from '../../src/backend/snapshot-hash';
import { WorkflowEventStore } from '../../src/backend/workflow-event-store';
import type { PlanRun, ProjectSnapshot, RoadmapEntry, WorkflowEvent } from '../../src/shared/types';

function createSnapshot(): ProjectSnapshot {
  return {
    name: 'nexio-ide',
    rootPath: process.cwd(),
    files: ['src/ui/index.html'],
    lastUpdated: '2026-09-10T00:00:00Z'
  };
}

function createPlan(snapshot: ProjectSnapshot, status: PlanRun['status'] = 'handed_off', tasks?: RoadmapEntry[]): PlanRun {
  const snapshotHash = createProjectSnapshotHash(snapshot);
  return {
    planId: 'plan-runtime-001',
    sessionId: 'session-runtime-001',
    revision: 1,
    status,
    proposal: {
      id: 'proposal-runtime-001',
      sessionId: 'session-runtime-001',
      summary: 'Preparar validación',
      objective: 'Preparar validación',
      scope: ['workspace'],
      constraints: [],
      acceptanceCriteria: ['La validación termina correctamente.'],
      openQuestions: [],
      transcript: { sessionId: 'session-runtime-001', messages: [{ role: 'user', text: 'Preparar validación' }] },
      snapshotHash,
      createdAt: new Date().toISOString()
    },
    snapshotHash,
    roadmap: {
      version: '1.0.0',
      summary: 'Plan de validación',
      tasks: tasks ?? [{
        id: 'runtime-task-1',
        title: 'Validar ejecución',
        description: 'Ejecutar la validación del plan.',
        priority: 'high',
        dependencies: [],
        acceptanceCriteria: ['La validación termina correctamente.'],
        suggestedAgent: 'testing-plugin'
      }]
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

describe('workflow runtime', () => {
  test('keeps approval state transitions independent from plan execution', () => {
    const runtime = new WorkflowRuntime();
    const state = runtime.createState('task-approve', 'Test approval flow');

    runtime.setApprovalState(state, 'approved');
    expect(state.approvalStatus).toBe('approved');
    runtime.setApprovalState(state, 'rejected');
    expect(state.approvalStatus).toBe('rejected');
  });

  test('executes a handed-off plan without regenerating Ideas or Planning', async () => {
    const ideasSpy = jest.spyOn((require('../../src/agents/ideas-agent') as typeof import('../../src/agents/ideas-agent')).IdeasAgent.prototype, 'think');
    const planningSpy = jest.spyOn((require('../../src/agents/planning-agent') as typeof import('../../src/agents/planning-agent')).PlanningAgent.prototype, 'plan');
    const runtime = new WorkflowRuntime({
      provider: 'local',
      agent: 'principal',
      model: 'local-model',
      baseUrl: 'http://localhost',
      apiKey: '',
      temperature: 0.2
    });
    const snapshot = createSnapshot();
    const events: string[] = [];
    const runId = `run-plan-runtime-${Date.now()}`;
    const result = await runtime.runPlanWorkflow(snapshot, createPlan(snapshot), (event: WorkflowEvent) => events.push(`${event.taskId}:${event.type}`), undefined, runId);

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ planId: 'plan-runtime-001', runId });
    expect((result.data as any)?.taskResults[0]).toMatchObject({ taskId: 'runtime-task-1', ok: true });
    expect(events[0]).toBe(`${runId}:workflow-started`);
    expect(ideasSpy).not.toHaveBeenCalled();
    expect(planningSpy).not.toHaveBeenCalled();
    expect(new WorkflowEventStore(snapshot.rootPath).list({ runId }).map((event) => event.type)).toEqual(expect.arrayContaining(['workflow-started', 'stage-started', 'stage-completed', 'workflow-completed']));
    ideasSpy.mockRestore();
    planningSpy.mockRestore();
  });

  test('persists a paused run when pause is requested before task dispatch', async () => {
    const runtime = new WorkflowRuntime({
      provider: 'local',
      agent: 'principal',
      model: 'local-model',
      baseUrl: 'http://localhost',
      apiKey: '',
      temperature: 0.2
    });
    const snapshot = createSnapshot();
    const result = await runtime.runPlanWorkflow(snapshot, createPlan(snapshot), undefined, undefined, 'run-plan-paused-001', () => true);

    expect(result.ok).toBe(false);
    expect(result.data).toMatchObject({ runId: 'run-plan-paused-001', status: 'paused' });
  });

  test('rejects a plan that is not ready for execution', async () => {
    const runtime = new WorkflowRuntime({
      provider: 'local',
      agent: 'principal',
      model: 'local-model',
      baseUrl: 'http://localhost',
      apiKey: '',
      temperature: 0.2
    });
    const snapshot = createSnapshot();
    const result = await runtime.runPlanWorkflow(snapshot, createPlan(snapshot, 'generating'));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('no está listo');
  });

  test('executes independent ready tasks in parallel with deterministic result order', async () => {
    let active = 0;
    let maximumActive = 0;
    const executeSpy = jest.spyOn(PrincipalAgent.prototype, 'execute').mockImplementation(async (_context, task) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return { ok: true, message: `done:${task.id}`, data: {} };
    });

    try {
      const snapshot = createSnapshot();
      const result = await new WorkflowRuntime({ provider: 'local', agent: 'principal', model: 'local-model', baseUrl: 'http://localhost', apiKey: '', temperature: 0.2 }).runPlanWorkflow(
        snapshot,
        createPlan(snapshot, 'handed_off', [
          { id: 'parallel-a', title: 'A', description: 'A', priority: 'medium', dependencies: [], writePaths: ['src/a.ts'] },
          { id: 'parallel-b', title: 'B', description: 'B', priority: 'medium', dependencies: [], writePaths: ['src/b.ts'] }
        ]),
        undefined,
        undefined,
        `run-parallel-${Date.now()}`
      );

      expect(result.ok).toBe(true);
      expect(maximumActive).toBe(2);
      expect((result.data as any)?.taskResults.map((entry: { taskId: string }) => entry.taskId)).toEqual(['parallel-a', 'parallel-b']);
    } finally {
      executeSpy.mockRestore();
    }
  });

  test('serializes conflicting and ambiguous ready tasks', async () => {
    let active = 0;
    let maximumActive = 0;
    const executeSpy = jest.spyOn(PrincipalAgent.prototype, 'execute').mockImplementation(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return { ok: true, message: 'done', data: {} };
    });

    try {
      const snapshot = createSnapshot();
      const result = await new WorkflowRuntime({ provider: 'local', agent: 'principal', model: 'local-model', baseUrl: 'http://localhost', apiKey: '', temperature: 0.2 }).runPlanWorkflow(
        snapshot,
        createPlan(snapshot, 'handed_off', [
          { id: 'serial-a', title: 'A', description: 'A', priority: 'medium', dependencies: [], writePaths: ['src/shared.ts'] },
          { id: 'serial-b', title: 'B', description: 'B', priority: 'medium', dependencies: [], writePaths: ['src/shared.ts'] },
          { id: 'serial-ambiguous', title: 'Ambiguous', description: 'Ambiguous', priority: 'medium', dependencies: [] }
        ]),
        undefined,
        undefined,
        `run-conflict-${Date.now()}`
      );

      expect(result.ok).toBe(true);
      expect(maximumActive).toBe(1);
    } finally {
      executeSpy.mockRestore();
    }
  });

  test('does not run a dependent task until its dependency succeeds', async () => {
    const started: string[] = [];
    const executeSpy = jest.spyOn(PrincipalAgent.prototype, 'execute').mockImplementation(async (_context, task) => {
      started.push(task.id);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, message: 'done', data: {} };
    });

    try {
      const snapshot = createSnapshot();
      const result = await new WorkflowRuntime({ provider: 'local', agent: 'principal', model: 'local-model', baseUrl: 'http://localhost', apiKey: '', temperature: 0.2 }).runPlanWorkflow(
        snapshot,
        createPlan(snapshot, 'handed_off', [
          { id: 'dependency-a', title: 'A', description: 'A', priority: 'medium', dependencies: [], writePaths: ['src/a.ts'] },
          { id: 'dependency-b', title: 'B', description: 'B', priority: 'medium', dependencies: ['dependency-a'], writePaths: ['src/b.ts'] }
        ]),
        undefined,
        undefined,
        `run-dependency-${Date.now()}`
      );

      expect(result.ok).toBe(true);
      expect(started).toEqual(['dependency-a', 'dependency-b']);
    } finally {
      executeSpy.mockRestore();
    }
  });
});
