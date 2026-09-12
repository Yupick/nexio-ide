/**
 * Electron main process entry point.
 * This file creates the application window and exposes the desktop workspace IPC contract.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { createAppConfig, defaultAgentRuntimeSettings, normalizeAgentKey, type AgentRuntimeSettings } from '../backend/config';
import { PluginManager } from '../backend/plugin-manager';
import { createProjectSnapshot } from '../backend/project-snapshot';
import { WorkflowRuntime } from '../backend/workflow-runtime';
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from '../backend/workspace-service';

let workspaceRoot = process.env.NEXIO_WORKSPACE_ROOT ?? process.cwd();
let agentRuntimeSettings: AgentRuntimeSettings = { ...defaultAgentRuntimeSettings };
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

function setWorkspaceRoot(nextRoot: string): string {
  workspaceRoot = path.resolve(nextRoot);
  return workspaceRoot;
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

  ipcMain.handle('agent:run-workflow', async (_event, taskTitle?: string, targetFile?: string | null, runtimeConfig?: Partial<AgentRuntimeSettings>) => {
    const snapshot = createProjectSnapshot(workspaceRoot);
    const runtime = new WorkflowRuntime({
      ...agentRuntimeSettings,
      ...(runtimeConfig ?? {})
    });
    const task = {
      id: `task-${Date.now()}`,
      title: taskTitle || 'Review current workspace',
      description: targetFile
        ? `Inspect ${targetFile} in the current workspace and propose an approval-ready action plan.`
        : 'Inspect the current workspace and produce ideas, roadmap tasks, and a reviewable execution result.',
      priority: 'high' as const,
      dependencies: [],
      metadata: { targetFile: targetFile ?? null }
    };

    return runtime.runWorkflow(snapshot, task);
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
