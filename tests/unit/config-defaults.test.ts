import { createAppConfig, defaultAgentRuntimeSettings } from '../../src/backend/config';

describe('agent config defaults', () => {
  test('uses a single principal orchestrator agent and the Ollama defaults expected for the IDE', () => {
    const config = createAppConfig('/workspace');

    expect(defaultAgentRuntimeSettings.agent).toBe('principal');
    expect(defaultAgentRuntimeSettings.baseUrl).toBe('http://chat.nightslayer.com.ar:11434');
    expect(defaultAgentRuntimeSettings.model).toBe('qwen2.5-coder:0.5b');
    expect(config.agents).toEqual(['ideas', 'planning', 'principal']);
  });
});
