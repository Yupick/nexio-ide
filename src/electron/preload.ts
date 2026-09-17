import { contextBridge, ipcRenderer } from 'electron';

export type ElectronApi = {
  getConfig: () => Promise<{ workspaceRoot: string; environment: string; agents: string[]; llmProviders: string[]; agentRuntime?: Record<string, unknown> }>; 
  getAgentConfig: () => Promise<Record<string, unknown>>;
  setAgentConfig: (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
  listPlugins: () => Promise<Array<{ id: string; name: string; version: string; type: string; description: string; entry: string; capabilities?: string[] }>>;
  setPluginConfig: (pluginId: string, config: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  listWorkspace: () => Promise<Array<{ name: string; path: string; type: 'file' | 'directory'; children?: Array<{ name: string; path: string; type: 'file' | 'directory'; children?: unknown[] }> }>>;
  readFile: (relativePath: string) => Promise<string>;
  writeFile: (relativePath: string, content: string) => Promise<void>;
  selectFile: () => Promise<string | null>;
  selectWorkspace: () => Promise<string | null>;
  setWorkspaceRoot: (rootPath: string) => Promise<string | null>;
  runAgentWorkflow: (taskTitle: string, targetFile?: string | null, agentConfig?: Record<string, unknown>) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  approveDiff: (taskId: string, patchText: string, targetPath?: string | null, metadata?: Record<string, unknown>) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
};

const electronApi: ElectronApi = {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  getAgentConfig: () => ipcRenderer.invoke('app:get-agent-config'),
  setAgentConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('app:set-agent-config', config),
  listPlugins: () => ipcRenderer.invoke('plugins:list'),
  setPluginConfig: (pluginId: string, config: Record<string, unknown>) => ipcRenderer.invoke('plugins:set-config', pluginId, config),
  listWorkspace: () => ipcRenderer.invoke('workspace:list'),
  readFile: (relativePath: string) => ipcRenderer.invoke('workspace:read', relativePath),
  writeFile: (relativePath: string, content: string) => ipcRenderer.invoke('workspace:write', relativePath, content),
  selectFile: () => ipcRenderer.invoke('app:select-file'),
  selectWorkspace: () => ipcRenderer.invoke('app:select-workspace'),
  setWorkspaceRoot: (rootPath: string) => ipcRenderer.invoke('workspace:set-root', rootPath),
  runAgentWorkflow: (taskTitle: string, targetFile?: string | null, agentConfig?: Record<string, unknown>) => ipcRenderer.invoke('agent:run-workflow', taskTitle, targetFile ?? null, agentConfig ?? null),
  approveDiff: (taskId: string, patchText: string, targetPath?: string | null, metadata?: Record<string, unknown>) => ipcRenderer.invoke('app:approve-diff', taskId, patchText, targetPath ?? null, metadata ?? {})
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}
