import { contextBridge, ipcRenderer } from 'electron';

export type ElectronApi = {
  getConfig: () => Promise<{ workspaceRoot: string; environment: string; agents: string[]; llmProviders: string[] }>; 
  listWorkspace: () => Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> }>>;
  readFile: (relativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
};

const electronApi: ElectronApi = {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  listWorkspace: () => ipcRenderer.invoke('workspace:list'),
  readFile: (relativePath: string) => ipcRenderer.invoke('workspace:read', relativePath),
  writeFile: (relativePath: string, content: string) => ipcRenderer.invoke('workspace:write', relativePath, content)
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}
