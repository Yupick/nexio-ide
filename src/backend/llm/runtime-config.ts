import 'dotenv/config';

import type { LlmProvider, LlmRuntimeConfig } from './types';

const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = {
  openai: 'gpt-4o-mini',
  ollama: 'llama3.1',
  local: 'local-model'
};

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveLlmRuntimeConfig(provider: LlmProvider): LlmRuntimeConfig {
  const configuredProvider = (process.env.DEFAULT_LLM_PROVIDER as LlmProvider | undefined) ?? provider;

  return {
    provider: configuredProvider,
    model: process.env.MODEL_NAME ?? DEFAULT_MODEL_BY_PROVIDER[provider] ?? 'local-model',
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434',
    timeoutMs: readNumber('LLM_TIMEOUT_MS', 30000)
  };
}
