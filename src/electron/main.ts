/**
 * Electron main process entry point.
 * This file creates the application window and exposes the desktop workspace IPC contract.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';

import { createAppConfig, defaultAgentRuntimeSettings, type AgentRuntimeSettings } from '../backend/config';
import { createProjectSnapshot } from '../backend/project-snapshot';
import { WorkflowRuntime } from '../backend/workflow-runtime';
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from '../backend/workspace-service';

let workspaceRoot = process.env.NEXIO_WORKSPACE_ROOT ?? process.cwd();
let agentRuntimeSettings: AgentRuntimeSettings = { ...defaultAgentRuntimeSettings };

function setWorkspaceRoot(nextRoot: string): string {
  workspaceRoot = path.resolve(nextRoot);
  return workspaceRoot;
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    title: 'Nexio IDE',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.resolve(process.cwd(), 'src/ui/index.html');
  mainWindow.loadFile(indexPath).catch((error) => {
    console.error('Failed to load UI:', error);
  });
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-config', () => ({
    environment: 'development',
    agents: ['ideas', 'planning', 'principal', 'orchestrator'],
    llmProviders: ['ollama', 'openai', 'gemini', 'grok', 'local'],
    workspaceRoot,
    agentRuntime: { ...agentRuntimeSettings },
    sandbox: createAppConfig(workspaceRoot).sandbox
  }));

  ipcMain.handle('app:get-agent-config', () => ({ ...agentRuntimeSettings }));

  ipcMain.handle('app:set-agent-config', (_event, nextConfig: Partial<AgentRuntimeSettings>) => {
    agentRuntimeSettings = {
      ...agentRuntimeSettings,
      ...nextConfig,
      provider: nextConfig.provider ?? agentRuntimeSettings.provider,
      agent: nextConfig.agent ?? agentRuntimeSettings.agent,
      language: nextConfig.language ?? agentRuntimeSettings.language
    };
    return { ...agentRuntimeSettings };
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
