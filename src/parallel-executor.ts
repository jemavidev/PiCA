/**
 * Parallel Executor
 * Coordinates parallel execution of multiple agents
 * Respects rate limiting, approval framework, and cost budgets
 */

import { AgentDefinition, AgentContext, AgentResult, IntentCategory } from './types';

export interface ParallelExecutionConfig {
  maxConcurrentAgents: number; // Max agents to run simultaneously
  agentTimeoutMs: number; // Timeout per agent
  consolidationStrategy: 'merge' | 'priority' | 'custom';
  respectRateLimits: boolean;
  enforceApprovals: boolean;
}

export interface ParallelExecutionRequest {
  agents: AgentDefinition[];
  context: AgentContext;
  executeAgent: (agent: AgentDefinition, context: AgentContext) => Promise<AgentResult>;
  checkApproval: (agent: AgentDefinition, context: AgentContext) => Promise<'approved' | 'rejected' | 'pending'>;
  getProviderUsage: () => { currentRequests: number; maxRequests: number };
}

export interface ParallelExecutionResult {
  results: AgentResult[];
  executedAgents: string[];
  failedAgents: string[];
  totalExecutionTime: number;
  consolidatedOutput: string;
  successRate: number;
}

export class ParallelExecutor {
  private config: ParallelExecutionConfig;
  private logger: any;
  private providerManager: any;
  private hookManager: any;

  constructor(config: ParallelExecutionConfig, logger: any, providerManager?: any, hookManager?: any) {
    this.config = config;
    this.logger = logger;
    this.providerManager = providerManager;
    this.hookManager = hookManager;

    this.logger.info('[ParallelExecutor] Initialized with config:', {
      maxConcurrent: config.maxConcurrentAgents,
      timeout: config.agentTimeoutMs,
      strategy: config.consolidationStrategy,
    });
  }

  /**
   * Execute multiple agents in parallel
   */
  async executeParallel(request: ParallelExecutionRequest): Promise<ParallelExecutionResult> {
    const startTime = Date.now();

    this.logger.info(`[ParallelExecutor] Starting parallel execution of ${request.agents.length} agents`);

    // Filter agents by approval status
    const approvedAgents = await this.filterByApproval(request.agents, request.context, request.checkApproval);

    if (approvedAgents.length === 0) {
      this.logger.warn('[ParallelExecutor] No agents approved for execution');
      return {
        results: [],
        executedAgents: [],
        failedAgents: request.agents.map((a) => a.id),
        totalExecutionTime: Date.now() - startTime,
        consolidatedOutput: 'No agents were approved for execution',
        successRate: 0,
      };
    }

    // Emit hook: parallel execution starting
    await this.emitHook('onParallelExecutionStart', {
      sessionId: request.context.sessionId,
      agentCount: approvedAgents.length,
      agents: approvedAgents.map((a) => ({ id: a.id, name: a.name })),
    });

    // Execute agents in batches to respect rate limiting
    const results = await this.executeBatches(approvedAgents, request);

    const executedAgents = results.filter((r) => r.success).map((r) => r.agentId);
    const failedAgents = results.filter((r) => !r.success).map((r) => r.agentId);
    const successRate = executedAgents.length / results.length;

    // Consolidate results
    const consolidatedOutput = this.consolidateResults(results, this.config.consolidationStrategy);

    // Emit hook: execution complete
    await this.emitHook('onParallelExecutionComplete', {
      sessionId: request.context.sessionId,
      successRate,
      executedCount: executedAgents.length,
      failedCount: failedAgents.length,
    });

    const totalTime = Date.now() - startTime;

    this.logger.info(`[ParallelExecutor] Parallel execution complete in ${totalTime}ms`, {
      executed: executedAgents.length,
      failed: failedAgents.length,
      successRate: (successRate * 100).toFixed(2) + '%',
    });

    return {
      results,
      executedAgents,
      failedAgents,
      totalExecutionTime: totalTime,
      consolidatedOutput,
      successRate,
    };
  }

  /**
   * Filter agents by approval status
   */
  private async filterByApproval(
    agents: AgentDefinition[],
    context: AgentContext,
    checkApproval: (agent: AgentDefinition, context: AgentContext) => Promise<'approved' | 'rejected' | 'pending'>
  ): Promise<AgentDefinition[]> {
    if (!this.config.enforceApprovals) {
      return agents;
    }

    const approved: AgentDefinition[] = [];

    for (const agent of agents) {
      const status = await checkApproval(agent, context);
      if (status === 'approved') {
        approved.push(agent);
      } else {
        this.logger.debug(`[ParallelExecutor] Agent ${agent.id} approval status: ${status}`);
      }
    }

    return approved;
  }

  /**
   * Execute agents in batches respecting rate limits
   */
  private async executeBatches(agents: AgentDefinition[], request: ParallelExecutionRequest): Promise<AgentResult[]> {
    const batchSize = this.config.maxConcurrentAgents;
    const results: AgentResult[] = [];

    for (let i = 0; i < agents.length; i += batchSize) {
      const batch = agents.slice(i, i + batchSize);

      this.logger.debug(`[ParallelExecutor] Executing batch of ${batch.length} agents`);

      // Check rate limits before executing batch
      if (this.config.respectRateLimits) {
        await this.waitForRateLimit(request.getProviderUsage());
      }

      // Execute batch in parallel
      const batchPromises = batch.map((agent) =>
        this.executeAgentWithTimeout(agent, request.context, request.executeAgent)
      );

      const batchResults = await Promise.allSettled(batchPromises);

      // Process results
      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        const agent = batch[j];

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result
          results.push({
            agentId: agent.id,
            role: agent.role,
            success: false,
            output: '',
            metadata: {
              startTime: Date.now(),
              endTime: Date.now(),
              tokensUsed: 0,
              costUsd: 0,
              cacheHit: false,
            },
            error: `Execution failed: ${result.reason}`,
          });
        }
      }
    }

    return results;
  }

  /**
   * Execute single agent with timeout
   */
  private async executeAgentWithTimeout(
    agent: AgentDefinition,
    context: AgentContext,
    executeAgent: (agent: AgentDefinition, context: AgentContext) => Promise<AgentResult>
  ): Promise<AgentResult> {
    return Promise.race([
      executeAgent(agent, context),
      this.createTimeoutPromise(this.config.agentTimeoutMs, agent),
    ]);
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(ms: number, agent: AgentDefinition): Promise<AgentResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent ${agent.id} execution timed out after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Wait for rate limit availability
   */
  private async waitForRateLimit(usage: { currentRequests: number; maxRequests: number }): Promise<void> {
    while (usage.currentRequests >= usage.maxRequests) {
      this.logger.debug('[ParallelExecutor] Rate limit reached, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }
  }

  /**
   * Consolidate results from multiple agents
   */
  private consolidateResults(results: AgentResult[], strategy: 'merge' | 'priority' | 'custom'): string {
    if (results.length === 0) {
      return 'No results to consolidate';
    }

    if (strategy === 'merge') {
      return this.mergeResults(results);
    } else if (strategy === 'priority') {
      return this.prioritizeResults(results);
    } else {
      return this.customConsolidate(results);
    }
  }

  /**
   * Merge all results together
   */
  private mergeResults(results: AgentResult[]): string {
    const sections = results
      .filter((r) => r.success)
      .map((r) => {
        const agent = this.getAgentName(r.agentId);
        return `## ${agent} Analysis\n\n${r.output}`;
      });

    if (sections.length === 0) {
      return 'All agent executions failed';
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Prioritize results by agent role
   */
  private prioritizeResults(results: AgentResult[]): string {
    const priority: Record<string, number> = {
      architect: 1, // Design first
      critic: 2, // Then analysis
      coder: 3, // Then generation
      tester: 4, // Then validation
    };

    const sorted = results
      .filter((r) => r.success)
      .sort((a, b) => {
        const aPriority = priority[a.role] || 999;
        const bPriority = priority[b.role] || 999;
        return aPriority - bPriority;
      });

    const sections = sorted.map((r) => {
      const agent = this.getAgentName(r.agentId);
      return `## ${agent}\n\n${r.output}`;
    });

    return sections.join('\n\n---\n\n');
  }

  /**
   * Custom consolidation (can be overridden)
   */
  private customConsolidate(results: AgentResult[]): string {
    return this.mergeResults(results);
  }

  /**
   * Get agent display name from ID
   */
  private getAgentName(agentId: string): string {
    const roleMatch = agentId.match(/(critic|architect|coder|tester)/i);
    if (roleMatch) {
      return roleMatch[1].charAt(0).toUpperCase() + roleMatch[1].slice(1) + ' Agent';
    }
    return agentId;
  }

  /**
   * Emit hook event
   */
  private async emitHook(hookName: string, context: any): Promise<void> {
    if (this.hookManager) {
      try {
        // Map to actual hook names if needed
        const validHooks = [
          'onSessionStart',
          'onSessionEnd',
          'onAgentSelected',
          'onAnalysisComplete',
          'onCodeGenerated',
          'onValidationComplete',
          'onError',
          'onApprovalRequired',
        ];

        // For now, skip if hook not in standard set
        if (!validHooks.includes(hookName)) {
          this.logger.debug(`[ParallelExecutor] Skipping hook ${hookName} (not in standard set)`);
          return;
        }

        await this.hookManager.emit(hookName, {
          sessionId: context.sessionId || 'parallel-execution',
          timestamp: Date.now(),
          eventData: context,
        });
      } catch (error) {
        this.logger.error(`[ParallelExecutor] Hook emission failed:`, error);
      }
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    maxConcurrent: number;
    timeout: number;
    consolidationStrategy: string;
  } {
    return {
      maxConcurrent: this.config.maxConcurrentAgents,
      timeout: this.config.agentTimeoutMs,
      consolidationStrategy: this.config.consolidationStrategy,
    };
  }
}
