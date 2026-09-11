/**
 * xAI Grok connector.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';
import { resolveLlmRuntimeConfig } from './runtime-config';

export class GrokConnector implements LlmConnector {
  public readonly provider = 'grok' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    const config = resolveLlmRuntimeConfig('grok');
    const model = request.model ?? config.model;
    const system = request.system ?? 'You are a helpful assistant.';

    if (!config.grokApiKey) {
      const prompt = `${system}\n\n${request.prompt}`;
      return {
        provider: this.provider,
        text: `Grok stub response for: ${prompt.slice(0, 120)}`,
        usage: {
          promptTokens: prompt.length,
          completionTokens: 64
        }
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(`${config.grokBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.grokApiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 256,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: request.prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Grok request failed with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content ?? 'No content returned from Grok.';
      return {
        provider: this.provider,
        text,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0
        }
      };
    } catch (error) {
      console.warn('Grok provider failed, using stub fallback.', error);
      const prompt = `${system}\n\n${request.prompt}`;
      return {
        provider: this.provider,
        text: `Grok fallback response for: ${prompt.slice(0, 120)}`,
        usage: {
          promptTokens: prompt.length,
          completionTokens: 64
        }
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
