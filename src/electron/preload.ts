import { contextBridge, ipcRenderer } from 'electron';
import type { ApprovalDecision, IdeaChatRequest, IdeaChatResult, PlanGenerationRequest, PlanGenerationResult, PlanHandoffResult, WorkflowEvent, WorkflowRunOptions } from '../shared/types';

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
  runAgentWorkflow: (planId: string, agentConfig?: WorkflowRunOptions) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  sendIdeaChatMessage: (request: IdeaChatRequest) => Promise<IdeaChatResult>;
  generatePlan: (request: PlanGenerationRequest) => Promise<PlanGenerationResult>;
  syncPlan: (request: PlanGenerationRequest) => Promise<PlanGenerationResult>;
  getPlan: (planId: string) => Promise<PlanGenerationResult>;
  handoffPlan: (planId: string) => Promise<PlanHandoffResult>;
  cancelWorkflow: (taskId: string) => Promise<{ ok: boolean; message: string }>;
  pauseWorkflow: (runId: string) => Promise<{ ok: boolean; message: string }>;
  resumeWorkflow: (runId: string) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  getWorkflowRun: (runId: string) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  retryTask: (runId: string, taskId: string) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  heartbeatTask: (runId: string, taskId: string, leaseMs?: number) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  getWorkflowActivity: (runId: string) => Promise<{ ok: boolean; message: string; data?: { events: Array<Record<string, unknown>> } }>;
  decideApproval: (decision: ApprovalDecision) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  getApprovalHistory: () => Promise<Array<Record<string, unknown>>>;
  onWorkflowEvent: (listener: (event: WorkflowEvent) => void) => () => void;
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
  runAgentWorkflow: (planId: string, agentConfig?: WorkflowRunOptions) => ipcRenderer.invoke('agent:run-workflow', planId, null, agentConfig ?? null),
  sendIdeaChatMessage: (request: IdeaChatRequest) => ipcRenderer.invoke('agent:idea-chat', request),
  generatePlan: (request: PlanGenerationRequest) => ipcRenderer.invoke('agent:generate-plan', request),
  syncPlan: (request: PlanGenerationRequest) => ipcRenderer.invoke('agent:sync-plan', request),
  getPlan: (planId: string) => ipcRenderer.invoke('agent:get-plan', planId),
  handoffPlan: (planId: string) => ipcRenderer.invoke('agent:handoff-plan', planId),
  cancelWorkflow: (taskId: string) => ipcRenderer.invoke('agent:cancel-workflow', taskId),
  pauseWorkflow: (runId: string) => ipcRenderer.invoke('agent:pause-workflow', runId),
  resumeWorkflow: (runId: string) => ipcRenderer.invoke('agent:resume-workflow', runId),
  getWorkflowRun: (runId: string) => ipcRenderer.invoke('agent:get-run', runId),
  retryTask: (runId: string, taskId: string) => ipcRenderer.invoke('agent:retry-task', runId, taskId),
  heartbeatTask: (runId: string, taskId: string, leaseMs?: number) => ipcRenderer.invoke('agent:heartbeat-task', runId, taskId, leaseMs),
  getWorkflowActivity: (runId: string) => ipcRenderer.invoke('agent:get-activity', runId),
  decideApproval: (decision: ApprovalDecision) => ipcRenderer.invoke('approval:decide', decision),
  getApprovalHistory: () => ipcRenderer.invoke('approval:history'),
  onWorkflowEvent: (listener: (event: WorkflowEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: WorkflowEvent) => listener(payload);
    ipcRenderer.on('workflow:event', handler);
    return () => ipcRenderer.removeListener('workflow:event', handler);
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronApi);

declare global {
  interface Window {
    electronAPI: ElectronApi;
  }
}
