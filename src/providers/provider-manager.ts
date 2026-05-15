/**
 * Provider Manager
 * Orchestrates multiple LLM providers with circuit breaker pattern
 * Handles failover and rate limiting
 */

import { Provider, ProviderRequest, ProviderResponse, CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerStatus } from './types';
import { OpenRouterProvider } from './openrouter-provider';

export interface ProviderConfig {
  primary: string;
  providers: Record<string, any>;
}

export interface CircuitBreaker {
  [key: string]: {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime?: number;
    nextResetTime?: number;
  };
}

export class ProviderManager {
  private providers: Map<string, Provider>;
  private circuitBreakers: CircuitBreaker;
  private cbConfig: CircuitBreakerConfig;
  private primaryProvider: string;
  private logger: any;
  private requestCount: Map<string, number>;
  private lastResetTime: Map<string, number>;

  constructor(config: ProviderConfig, logger: any) {
    this.logger = logger;
    this.providers = new Map();
    this.circuitBreakers = {};
    this.requestCount = new Map();
    this.lastResetTime = new Map();
    this.primaryProvider = config.primary;

    this.cbConfig = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      halfOpenRequests: 3,
    };

    this.initializeProviders(config);
    this.logger.info(`ProviderManager initialized with primary: ${this.primaryProvider}`);
  }

  /**
   * Initialize available providers
   */
  private initializeProviders(config: ProviderConfig): void {
    // OpenRouter provider
    if (config.providers.openrouter) {
      const provider = new OpenRouterProvider(config.providers.openrouter, this.logger);
      this.providers.set('openrouter', provider);
      this.initializeCircuitBreaker('openrouter');
    }

    // TODO: Add other providers (Anthropic, OpenAI, Gemini)
    // For now, we support OpenRouter as the primary
  }

  /**
   * Make a request through the provider manager
   */
  async call(request: ProviderRequest): Promise<ProviderResponse> {
    const providerName = request.model.split('/')[0] || this.primaryProvider;

    // Try primary provider, then failover
    const providersToTry = this.getProviderPriority(providerName);

    for (const name of providersToTry) {
      const provider = this.providers.get(name);
      if (!provider) {
        this.logger.warn(`Provider ${name} not found`);
        continue;
      }

      const cbState = this.getCircuitBreakerState(name);
      if (cbState.state === 'open') {
        this.logger.warn(`Circuit breaker OPEN for ${name}, skipping`);
        continue;
      }

      try {
        // Check rate limit
        if (!this.checkRateLimit(name)) {
          this.logger.warn(`Rate limit exceeded for ${name}`);
          continue;
        }

        // Make the call
        const response = await provider.call(request);

        // Record success
        this.recordSuccess(name);
        this.logger.debug(`[${name}] Success: ${response.tokensUsed} tokens, $${response.costUsd.toFixed(4)}`);

        return response;
      } catch (error) {
        this.logger.error(`[${name}] Failed: ${error}`);
        this.recordFailure(name);

        // If this was the last provider, throw
        if (name === providersToTry[providersToTry.length - 1]) {
          throw error;
        }

        // Otherwise, try next provider
        continue;
      }
    }

    throw new Error(`All providers failed or unavailable`);
  }

  /**
   * Get list of providers to try in order
   */
  private getProviderPriority(preferredProvider: string): string[] {
    const preferred = this.providers.has(preferredProvider) ? preferredProvider : this.primaryProvider;
    const others = Array.from(this.providers.keys()).filter((p) => p !== preferred);
    return [preferred, ...others];
  }

  /**
   * Initialize circuit breaker for provider
   */
  private initializeCircuitBreaker(providerName: string): void {
    this.circuitBreakers[providerName] = {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
    };
  }

  /**
   * Get current circuit breaker state
   */
  private getCircuitBreakerState(providerName: string): CircuitBreakerStatus {
    return this.circuitBreakers[providerName] || { state: 'closed', failureCount: 0, successCount: 0 };
  }

  /**
   * Record successful call
   */
  private recordSuccess(providerName: string): void {
    const cb = this.circuitBreakers[providerName];
    if (!cb) return;

    cb.successCount++;
    cb.failureCount = 0;

    // If in half-open, close the breaker
    if (cb.state === 'half-open' && cb.successCount >= this.cbConfig.halfOpenRequests) {
      cb.state = 'closed';
      cb.successCount = 0;
      this.logger.info(`Circuit breaker CLOSED for ${providerName}`);
    }
  }

  /**
   * Record failed call
   */
  private recordFailure(providerName: string): void {
    const cb = this.circuitBreakers[providerName];
    if (!cb) return;

    cb.failureCount++;
    cb.successCount = 0;
    cb.lastFailureTime = Date.now();

    // If threshold reached, open the breaker
    if (cb.failureCount >= this.cbConfig.failureThreshold) {
      if (cb.state !== 'open') {
        cb.state = 'open';
        cb.nextResetTime = Date.now() + this.cbConfig.resetTimeout;
        this.logger.warn(`Circuit breaker OPEN for ${providerName}`);
      }
    }

    // Check if we can transition to half-open
    if (cb.state === 'open' && cb.nextResetTime && Date.now() > cb.nextResetTime) {
      cb.state = 'half-open';
      cb.failureCount = 0;
      cb.successCount = 0;
      this.logger.info(`Circuit breaker HALF-OPEN for ${providerName}`);
    }
  }

  /**
   * Check rate limit for provider
   */
  private checkRateLimit(providerName: string): boolean {
    const provider = this.providers.get(providerName);
    if (!provider) return false;

    // Get config (from when provider was initialized)
    // For now, simple in-memory rate limiting
    const now = Date.now();
    const lastReset = this.lastResetTime.get(providerName) || 0;
    const count = this.requestCount.get(providerName) || 0;

    // Reset counter every minute
    if (now - lastReset > 60000) {
      this.requestCount.set(providerName, 0);
      this.lastResetTime.set(providerName, now);
      return true;
    }

    // Allow max 100 requests per minute (configurable)
    const maxRequests = 100;
    if (count >= maxRequests) {
      return false;
    }

    this.requestCount.set(providerName, count + 1);
    return true;
  }

  /**
   * Get health status of all providers
   */
  async getStatus(): Promise<Record<string, { healthy: boolean; message: string; circuitBreaker: CircuitBreakerStatus }>> {
    const status: Record<string, any> = {};

    for (const [name, provider] of this.providers) {
      const health = await provider.getStatus();
      const cb = this.getCircuitBreakerState(name);

      status[name] = {
        healthy: health.healthy && cb.state !== 'open',
        message: health.message,
        circuitBreaker: cb,
      };
    }

    return status;
  }

  /**
   * List available providers
   */
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get default model for intent category
   */
  getModelForIntent(intent: 'analyze' | 'design' | 'generate' | 'validate'): string {
    // Map intents to models
    const modelMap: Record<string, string> = {
      analyze: 'openrouter/deepseek/deepseek-chat', // Fast analysis
      design: 'openrouter/openai/gpt-4-turbo', // High quality design
      generate: 'openrouter/deepseek/deepseek-chat', // Code generation
      validate: 'openrouter/google/gemini-2.0-flash', // Fast validation
    };

    return modelMap[intent];
  }
}
