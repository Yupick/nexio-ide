/**
 * Google Gemini connector.
 */
import type { LlmConnector, LlmRequest, LlmResponse } from './types';
import { resolveLlmRuntimeConfig } from './runtime-config';

export class GeminiConnector implements LlmConnector {
  public readonly provider = 'gemini' as const;

  public async complete(request: LlmRequest): Promise<LlmResponse> {
    const config = resolveLlmRuntimeConfig('gemini');
    const model = request.model ?? config.model;
    const system = request.system ?? 'You are a helpful assistant.';

    if (!config.geminiApiKey) {
      const prompt = `${system}\n\n${request.prompt}`;
      return {
        provider: this.provider,
        text: `Gemini stub response for: ${prompt.slice(0, 120)}`,
        usage: {
          promptTokens: prompt.length,
          completionTokens: 64
        }
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetch(
        `${config.geminiBaseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: request.prompt }] }],
            generationConfig: {
              temperature: request.temperature ?? 0.2,
              maxOutputTokens: request.maxTokens ?? 256
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini request failed with ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? 'No content returned from Gemini.';
      return {
        provider: this.provider,
        text,
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
          completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0
        }
      };
    } catch (error) {
      console.warn('Gemini provider failed, using stub fallback.', error);
      const prompt = `${system}\n\n${request.prompt}`;
      return {
        provider: this.provider,
        text: `Gemini fallback response for: ${prompt.slice(0, 120)}`,
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
