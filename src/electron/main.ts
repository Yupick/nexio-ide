/**
 * Electron main process entry point.
 * This file creates the application window and exposes the desktop workspace IPC contract.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

import { createAppConfig } from '../backend/config';
import { listWorkspace, readWorkspaceFile, writeWorkspaceFile } from '../backend/workspace-service';

const workspaceRoot = process.env.NEXIO_WORKSPACE_ROOT ?? process.cwd();

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
    agents: ['ideas', 'planning', 'principal'],
    llmProviders: ['openai', 'ollama', 'local'],
    workspaceRoot,
    sandbox: createAppConfig(workspaceRoot).sandbox
  }));

  ipcMain.handle('workspace:list', () => listWorkspace(workspaceRoot));

  ipcMain.handle('workspace:read', (_event, relativePath: string) => {
    return readWorkspaceFile(workspaceRoot, relativePath);
  });

  ipcMain.handle('workspace:write', (_event, relativePath: string, content: string) => {
    writeWorkspaceFile(workspaceRoot, relativePath, content);
    return true;
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
