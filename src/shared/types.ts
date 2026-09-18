/**
 * Shared domain types for the IDE's agent and plugin system.
 */
export type TaskPriority = 'low' | 'medium' | 'high';

export interface ProjectSnapshot {
  name: string;
  rootPath: string;
  files: string[];
  lastUpdated: string;
}

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dependencies: string[];
  metadata?: Record<string, unknown>;
}

export interface StructuredChange {
  targetPath: string;
  patch: string;
  pluginId?: string;
  baseContentHash?: string;
}

export interface WorkflowRunOptions {
  provider?: 'ollama' | 'openai' | 'gemini' | 'grok' | 'local';
  agent?: 'ideas' | 'planning' | 'principal' | 'orchestrator';
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  ideaSessionId?: string;
  ideaModel?: string;
  autoApproveChanges?: boolean;
  runId?: string;
}

export interface ApprovalDecision {
  taskId: string;
  approved: boolean;
  change?: StructuredChange;
  changes?: StructuredChange[];
  metadata?: Record<string, unknown>;
}

export type WorkflowEventType = 'workflow-started' | 'stage-started' | 'stage-completed' | 'workflow-completed' | 'workflow-failed' | 'workflow-cancelled';

export interface WorkflowEvent {
  type: WorkflowEventType;
  taskId: string;
  stage?: 'ideas' | 'planning' | 'orchestrator' | 'principal';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RoadmapEntry {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dependencies: string[];
}

export interface Roadmap {
  version: string;
  summary: string;
  tasks: RoadmapEntry[];
}

export interface AgentContext {
  snapshot: ProjectSnapshot;
  roadmap?: Roadmap;
  sandbox: {
    allowedRoots: string[];
    readOnly: boolean;
  };
}

export interface AgentMessage {
  id: string;
  type: 'task' | 'result' | 'event' | 'ack';
  from: string;
  to: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AgentExecutionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface PluginDefinition {
  id: string;
  name: string;
  version: string;
  type: 'agent' | 'syntax' | 'tool';
  description: string;
  entry: string;
  capabilities?: string[];
}

export interface PluginRuntimeProfile {
  enabled?: boolean;
  autoApprove?: boolean;
  capabilities?: string[];
  provider?: WorkflowRunOptions['provider'];
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
  description?: string;
}

export interface PluginContext {
  projectPath: string;
  logger: (message: string) => void;
  config?: PluginRuntimeProfile;
}

export interface PluginInstance {
  id: string;
  name: string;
  type: PluginDefinition['type'];
  version: string;
  capabilities?: string[];
  init: (context: PluginContext) => Promise<void>;
  execute: (task: AgentTask, context?: AgentContext) => Promise<AgentExecutionResult>;
  handleMessage?: (message: AgentMessage) => Promise<AgentMessage | null>;
  shutdown?: () => Promise<void>;
}
