/**
 * LLM connector contracts.
 */
export type LlmProvider = 'openai' | 'ollama' | 'local';

export interface LlmRequest {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LlmRuntimeConfig {
  provider: LlmProvider;
  model: string;
  openaiApiKey?: string;
  openaiBaseUrl: string;
  ollamaBaseUrl: string;
  timeoutMs: number;
}

export interface LlmResponse {
  provider: LlmProvider;
  text: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface LlmConnector {
  readonly provider: LlmProvider;
  complete(request: LlmRequest): Promise<LlmResponse>;
}
