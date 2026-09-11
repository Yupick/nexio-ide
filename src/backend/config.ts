/**
 * Runtime configuration for the app shell and agent system.
 */
export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  agents: string[];
  llmProviders: string[];
  workspaceRoot: string;
  sandbox: {
    readOnly: boolean;
    allowedRoots: string[];
  };
}

export function createAppConfig(workspaceRoot: string): AppConfig {
  return {
    environment: 'development',
    agents: ['ideas', 'planning', 'principal'],
    llmProviders: ['openai', 'ollama', 'local'],
    workspaceRoot,
    sandbox: {
      readOnly: true,
      allowedRoots: [workspaceRoot]
    }
  };
}
