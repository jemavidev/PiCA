/**
 * Provider Types & Interfaces
 * Abstracts LLM provider implementations
 */

export type ProviderName = 'openrouter' | 'anthropic' | 'openai' | 'gemini';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ProviderRequest {
  model: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
}

export interface ProviderResponse {
  model: string;
  content: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  provider: ProviderName;
  latency: number;
  cached?: boolean;
}

export interface ProviderError extends Error {
  provider: ProviderName;
  code: string;
  retryable: boolean;
  statusCode?: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  nextResetTime?: number;
}

export interface Provider {
  name: ProviderName;
  enabled: boolean;
  call(request: ProviderRequest): Promise<ProviderResponse>;
  validateConfig(): boolean;
  getStatus(): Promise<{ healthy: boolean; message: string }>;
}
