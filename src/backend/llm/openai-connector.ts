/**
 * OpenAI-compatible LLM connector.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';
import { resolveLlmRuntimeConfig } from './runtime-config';

export class OpenAIConnector implements LlmConnector {
  public readonly provider = 'openai' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    const config = resolveLlmRuntimeConfig('openai');
    const system = request.system ?? 'You are a helpful assistant.';
    const model = request.model ?? config.model;

    if (!config.openaiApiKey) {
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(`${config.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey}`
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
        throw new Error(`OpenAI request failed with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content ?? 'No content returned from OpenAI.';
      return {
        provider: this.provider,
        text,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0
        }
      };
    } catch (error) {
      console.warn('OpenAI provider failed, using stub fallback.', error);
      const prompt = `${system}\n\n${request.prompt}`;
      return {
        provider: this.provider,
        text: `OpenAI fallback response for: ${prompt.slice(0, 120)}`,
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
