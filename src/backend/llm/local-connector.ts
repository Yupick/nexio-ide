/**
 * Local model stub used for offline development and tests.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';

export class LocalConnector implements LlmConnector {
  public readonly provider = 'local' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    return {
      provider: this.provider,
      text: `Local stub response for: ${request.prompt.slice(0, 120)}`,
      usage: {
        promptTokens: request.prompt.length,
        completionTokens: 32
      }
    };
  }
}
