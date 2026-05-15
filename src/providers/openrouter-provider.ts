/**
 * OpenRouter Provider
 * Implements LLM calls via OpenRouter API
 * Supports multiple model families: OpenAI, DeepSeek, Gemini, etc.
 */

import { Provider, ProviderRequest, ProviderResponse, ProviderError } from './types';

interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  models: Record<string, string>;
  rateLimit: number;
  timeout: number;
}

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OpenRouterRequestBody {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  provider?: Record<string, any>;
}

interface OpenRouterResponseBody {
  id: string;
  model: string;
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterProvider implements Provider {
  name = 'openrouter' as const;
  enabled = true;
  private config: OpenRouterConfig;
  private logger: any;

  constructor(config: OpenRouterConfig, logger: any) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Make a request to OpenRouter API
   */
  async call(request: ProviderRequest): Promise<ProviderResponse> {
    const startTime = Date.now();

    try {
      // Validate configuration
      if (!this.validateConfig()) {
        throw this.createError('INVALID_CONFIG', 'OpenRouter API key not configured', false);
      }

      // Get model for the request type
      const model = request.model || this.config.models.analysis;

      this.logger.debug(`[OpenRouter] Calling ${model}`);

      // Build request body
      const requestBody: OpenRouterRequestBody = {
        model,
        messages: request.messages,
        temperature: request.temperature || 0.7,
        top_p: request.topP || 1.0,
        max_tokens: request.maxTokens || 2000,
      };

      // Make HTTP request
      const response = await this.makeRequest(requestBody);

      // Parse response
      const content = response.choices[0].message.content;
      const inputTokens = response.usage.prompt_tokens;
      const outputTokens = response.usage.completion_tokens;
      const totalTokens = response.usage.total_tokens;

      // Calculate cost (OpenRouter pricing)
      const costUsd = this.calculateCost(model, inputTokens, outputTokens);

      const latency = Date.now() - startTime;

      this.logger.debug(
        `[OpenRouter] Response: ${totalTokens} tokens, $${costUsd.toFixed(4)}, ${latency}ms`
      );

      return {
        model,
        content,
        tokensUsed: totalTokens,
        inputTokens,
        outputTokens,
        costUsd,
        provider: 'openrouter',
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      this.logger.error(`[OpenRouter] Error: ${error}`);

      if (error instanceof Error && 'retryable' in error) {
        throw error;
      }

      throw this.createError(
        'API_ERROR',
        `OpenRouter API call failed: ${error instanceof Error ? error.message : String(error)}`,
        true
      );
    }
  }

  /**
   * Validate provider configuration
   */
  validateConfig(): boolean {
    return !!(this.config.apiKey && this.config.baseUrl && this.config.models);
  }

  /**
   * Check provider health
   */
  async getStatus(): Promise<{ healthy: boolean; message: string }> {
    try {
      if (!this.validateConfig()) {
        return {
          healthy: false,
          message: 'API key not configured',
        };
      }

      // Quick validation call with minimal tokens
      const response = await this.makeRequest({
        model: this.config.models.analysis,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });

      if (response.choices && response.choices.length > 0) {
        return {
          healthy: true,
          message: 'OpenRouter API is accessible',
        };
      }

      return {
        healthy: false,
        message: 'Invalid response from OpenRouter API',
      };
    } catch (error) {
      return {
        healthy: false,
        message: `OpenRouter check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Make HTTP request to OpenRouter API
   */
  private async makeRequest(body: OpenRouterRequestBody): Promise<OpenRouterResponseBody> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://pica.dev',
          'X-Title': 'PiCA Agent',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createError(
          'HTTP_ERROR',
          `OpenRouter API error: ${response.status} ${response.statusText}`,
          response.status >= 500 || response.status === 429
        );
      }

      return (await response.json()) as OpenRouterResponseBody;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError('TIMEOUT', 'OpenRouter API request timeout', true);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Calculate cost based on model and tokens
   * Pricing as of 2026-05 (approximate)
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    // Simplified pricing - in production, use actual provider rates
    const pricingRates: Record<string, { input: number; output: number }> = {
      'openrouter/openai/gpt-4-turbo': { input: 0.00001, output: 0.00003 },
      'openrouter/deepseek/deepseek-chat': { input: 0.0000015, output: 0.000006 },
      'openrouter/google/gemini-2.0-flash': { input: 0.000001, output: 0.000002 },
      'openrouter/meta-llama/llama-2-70b-chat': { input: 0.0000015, output: 0.000006 },
    };

    const rates = pricingRates[model] || { input: 0.00001, output: 0.00003 };
    return inputTokens * rates.input + outputTokens * rates.output;
  }

  /**
   * Create a typed error
   */
  private createError(code: string, message: string, retryable: boolean): ProviderError {
    const error = new Error(message) as ProviderError;
    error.provider = 'openrouter';
    error.code = code;
    error.retryable = retryable;
    return error;
  }
}
