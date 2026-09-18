/**
 * Electron main process entry point.
 * This file creates the application window and exposes the desktop workspace IPC contract.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { createAppConfig, defaultAgentRuntimeSettings, normalizeAgentKey, type AgentRuntimeSettings } from '../backend/config';
import { ExecutionManager } from '../backend/execution-manager';
import { PluginManager } from '../backend/plugin-manager';
import { createProjectSnapshot } from '../backend/project-snapshot';
import { WorkflowRuntime } from '../backend/workflow-runtime';
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from '../backend/workspace-service';
import type { ApprovalDecision, AgentTask, PluginRuntimeProfile, WorkflowEvent, WorkflowRunOptions } from '../shared/types';

let workspaceRoot = process.env.NEXIO_WORKSPACE_ROOT ?? process.cwd();
let agentRuntimeSettings: AgentRuntimeSettings = { ...defaultAgentRuntimeSettings };
let executionManager: ExecutionManager | null = null;
const workflowCancellations = new Map<string, { cancel: () => void; isCancelled: () => boolean }>();
const appConfigPath = path.join(app.getPath('userData'), 'nexio-app-config.json');
const pluginConfigPath = path.join(app.getPath('userData'), 'nexio-plugin-config.json');
const pluginDirectory = fs.existsSync(path.resolve(process.cwd(), 'dist', 'src', 'plugins'))
  ? path.resolve(process.cwd(), 'dist', 'src', 'plugins')
  : path.resolve(process.cwd(), 'src', 'plugins');
const pluginManager = new PluginManager(pluginDirectory);

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

    return getExecutionManager().decideApproval(task, {
      approved: decision.approved,
      change: decision.change,
      changes: decision.changes,
      patch: decision.change?.patch ?? decision.changes?.map((change) => change.patch).join('\n\n') ?? '',
      targetPath: decision.change?.targetPath ?? decision.changes?.[0]?.targetPath,
      metadata: decision.metadata
    }, workspaceRoot);
  });

  ipcMain.handle('agent:run-workflow', async (event, taskTitle?: string, targetFile?: string | null, runtimeConfig?: WorkflowRunOptions) => {
    const { ideaSessionId, ideaModel, autoApproveChanges, ...runtimeOverrides } = runtimeConfig ?? {};
    const resolvedConfig = {
      ...agentRuntimeSettings,
      ...runtimeOverrides,
      ...(ideaModel ? { model: ideaModel } : {})
    };
    const snapshot = createProjectSnapshot(workspaceRoot);
    const runtime = new WorkflowRuntime(resolvedConfig, readPluginProfiles());
    const task = {
      id: runtimeConfig?.runId || `task-${Date.now()}`,
      title: taskTitle || 'Review current workspace',
      description: targetFile
        ? `Inspect ${targetFile} in the current workspace and propose an approval-ready action plan.`
        : 'Inspect the current workspace and produce ideas, roadmap tasks, and a reviewable execution result.',
      priority: 'high' as const,
      dependencies: [],
      metadata: {
        targetFile: targetFile ?? null,
        prompt: taskTitle ?? 'Review current workspace',
        language: 'typescript',
        ...(ideaSessionId ? { ideaSessionId } : {}),
        ...(ideaModel ? { ideaModel } : {})
      }
    };

    console.log('[electron main] agent:run-workflow', {
      taskId: task.id,
      title: task.title,
      provider: resolvedConfig.provider,
      model: resolvedConfig.model,
      baseUrl: resolvedConfig.baseUrl,
      targetFile: targetFile ?? null
    });

    let cancelled = false;
    workflowCancellations.set(task.id, {
      cancel: () => { cancelled = true; },
      isCancelled: () => cancelled
    });

    let result;
    try {
      result = await runtime.runWorkflow(snapshot, task, (workflowEvent: WorkflowEvent) => {
        event.sender.send('workflow:event', workflowEvent);
      }, () => cancelled);
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKFLOW_CANCELLED') {
        return { ok: false, message: 'Workflow cancelado por el usuario.', data: { taskId: task.id, status: 'cancelled' } };
      }
      throw error;
    } finally {
      workflowCancellations.delete(task.id);
    }
    const resultData = result.data && typeof result.data === 'object'
      ? result.data as Record<string, unknown>
      : null;
    const changes = Array.isArray(resultData?.changes)
      ? resultData.changes.filter((change): change is { targetPath: string; patch: string; pluginId?: string } => Boolean(change && typeof change === 'object' && typeof (change as Record<string, unknown>).targetPath === 'string' && typeof (change as Record<string, unknown>).patch === 'string'))
      : [];
    const pluginProfiles = readPluginProfiles();
    const autoApprovalAuthorized = Boolean(autoApproveChanges)
      && changes.length > 0
      && changes.every((change) => Boolean(change.pluginId && pluginProfiles[change.pluginId]?.autoApprove === true));

    if (autoApproveChanges && changes.length > 0 && autoApprovalAuthorized) {
      for (const change of changes) {
        await getExecutionManager().decideApproval(task, {
          approved: true,
          change,
          patch: change.patch,
          targetPath: change.targetPath,
          metadata: {
            ...(resultData?.executionMetadata && typeof resultData.executionMetadata === 'object' ? resultData.executionMetadata as Record<string, unknown> : {}),
            autoApproved: true,
            pluginId: change.pluginId
          }
        }, workspaceRoot);
      }

      if (resultData) {
        resultData.changes = [];
        resultData.approvalStatus = 'approved';
        resultData.autoApproval = { applied: true, changeCount: changes.length };
      }
    } else if (autoApproveChanges && resultData) {
      resultData.autoApproval = {
        applied: false,
        reason: changes.length === 0
          ? 'No hay cambios estructurados para autoaprobar.'
          : 'Los plugins responsables no tienen autoaprobación autorizada.'
      };
    }
    const llmResponse = result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>).llmResponse as Record<string, unknown> | undefined : undefined;
    console.log('[electron main] workflow result', {
      taskId: task.id,
      ok: result.ok,
      provider: String((llmResponse?.provider as string | undefined) ?? resolvedConfig.provider),
      model: String((llmResponse?.metadata as Record<string, unknown> | undefined)?.model ?? resolvedConfig.model),
      responsePreview: String((llmResponse?.text as string | undefined) ?? '').slice(0, 500)
    });
    return result;
  });

  ipcMain.handle('agent:cancel-workflow', (_event, taskId: string) => {
    const workflow = workflowCancellations.get(taskId);
    if (!workflow) {
      return { ok: false, message: 'No hay un workflow activo con ese identificador.' };
    }
    workflow.cancel();
    return { ok: true, message: 'Solicitud de cancelación enviada.' };
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
