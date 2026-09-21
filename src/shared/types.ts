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
  readPaths?: string[];
  writePaths?: string[];
  resourceKeys?: string[];
  metadata?: Record<string, unknown>;
}

export interface ResourceContract {
  readPaths?: string[];
  writePaths?: string[];
  resourceKeys?: string[];
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
  planId?: string;
  autoApproveChanges?: boolean;
  runId?: string;
}

export type IdeaChatRole = 'user' | 'agent';

export interface IdeaChatMessage {
  role: IdeaChatRole;
  text: string;
}

export interface IdeaChatContext {
  activeFile?: string | null;
  activeFileContent?: string;
  project?: {
    name?: string;
    files?: string[];
  };
}

export interface IdeaChatSettings {
  provider?: WorkflowRunOptions['provider'];
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
}

export interface IdeaChatRequest {
  sessionId: string;
  message: string;
  history: IdeaChatMessage[];
  context?: IdeaChatContext;
  settings?: IdeaChatSettings;
}

export interface IdeaChatMetadata {
  taskId: string;
  snapshotHash: string;
  provider: string;
  model: string;
}

export interface IdeaChatResponse {
  sessionId: string;
  message: string;
  metadata: IdeaChatMetadata;
}

export interface IdeaChatResult {
  ok: boolean;
  message: string;
  data?: IdeaChatResponse;
}

export interface IdeaTranscript {
  sessionId: string;
  messages: IdeaChatMessage[];
  context?: IdeaChatContext;
  settings?: IdeaChatSettings;
}

export interface IdeaProposal {
  id: string;
  sessionId: string;
  summary: string;
  objective: string;
  scope: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  openQuestions: string[];
  transcript: IdeaTranscript;
  snapshotHash: string;
  createdAt: string;
}

export type PlanRunStatus = 'draft' | 'generating' | 'ready' | 'handed_off' | 'failed' | 'superseded';

export interface PlanRun {
  planId: string;
  sessionId: string;
  revision: number;
  parentPlanId?: string;
  sourceMessageIds?: string[];
  status: PlanRunStatus;
  proposal: IdeaProposal;
  roadmap?: Roadmap;
  snapshotHash: string;
  createdAt: string;
  updatedAt: string;
  supersedesPlanId?: string;
  metadata?: {
    provider?: string;
    model?: string;
    promptVersion?: string;
    warnings?: string[];
    error?: string;
  };
}

export interface PlanGenerationRequest {
  sessionId: string;
  transcript: IdeaTranscript;
  parentPlanId?: string;
  sourceMessageIds?: string[];
  settings?: IdeaChatSettings;
}

export interface PlanGenerationResponse {
  plan: PlanRun;
  message: string;
}

export interface PlanGenerationResult {
  ok: boolean;
  message: string;
  data?: PlanGenerationResponse;
}

export type PlanSyncStatus = 'chatting' | 'sync_pending' | 'plan_draft' | 'plan_ready' | 'needs_clarification' | 'stale' | 'handed_off' | 'executing' | 'blocked' | 'completed';

export interface PlanSyncEvent {
  sessionId: string;
  revision: number;
  status: PlanSyncStatus;
  planId?: string;
  message?: string;
  updatedAt: string;
}

export interface OrchestrationInput {
  planId: string;
  snapshotHash: string;
  roadmap: Roadmap;
}

export interface PlanHandoffResult {
  ok: boolean;
  message: string;
  data?: {
    planId: string;
    snapshotHash: string;
    roadmap: Roadmap;
    executionThreads: Array<Record<string, unknown>>;
  };
}

export type WorkflowRunStatus = 'pending' | 'running' | 'paused' | 'awaiting_review' | 'blocked' | 'completed' | 'failed' | 'cancelled';
export type WorkflowTaskStatus = 'pending' | 'ready' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'retryable' | 'cancelled';

export interface WorkflowTaskState {
  taskId: string;
  planId: string;
  planRevision: number;
  title: string;
  description: string;
  dependencies: string[];
  readPaths?: string[];
  writePaths?: string[];
  resourceKeys?: string[];
  priority: TaskPriority;
  acceptanceCriteria: string[];
  pluginId?: string;
  requiredCapabilities?: string[];
  pluginVersion?: string;
  status: WorkflowTaskStatus;
  attempt: number;
  maxAttempts: number;
  leaseId?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  result?: Record<string, unknown>;
  updatedAt: string;
}

export interface WorkflowRun {
  runId: string;
  planId: string;
  planRevision: number;
  snapshotHash: string;
  status: WorkflowRunStatus;
  tasks: WorkflowTaskState[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalDecision {
  taskId: string;
  approved: boolean;
  change?: StructuredChange;
  changes?: StructuredChange[];
  metadata?: Record<string, unknown>;
}

export type WorkflowEventType = 'workflow-started' | 'stage-started' | 'stage-completed' | 'workflow-completed' | 'workflow-failed' | 'workflow-cancelled' | 'workflow-paused' | 'workflow-resumed';

export interface WorkflowEvent {
  type: WorkflowEventType;
  taskId: string;
  stage?: 'ideas' | 'planning' | 'orchestrator' | 'principal';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowEventRecord {
  eventId: string;
  type: WorkflowEventType;
  timestamp: string;
  taskId: string;
  planId?: string;
  planRevision?: number;
  runId?: string;
  pluginId?: string;
  status?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface RoadmapEntry {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  dependencies: string[];
  readPaths?: string[];
  writePaths?: string[];
  resourceKeys?: string[];
  acceptanceCriteria?: string[];
  suggestedAgent?: string;
  requiredCapabilities?: string[];
  order?: number;
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
  taskTypes?: string[];
  readPaths?: string[];
  writePaths?: string[];
  resourceKeys?: string[];
  contractVersion?: string;
  timeoutMs?: number;
  permissions?: {
    readOnly?: boolean;
    allowedRoots?: string[];
  };
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
  timeoutMs?: number;
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
  readPaths?: string[];
  writePaths?: string[];
  resourceKeys?: string[];
  timeoutMs?: number;
  permissions?: PluginDefinition['permissions'];
  healthCheck?: () => Promise<{ ok: boolean; message?: string }>;
  init: (context: PluginContext) => Promise<void>;
  execute: (task: AgentTask, context?: AgentContext) => Promise<AgentExecutionResult>;
  handleMessage?: (message: AgentMessage) => Promise<AgentMessage | null>;
  shutdown?: () => Promise<void>;
}
