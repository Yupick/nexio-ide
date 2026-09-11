/**
 * Ollama connector stub for local model execution.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';

export class OllamaConnector implements LlmConnector {
  public readonly provider = 'ollama' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    return {
      provider: this.provider,
      text: `Ollama stub response for: ${request.prompt.slice(0, 120)}`,
      usage: {
        promptTokens: request.prompt.length,
        completionTokens: 48
      }
    };
  }
}
