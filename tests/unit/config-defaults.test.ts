import { createAppConfig, defaultAgentRuntimeSettings } from '../../src/backend/config';

describe('agent config defaults', () => {
  test('uses a single principal orchestrator agent and the Ollama defaults expected for the IDE', () => {
    const config = createAppConfig('/workspace');

    expect(defaultAgentRuntimeSettings.agent).toBe('principal');
    expect(defaultAgentRuntimeSettings.baseUrl).toBe('http://chat.nightslayer.com.ar:11434');
    expect(defaultAgentRuntimeSettings.model).toBe('llama3.1');
    expect(config.agents).toEqual(['ideas', 'planning', 'principal']);
  });
});
