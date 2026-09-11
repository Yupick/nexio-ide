import { contextBridge, ipcRenderer } from 'electron';

export type ElectronApi = {
  getConfig: () => Promise<{ workspaceRoot: string; environment: string; agents: string[]; llmProviders: string[] }>; 
  listWorkspace: () => Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> }>>;
  readFile: (relativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
  selectFile: () => Promise<string | null>;
  selectWorkspace: () => Promise<string | null>;
  setWorkspaceRoot: (rootPath: string) => Promise<string | null>;
  runAgentWorkflow: (taskTitle: string, targetFile?: string | null) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
};

const electronApi: ElectronApi = {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  listWorkspace: () => ipcRenderer.invoke('workspace:list'),
  readFile: (relativePath: string) => ipcRenderer.invoke('workspace:read', relativePath),
  writeFile: (relativePath: string, content: string) => ipcRenderer.invoke('workspace:write', relativePath, content),
  selectFile: () => ipcRenderer.invoke('app:select-file'),
  selectWorkspace: () => ipcRenderer.invoke('app:select-workspace'),
  setWorkspaceRoot: (rootPath: string) => ipcRenderer.invoke('workspace:set-root', rootPath),
  runAgentWorkflow: (taskTitle: string, targetFile?: string | null) => ipcRenderer.invoke('agent:run-workflow', taskTitle, targetFile ?? null)
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}
