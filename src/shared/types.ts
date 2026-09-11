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
}

export interface PluginContext {
  projectPath: string;
  logger: (message: string) => void;
}

export interface PluginInstance {
  id: string;
  name: string;
  type: PluginDefinition['type'];
  version: string;
  init: (context: PluginContext) => Promise<void>;
  execute: (task: AgentTask) => Promise<AgentExecutionResult>;
  shutdown?: () => Promise<void>;
}
