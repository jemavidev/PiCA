/**
 * Context Loader
 * Smart incremental context loading based on complexity and intent
 * Target: 40% token reduction vs full context
 */

import {
  AgentContext,
  ContextStep,
  ContextLoaderConfig,
  ContextLoadResult,
  MemoryStep,
} from './types';

export class ContextLoader {
  private config: ContextLoaderConfig;
  private logger: any;
  private memoryManager: any;
  private fileIO: any;
  private contextCache: Map<string, ContextLoadResult>;

  constructor(config: ContextLoaderConfig, dependencies: any) {
    this.config = config;
    this.logger = dependencies.logger;
    this.memoryManager = dependencies.memoryManager;
    this.fileIO = dependencies.fileIO;
    this.contextCache = new Map();
  }

  /**
   * Main method: Load context with appropriate detail level
   */
  async loadContext(
    context: AgentContext,
    complexity: 'low' | 'medium' | 'high'
  ): Promise<string> {
    this.logger.debug(`[ContextLoader] Loading context for intent: ${context.intent} (complexity: ${complexity})`);

    // Determine context step based on complexity and strategy
    const step = this.determineContextStep(complexity);
    const cacheKey = `${context.sessionId}:${context.intent}:${step}`;

    // Check cache
    let result = this.contextCache.get(cacheKey);
    if (result && result.cacheHit) {
      this.logger.debug(`[ContextLoader] Cache hit for context: ${step}`);
      return result.content;
    }

    // Load appropriate context level
    const loaded = await this.loadContextByStep(context, step);
    this.contextCache.set(cacheKey, loaded);

    return loaded.content;
  }

  /**
   * Determine how much context to load
   */
  private determineContextStep(complexity: 'low' | 'medium' | 'high'): ContextStep {
    if (this.config.strategy === 'full') {
      return 'full';
    }

    if (this.config.strategy === 'incremental') {
      if (complexity === 'low') return 'minimal';
      if (complexity === 'medium') return 'standard';
      return 'full';
    }

    // 'smart' strategy
    return 'standard';
  }

  /**
   * Load context at specific detail level
   */
  private async loadContextByStep(
    context: AgentContext,
    step: ContextStep
  ): Promise<ContextLoadResult> {
    const startTime = Date.now();

    let content = '';
    let tokensEstimate = 0;

    // STEP 1: INTENT (always load)
    // ~100 tokens - just the user's request
    const intentContext = this.buildIntentContext(context);
    content += intentContext.content;
    tokensEstimate += intentContext.tokens;

    if (step === 'intent') {
      return {
        step: 'intent',
        content,
        tokensEstimate,
        cacheHit: false,
      };
    }

    // STEP 2: MINIMAL
    // ~300 tokens - intent + recent history summary
    const minimalContext = this.buildMinimalContext(context);
    content += '\n' + minimalContext.content;
    tokensEstimate += minimalContext.tokens;

    if (step === 'minimal') {
      return {
        step: 'minimal',
        content,
        tokensEstimate,
        cacheHit: false,
      };
    }

    // STEP 3: STANDARD
    // ~800 tokens - minimal + file content + recent steps
    const standardContext = await this.buildStandardContext(context);
    content += '\n' + standardContext.content;
    tokensEstimate += standardContext.tokens;

    if (step === 'standard') {
      return {
        step: 'standard',
        content,
        tokensEstimate,
        cacheHit: false,
      };
    }

    // STEP 4: FULL
    // ~2000 tokens - standard + full session history + all agent states
    const fullContext = await this.buildFullContext(context);
    content += '\n' + fullContext.content;
    tokensEstimate += fullContext.tokens;

    return {
      step: 'full',
      content,
      tokensEstimate,
      cacheHit: false,
    };
  }

  /**
   * Build INTENT context (~100 tokens)
   * Just the user's request and intent category
   */
  private buildIntentContext(context: AgentContext): { content: string; tokens: number } {
    const content = `
## User Request
Intent: ${context.intent}
Input: ${context.userInput}
`;
    return { content, tokens: 100 };
  }

  /**
   * Build MINIMAL context (~200 additional tokens)
   * Previous session steps of same intent + brief project info
   */
  private buildMinimalContext(context: AgentContext): { content: string; tokens: number } {
    const previousSteps = context.previousSteps.slice(-3).map((step) => `- ${step.content.substring(0, 100)}`).join('\n');

    const content = `
## Recent Context
Project: ${context.projectPath}
Previous steps (${context.previousSteps.length} total):
${previousSteps || 'None'}
`;
    return { content, tokens: 200 };
  }

  /**
   * Build STANDARD context (~700 additional tokens)
   * Add file content and full recent steps
   */
  private async buildStandardContext(context: AgentContext): Promise<{ content: string; tokens: number }> {
    let content = '';
    let tokens = 0;

    // Add file content if provided
    if (context.fileContent) {
      const truncated = context.fileContent.substring(0, 3000);
      content += `\n## File Content\n\`\`\`\n${truncated}\n\`\`\`\n`;
      tokens += 400;
    }

    // Add recent steps in full
    if (context.previousSteps.length > 0) {
      content += '\n## Previous Analysis Steps\n';
      for (const step of context.previousSteps.slice(-5)) {
        content += `- [${new Date(step.timestamp).toISOString()}] ${step.agentId}: ${step.content.substring(0, 200)}\n`;
      }
      tokens += 300;
    }

    return { content, tokens };
  }

  /**
   * Build FULL context (~1200 additional tokens)
   * Everything: all history, all agent states, metrics
   */
  private async buildFullContext(context: AgentContext): Promise<{ content: string; tokens: number }> {
    let content = '';
    let tokens = 0;

    // Get all steps from this session
    const allSteps = await this.memoryManager.getAllSteps(context.sessionId);

    if (allSteps.length > 0) {
      content += '\n## Full Session History\n';

      const byAgent = new Map<string, MemoryStep[]>();
      for (const step of allSteps) {
        if (!byAgent.has(step.agentId)) {
          byAgent.set(step.agentId, []);
        }
        byAgent.get(step.agentId)!.push(step);
      }

      for (const [agentId, steps] of byAgent) {
        content += `\n### ${agentId} (${steps.length} executions)\n`;
        for (const step of steps.slice(-3)) {
          content += `- ${step.content.substring(0, 150)}\n`;
        }
      }

      tokens += 800;
    }

    return { content, tokens };
  }

  /**
   * Estimate tokens for a piece of text
   * Simple heuristic: ~4 characters per token
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Clear context cache
   */
  clearCache(): void {
    this.contextCache.clear();
    this.logger.debug('[ContextLoader] Context cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    totalCacheHits: number;
    estimatedTokensSaved: number;
  } {
    let totalHits = 0;
    for (const result of this.contextCache.values()) {
      if (result.cacheHit) totalHits++;
    }

    return {
      cacheSize: this.contextCache.size,
      totalCacheHits: totalHits,
      estimatedTokensSaved: totalHits * 500, // Rough estimate
    };
  }
}
