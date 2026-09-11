/**
 * OpenAI-compatible LLM connector.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';

export class OpenAIConnector implements LlmConnector {
  public readonly provider = 'openai' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    const system = request.system ?? 'You are a helpful assistant.';
    const prompt = `${system}\n\n${request.prompt}`;

    return {
      provider: this.provider,
      text: `OpenAI stub response for: ${prompt.slice(0, 120)}`,
      usage: {
        promptTokens: prompt.length,
        completionTokens: 64
      }
    };
  }
}
