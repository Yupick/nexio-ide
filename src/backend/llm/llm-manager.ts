/**
 * LLM manager with provider fallback and metadata correlation.
 */
import { GeminiConnector } from './gemini-connector';
import { GrokConnector } from './grok-connector';
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
    gemini: new GeminiConnector(),
    grok: new GrokConnector(),
    local: new LocalConnector()
  };

  public async checkProviderHealth(provider: string): Promise<{ provider: string; ok: boolean; baseUrl: string; model?: string; message?: string; }> {
    const connector = this.connectors[provider];
    if (!connector || typeof connector.checkHealth !== 'function') {
      return {
        provider,
        ok: false,
        baseUrl: '',
        message: `Provider ${provider} does not support health checks.`
      };
    }

    return connector.checkHealth();
  }

  public async completeWithFallback(
    request: LlmRequestWithMetadata,
    providers: string[] = ['ollama', 'openai', 'gemini', 'grok', 'local']
  ): Promise<LlmResponse> {
    for (const provider of providers) {
      const connector = this.connectors[provider];
      if (!connector) {
        continue;
      }

      try {
        const response = await connector.complete(request);
        return {
          ...response,
          text: `${response.text} [agent:${request.metadata.agent}]`,
          metadata: {
            ...(response.metadata ?? {}),
            agent: request.metadata.agent,
            taskId: request.metadata.taskId,
            snapshotHash: request.metadata.snapshotHash,
            provider: response.provider,
            model: request.model ?? response.provider
          }
        };
      } catch (error) {
        console.warn(`LLM provider ${provider} failed:`, error);
      }
    }

    return {
      provider: 'local',
      text: `Fallback response for ${request.prompt} [agent:${request.metadata.agent}]`,
      usage: { promptTokens: 0, completionTokens: 0 },
      metadata: {
        agent: request.metadata.agent,
        taskId: request.metadata.taskId,
        snapshotHash: request.metadata.snapshotHash,
        provider: 'local',
        model: request.model ?? 'local-model'
      }
    };
  }
}
