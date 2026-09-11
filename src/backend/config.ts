/**
 * Runtime configuration for the app shell and agent system.
 */
export interface AgentRuntimeSettings {
  provider: 'ollama' | 'openai' | 'gemini' | 'grok' | 'local';
  agent: 'ideas' | 'planning' | 'principal' | 'orchestrator';
  language: 'typescript' | 'javascript' | 'python' | 'markdown';
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

export const defaultAgentRuntimeSettings: AgentRuntimeSettings = {
  provider: 'ollama',
  agent: 'ideas',
  language: 'typescript',
  model: 'llama3.1',
  baseUrl: 'http://localhost:11434',
  apiKey: '',
  temperature: 0.4
};

export function createAppConfig(workspaceRoot: string): AppConfig {
  return {
    environment: 'development',
    agents: ['ideas', 'planning', 'principal', 'orchestrator'],
    llmProviders: ['ollama', 'openai', 'gemini', 'grok', 'local'],
    workspaceRoot,
    agentRuntime: { ...defaultAgentRuntimeSettings },
    sandbox: {
      readOnly: true,
      allowedRoots: [workspaceRoot]
    }
  };
}
