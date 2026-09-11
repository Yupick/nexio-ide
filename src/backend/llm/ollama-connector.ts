/**
 * Ollama connector for local model execution.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';
import { resolveLlmRuntimeConfig } from './runtime-config';

export class OllamaConnector implements LlmConnector {
  public readonly provider = 'ollama' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    const config = resolveLlmRuntimeConfig('ollama');
    const model = request.model ?? config.model;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(`${config.ollamaBaseUrl.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          system: request.system ?? 'You are a helpful assistant.',
          stream: false,
          options: {
            temperature: request.temperature ?? 0.2,
            num_predict: request.maxTokens ?? 256
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        response?: string;
        done?: boolean;
      };

      return {
        provider: this.provider,
        text: data.response ?? 'No response from Ollama.',
        usage: {
          promptTokens: request.prompt.length,
          completionTokens: data.response?.length ?? 0
        }
      };
    } catch (error) {
      console.warn('Ollama provider failed, using stub fallback.', error);
      return {
        provider: this.provider,
        text: `Ollama fallback response for: ${request.prompt.slice(0, 120)}`,
        usage: {
          promptTokens: request.prompt.length,
          completionTokens: 48
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
