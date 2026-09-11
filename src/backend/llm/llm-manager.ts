/**
 * LLM manager with provider fallback and metadata correlation.
 */
import { LocalConnector } from './local-connector';
import { OllamaConnector } from './ollama-connector';
import { OpenAIConnector } from './openai-connector';
import type { LlmConnector, LlmRequest, LlmResponse } from './types';

export interface LlmMetadata {
  agent: string;
  taskId: string;
  snapshotHash: string;
}

export interface LlmRequestWithMetadata extends LlmRequest {
  metadata: LlmMetadata;
}

export class LlmManager {
  private readonly connectors: Record<string, LlmConnector> = {
    openai: new OpenAIConnector(),
    ollama: new OllamaConnector(),
    local: new LocalConnector()
  };

  public async completeWithFallback(
    request: LlmRequestWithMetadata,
    providers: string[] = ['openai', 'ollama', 'local']
  ): Promise<LlmResponse> {
    for (const provider of providers) {
      const connector = this.connectors[provider];
      if (!connector) {
        continue;
      }

      try {
        const response = await connector.complete(request);
        return { ...response, text: `${response.text} [agent:${request.metadata.agent}]` };
      } catch (error) {
        console.warn(`LLM provider ${provider} failed:`, error);
      }
    }

    return {
      provider: 'local',
      text: `Fallback response for ${request.prompt} [agent:${request.metadata.agent}]`,
      usage: { promptTokens: 0, completionTokens: 0 }
    };
  }
}
