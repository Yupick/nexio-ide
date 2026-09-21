/**
 * Electron main process entry point.
 * This file creates the application window and exposes the desktop workspace IPC contract.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { createAppConfig, defaultAgentRuntimeSettings, normalizeAgentKey, type AgentRuntimeSettings } from '../backend/config';
import { ExecutionManager } from '../backend/execution-manager';
import { IdeaChatService } from '../backend/idea-chat-service';
import { AgentOrchestrator } from '../backend/orchestrator';
import { PlanService } from '../backend/plan-service';
import { PlanStore } from '../backend/plan-store';
import { DebouncedPlanSyncService } from '../backend/plan-sync-service';
import { PluginManager } from '../backend/plugin-manager';
import { createProjectSnapshot } from '../backend/project-snapshot';
import { createProjectSnapshotHash } from '../backend/snapshot-hash';
import { WorkflowRuntime } from '../backend/workflow-runtime';
import { WorkflowRunStore } from '../backend/workflow-run-store';
import { WorkflowEventStore } from '../backend/workflow-event-store';
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from '../backend/workspace-service';
import type { ApprovalDecision, AgentTask, IdeaChatRequest, PlanGenerationRequest, PluginRuntimeProfile, WorkflowEvent, WorkflowEventType, WorkflowRunOptions } from '../shared/types';

let workspaceRoot = process.env.NEXIO_WORKSPACE_ROOT ?? process.cwd();
let agentRuntimeSettings: AgentRuntimeSettings = { ...defaultAgentRuntimeSettings };
let executionManager: ExecutionManager | null = null;
const workflowCancellations = new Map<string, { cancel: () => void; pause: () => void; isCancelled: () => boolean; isPaused: () => boolean }>();
const appConfigPath = path.join(app.getPath('userData'), 'nexio-app-config.json');
const pluginConfigPath = path.join(app.getPath('userData'), 'nexio-plugin-config.json');
const pluginDirectory = fs.existsSync(path.resolve(process.cwd(), 'dist', 'src', 'plugins'))
  ? path.resolve(process.cwd(), 'dist', 'src', 'plugins')
  : path.resolve(process.cwd(), 'src', 'plugins');
const pluginManager = new PluginManager(pluginDirectory);
const ideaChatService = new IdeaChatService();
const planService = new PlanService();
const planSyncService = new DebouncedPlanSyncService(600);
const agentOrchestrator = new AgentOrchestrator();

function readPersistedJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as T : fallback;
  } catch (error) {
    console.warn('Unable to read persisted config', filePath, error);
    return fallback;
  }
}

function writePersistedJson(filePath: string, value: Record<string, unknown>): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  } catch (error) {
    console.warn('Unable to write persisted config', filePath, error);
  }
}

function hydrateRuntimeConfig(): void {
  const persisted = readPersistedJson<{ workspaceRoot?: string; agentRuntime?: Partial<AgentRuntimeSettings> }>(appConfigPath, {});
  const mergedRuntime = {
    ...defaultAgentRuntimeSettings,
    ...(persisted.agentRuntime ?? {})
  } as AgentRuntimeSettings;

  agentRuntimeSettings = {
    ...defaultAgentRuntimeSettings,
    ...mergedRuntime,
    agent: normalizeAgentKey(mergedRuntime.agent ?? defaultAgentRuntimeSettings.agent),
    baseUrl: (mergedRuntime.baseUrl || defaultAgentRuntimeSettings.baseUrl).trim() || defaultAgentRuntimeSettings.baseUrl
  };

  if (persisted.workspaceRoot && typeof persisted.workspaceRoot === 'string') {
    workspaceRoot = path.resolve(persisted.workspaceRoot);
  }
}

function persistRuntimeConfig(): void {
  writePersistedJson(appConfigPath, {
    workspaceRoot,
    agentRuntime: { ...agentRuntimeSettings }
  });
}

function persistPluginConfig(pluginProfiles: Record<string, Record<string, unknown>>): void {
  writePersistedJson(pluginConfigPath, pluginProfiles);
}

function readPluginProfiles(): Record<string, PluginRuntimeProfile> {
  return readPersistedJson<Record<string, PluginRuntimeProfile>>(pluginConfigPath, {});
}

function setWorkspaceRoot(nextRoot: string): string {
  workspaceRoot = path.resolve(nextRoot);
  executionManager = new ExecutionManager(path.join(workspaceRoot, '.nexio', 'workflow-history.json'));
  return workspaceRoot;
}

function getExecutionManager(): ExecutionManager {
  if (!executionManager) {
    executionManager = new ExecutionManager(path.join(workspaceRoot, '.nexio', 'workflow-history.json'));
  }
  return executionManager;
}

function recordWorkflowControlEvent(type: WorkflowEventType, taskId: string, message: string, context: { planId?: string; runId?: string; status?: string; metadata?: Record<string, unknown> } = {}): void {
  const eventStore = new WorkflowEventStore(workspaceRoot);
  eventStore.append({
    type,
    taskId,
    message,
    timestamp: new Date().toISOString(),
    metadata: context.metadata
  }, {
    planId: context.planId,
    runId: context.runId,
    status: context.status
  });
}

function createWindow(): void {
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    title: 'Nexio IDE',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  const indexPath = path.resolve(process.cwd(), 'src/ui/index.html');
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, description) => {
    console.error('Failed to load UI:', { errorCode, description });
  });

  mainWindow.loadFile(indexPath)
    .then(() => {
      mainWindow.show();
      mainWindow.focus();
    })
    .catch((error) => {
      console.error('Failed to load UI:', error);
      mainWindow.show();
      mainWindow.focus();
    });
}

app.whenReady().then(() => {
  hydrateRuntimeConfig();
  getExecutionManager();

  ipcMain.handle('app:get-config', () => ({
    environment: 'development',
    agents: ['ideas', 'planning', 'principal'],
    llmProviders: ['ollama', 'openai', 'gemini', 'grok', 'local'],
    workspaceRoot,
    agentRuntime: { ...agentRuntimeSettings, agent: normalizeAgentKey(agentRuntimeSettings.agent) },
    sandbox: createAppConfig(workspaceRoot).sandbox
  }));

  ipcMain.handle('app:get-agent-config', () => ({ ...agentRuntimeSettings, agent: normalizeAgentKey(agentRuntimeSettings.agent) }));

  ipcMain.handle('app:set-agent-config', (_event, nextConfig: Partial<AgentRuntimeSettings>) => {
    const normalizedAgent = normalizeAgentKey(nextConfig.agent ?? agentRuntimeSettings.agent);
    const resolvedBaseUrl = (nextConfig.baseUrl ?? agentRuntimeSettings.baseUrl ?? defaultAgentRuntimeSettings.baseUrl).trim() || defaultAgentRuntimeSettings.baseUrl;
    agentRuntimeSettings = {
      ...agentRuntimeSettings,
      ...nextConfig,
      provider: nextConfig.provider ?? agentRuntimeSettings.provider,
      agent: normalizedAgent,
      baseUrl: resolvedBaseUrl
    };
    persistRuntimeConfig();
    return { ...agentRuntimeSettings, agent: normalizeAgentKey(agentRuntimeSettings.agent) };
  });

  ipcMain.handle('plugins:list', () => pluginManager.getDefinitions().map((plugin) => ({
    ...plugin,
    capabilities: plugin.capabilities ?? []
  })));

  ipcMain.handle('plugins:set-config', (_event, pluginId: string, nextConfig: Record<string, unknown>) => {
    if (!pluginId || !nextConfig) {
      return null;
    }
    const stored = readPersistedJson<Record<string, Record<string, unknown>>>(pluginConfigPath, {});
    const persisted = {
      ...stored,
      [pluginId]: {
        ...(stored[pluginId] ?? {}),
        ...nextConfig,
        id: pluginId
      }
    };
    persistPluginConfig(persisted);
    return {
      id: pluginId,
      ...nextConfig
    };
  });

  ipcMain.handle('workspace:list', () => listWorkspace(workspaceRoot));

  ipcMain.handle('workspace:set-root', (_event, nextRoot: string) => {
    if (!nextRoot) {
      return null;
    }
    return setWorkspaceRoot(nextRoot);
  });

  ipcMain.handle('app:select-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir archivo',
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const absolutePath = path.resolve(result.filePaths[0]);
    const relativePath = path.relative(workspaceRoot, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null;
    }

    return relativePath;
  });

  ipcMain.handle('app:select-workspace', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Abrir carpeta de trabajo',
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return setWorkspaceRoot(result.filePaths[0]);
  });

  ipcMain.handle('workspace:read', (_event, relativePath: string) => {
    return readWorkspaceFile(workspaceRoot, relativePath);
  });

  ipcMain.handle('workspace:write', (_event, relativePath: string, content: string) => {
    writeWorkspaceFile(workspaceRoot, relativePath, content);
    return true;
  });

  ipcMain.handle('approval:history', () => getExecutionManager().getHistory());

  ipcMain.handle('approval:decide', async (_event, decision: ApprovalDecision) => {
    if (!decision || typeof decision.taskId !== 'string' || typeof decision.approved !== 'boolean' || (!decision.change && !decision.changes?.length)) {
      throw new Error('Approval decision requires a task id and structured change.');
    }

    const task: AgentTask = {
      id: decision.taskId,
      title: 'Workflow approval decision',
      description: 'Approval decision submitted by the desktop UI.',
      priority: 'high',
      dependencies: []
    };

    recordWorkflowControlEvent(decision.approved ? 'workflow-completed' : 'workflow-failed', decision.taskId, decision.approved ? 'Cambio aprobado por el usuario.' : 'Cambio rechazado por el usuario.', {
      metadata: { approval: decision.approved ? 'approved' : 'rejected' }
    });

    return getExecutionManager().decideApproval(task, {
      approved: decision.approved,
      change: decision.change,
      changes: decision.changes,
      patch: decision.change?.patch ?? decision.changes?.map((change) => change.patch).join('\n\n') ?? '',
      targetPath: decision.change?.targetPath ?? decision.changes?.[0]?.targetPath,
      metadata: decision.metadata
    }, workspaceRoot);
  });

  ipcMain.handle('agent:idea-chat', async (_event, request: IdeaChatRequest) => {
    const runtimeSettings: AgentRuntimeSettings = {
      ...agentRuntimeSettings,
      agent: 'ideas',
      ...(request?.settings ?? {})
    };
    return ideaChatService.sendMessage(request, workspaceRoot, runtimeSettings);
  });

  ipcMain.handle('agent:generate-plan', async (_event, request: PlanGenerationRequest) => {
    const runtimeSettings: AgentRuntimeSettings = {
      ...agentRuntimeSettings,
      agent: 'planning',
      ...(request?.settings ?? {})
    };
    return planService.generatePlan(request, workspaceRoot, runtimeSettings);
  });

  ipcMain.handle('agent:sync-plan', async (_event, request: PlanGenerationRequest) => {
    const runtimeSettings: AgentRuntimeSettings = {
      ...agentRuntimeSettings,
      agent: 'planning',
      ...(request?.settings ?? {})
    };
    return planSyncService.schedulePromise(
      request,
      (nextRequest) => planService.generatePlan(nextRequest, workspaceRoot, runtimeSettings)
    );
  });

  ipcMain.handle('agent:get-plan', (_event, planId: string) => {
    const plan = typeof planId === 'string' && planId.trim() ? new PlanStore(workspaceRoot).get(planId.trim()) : undefined;
    return plan
      ? { ok: true, message: 'Plan recuperado.', data: { plan, message: 'Plan recuperado.' } }
      : { ok: false, message: 'No se encontró el plan solicitado.' };
  });

  ipcMain.handle('agent:handoff-plan', (_event, planId: string) => {
    const plan = typeof planId === 'string' && planId.trim() ? new PlanStore(workspaceRoot).get(planId.trim()) : undefined;
    if (!plan || plan.status !== 'ready' || !plan.roadmap) {
      return { ok: false, message: 'Solo se pueden enviar al orquestador planes listos y con roadmap válido.' };
    }

    const snapshot = createProjectSnapshot(workspaceRoot);
    const result = agentOrchestrator.runPlan(snapshot, {
      planId: plan.planId,
      snapshotHash: plan.snapshotHash,
      roadmap: plan.roadmap
    });
    if (result.ok) {
      new PlanStore(workspaceRoot).save({ ...plan, status: 'handed_off', updatedAt: new Date().toISOString() });
    }

    return result;
  });

  ipcMain.handle('agent:run-workflow', async (event, planId?: string, _targetFile?: string | null, runtimeConfig?: WorkflowRunOptions) => {
    const resolvedConfig = {
      ...agentRuntimeSettings,
      ...(runtimeConfig ?? {})
    };
    const snapshot = createProjectSnapshot(workspaceRoot);
    const runtime = new WorkflowRuntime(resolvedConfig, readPluginProfiles());
    if (!planId?.trim()) {
      return { ok: false, message: 'La ejecución requiere un planId confirmado.', data: { status: 'plan_required' } };
    }
    const plan = new PlanStore(workspaceRoot).get(planId);
    if (!plan) {
      return { ok: false, message: 'No se encontró el plan solicitado.', data: { planId } };
    }

    const runId = `run-${plan.planId}-${Date.now()}`;
    let cancelled = false;
    let paused = false;
    workflowCancellations.set(runId, {
      cancel: () => { cancelled = true; },
      pause: () => { paused = true; },
      isCancelled: () => cancelled,
      isPaused: () => paused
    });

    try {
      return await runtime.runPlanWorkflow(snapshot, plan, (workflowEvent: WorkflowEvent) => {
        event.sender.send('workflow:event', workflowEvent);
      }, () => cancelled, runId, () => paused);
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') {
        return { ok: false, message: 'Workflow cancelado por el usuario.', data: { planId, runId, status: 'cancelled' } };
      }
      throw error;
    } finally {
      workflowCancellations.delete(runId);
    }
  });

  ipcMain.handle('agent:cancel-workflow', (_event, taskId: string) => {
    const workflow = workflowCancellations.get(taskId);
    if (!workflow) {
      return { ok: false, message: 'No hay un workflow activo con ese identificador.' };
    }
    workflow.cancel();
    recordWorkflowControlEvent('workflow-cancelled', taskId, 'Solicitud de cancelación enviada.', { runId: taskId, status: 'cancelled' });
    return { ok: true, message: 'Solicitud de cancelación enviada.' };
  });

  ipcMain.handle('agent:pause-workflow', (_event, runId: string) => {
    const workflow = workflowCancellations.get(runId);
    if (!workflow) {
      return { ok: false, message: 'No hay un workflow activo con ese identificador.' };
    }
    workflow.pause();
    recordWorkflowControlEvent('workflow-paused', runId, 'Solicitud de pausa enviada.', { runId, status: 'paused' });
    return { ok: true, message: 'Solicitud de pausa enviada.' };
  });

  ipcMain.handle('agent:get-run', (_event, runId: string) => {
    const run = typeof runId === 'string' && runId.trim() ? new WorkflowRunStore(workspaceRoot).get(runId.trim()) : undefined;
    return run
      ? { ok: true, message: 'Ejecución recuperada.', data: { run } }
      : { ok: false, message: 'No se encontró la ejecución solicitada.' };
  });

  ipcMain.handle('agent:get-activity', (_event, runId: string) => {
    if (typeof runId !== 'string' || !runId.trim()) {
      return { ok: false, message: 'Se requiere un runId para consultar la actividad.' };
    }
    return {
      ok: true,
      message: 'Actividad recuperada.',
      data: { events: new WorkflowEventStore(workspaceRoot).list({ runId: runId.trim() }) }
    };
  });

  ipcMain.handle('agent:retry-task', (_event, runId: string, taskId: string) => {
    const store = new WorkflowRunStore(workspaceRoot);
    const run = store.get(runId);
    if (!run) {
      return { ok: false, message: 'No se encontró la ejecución solicitada.' };
    }
    try {
      const updated = agentOrchestrator.retryTask(run, taskId);
      store.save(updated);
      recordWorkflowControlEvent('workflow-resumed', taskId, 'Tarea preparada para reintento.', { planId: run.planId, runId, status: updated.status, metadata: { retry: true } });
      return { ok: true, message: `La tarea ${taskId} quedó lista para reintento.`, data: { run: updated } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se pudo reintentar la tarea.' };
    }
  });

  ipcMain.handle('agent:heartbeat-task', (_event, runId: string, taskId: string, leaseMs?: number) => {
    const store = new WorkflowRunStore(workspaceRoot);
    const run = store.get(runId);
    if (!run) {
      return { ok: false, message: 'No se encontró la ejecución solicitada.' };
    }
    try {
      const updated = agentOrchestrator.renewTaskLease(run, taskId, Number.isFinite(leaseMs) ? leaseMs : 60_000);
      store.save(updated);
      recordWorkflowControlEvent('stage-started', taskId, 'Lease renovado mediante heartbeat.', { planId: run.planId, runId, status: updated.tasks.find((task) => task.taskId === taskId)?.status, metadata: { heartbeat: true } });
      return { ok: true, message: `Lease renovado para ${taskId}.`, data: { run: updated } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se pudo renovar el lease.' };
    }
  });

  ipcMain.handle('agent:resume-workflow', async (event, runId: string) => {
    const run = typeof runId === 'string' && runId.trim() ? new WorkflowRunStore(workspaceRoot).get(runId.trim()) : undefined;
    if (!run || run.status !== 'paused') {
      return { ok: false, message: 'Solo se pueden reanudar ejecuciones pausadas.' };
    }
    const plan = new PlanStore(workspaceRoot).get(run.planId);
    if (!plan || plan.revision !== run.planRevision) {
      return { ok: false, message: 'El plan de la ejecución ya no coincide con la revisión persistida.' };
    }
    const runtime = new WorkflowRuntime(agentRuntimeSettings, readPluginProfiles());
    let cancelled = false;
    let paused = false;
    workflowCancellations.set(run.runId, {
      cancel: () => { cancelled = true; },
      pause: () => { paused = true; },
      isCancelled: () => cancelled,
      isPaused: () => paused
    });
    try {
      recordWorkflowControlEvent('workflow-resumed', run.runId, 'Ejecución reanudada.', { planId: run.planId, runId, status: 'running' });
      return await runtime.runPlanWorkflow(createProjectSnapshot(workspaceRoot), plan, (workflowEvent: WorkflowEvent) => {
        event.sender.send('workflow:event', workflowEvent);
      }, () => cancelled, run.runId, () => paused);
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') {
        return { ok: false, message: 'Workflow cancelado por el usuario.', data: { planId: run.planId, runId: run.runId, status: 'cancelled' } };
      }
      throw error;
    } finally {
      workflowCancellations.delete(run.runId);
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
