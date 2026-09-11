/**
 * Electron main process entry point.
 * This file creates the application window and exposes a simple IPC contract.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 980,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const indexPath = path.resolve(__dirname, '../src/ui/index.html');
  mainWindow.loadFile(indexPath).catch((error) => {
    console.error('Failed to load UI:', error);
  });
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-config', () => ({
    environment: 'development',
    agentsEnabled: ['ideas', 'planning', 'principal'],
    llmProviders: ['openai', 'ollama', 'local']
  }));

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
