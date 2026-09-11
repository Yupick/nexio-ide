/**
 * LLM connector contracts.
 */
export type LlmProvider = 'openai' | 'ollama' | 'local';

export interface LlmRequest {
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
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
