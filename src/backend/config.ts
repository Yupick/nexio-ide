/**
 * Runtime configuration for the app shell and agent system.
 */
export type AgentKey = 'ideas' | 'planning' | 'principal' | 'orchestrator';

export interface AgentRuntimeSettings {
  provider: 'ollama' | 'openai' | 'gemini' | 'grok' | 'local';
  agent: AgentKey;
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
}

export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  agents: string[];
  llmProviders: string[];
  workspaceRoot: string;
  agentRuntime: AgentRuntimeSettings;
  sandbox: {
    readOnly: boolean;
    allowedRoots: string[];
  };
}

export function normalizeAgentKey(agent?: string): AgentKey {
  if (agent === 'orchestrator') {
    return 'principal';
  }
  if (agent === 'ideas' || agent === 'planning' || agent === 'principal') {
    return agent;
  }
  return 'principal';
}

export const defaultAgentRuntimeSettings: AgentRuntimeSettings = {
  provider: 'ollama',
  agent: 'principal',
  model: 'qwen2.5-coder:0.5b',
  baseUrl: 'http://chat.nightslayer.com.ar:11434',
  apiKey: '',
  temperature: 0.4
};

export function createAppConfig(workspaceRoot: string): AppConfig {
  return {
    environment: 'development',
    agents: ['ideas', 'planning', 'principal'],
    llmProviders: ['ollama', 'openai', 'gemini', 'grok', 'local'],
    workspaceRoot,
    agentRuntime: { ...defaultAgentRuntimeSettings },
    sandbox: {
      readOnly: true,
      allowedRoots: [workspaceRoot]
    }
  };
}
