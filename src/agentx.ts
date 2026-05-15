/**
 * AgentX Orchestrator
 * Smart router implementing the 4-D methodology:
 * Deconstruct → Diagnose → Develop → Dispatch
 */

import {
  AgentDefinition,
  AgentContext,
  AgentResult,
  IntentCategory,
  OrchestrationRequest,
  OrchestrationResult,
  AgentXConfig,
  MemoryStep,
  ActionItem,
  HookContext,
  ApprovalLevel,
} from './types';

export interface AgentXOptions {
  config: AgentXConfig;
  logger: any;
  memoryManager: any;
  hookManager: any;
  approvalManager: any;
  providerManager?: any;
}

export class AgentX {
  private config: AgentXConfig;
  private logger: any;
  private memoryManager: any;
  private hookManager: any;
  private approvalManager: any;
  private providerManager: any;
  private agentCache: Map<string, AgentDefinition>;

  constructor(options: AgentXOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.memoryManager = options.memoryManager;
    this.hookManager = options.hookManager;
    this.approvalManager = options.approvalManager;
    this.providerManager = options.providerManager;
    this.agentCache = new Map();

    this.initializeAgents();
  }

  private initializeAgents(): void {
    for (const agent of this.config.agents) {
      this.agentCache.set(agent.id, agent);
    }
    this.logger.info(`AgentX initialized with ${this.config.agents.length} agents`);
  }

  /**
   * Main orchestration method
   * Implements the 4-D methodology for intelligent request routing
   */
  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.logger.info(`[AgentX] Processing request: ${request.userInput.substring(0, 50)}...`);

    try {
      // PHASE 1: DECONSTRUCT
      // Break down the user input into structured components
      const deconstructed = await this.deconstruct(request);

      // PHASE 2: DIAGNOSE
      // Analyze intent and load relevant context
      const diagnosed = await this.diagnose(deconstructed);

      // PHASE 3: DEVELOP
      // Select best agent and prepare execution
      const developed = await this.develop(diagnosed);

      // PHASE 4: DISPATCH
      // Execute selected agent(s)
      const dispatched = await this.dispatch(developed);

      // Record in memory
      await this.recordExecution(request.sessionId, dispatched);

      const totalTime = Date.now() - startTime;
      this.logger.info(`[AgentX] Orchestration completed in ${totalTime}ms`);

      return this.compileResult(request.sessionId, dispatched, totalTime);
    } catch (error) {
      this.logger.error(`[AgentX] Orchestration failed: ${error}`);
      await this.hookManager.emit('onError', {
        sessionId: request.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * PHASE 1: DECONSTRUCT
   * Parse user input and extract key components
   */
  private async deconstruct(
    request: OrchestrationRequest
  ): Promise<{
    request: OrchestrationRequest;
    keywords: string[];
    entities: Map<string, string>;
    complexity: 'low' | 'medium' | 'high';
  }> {
    this.logger.debug('[DECONSTRUCT] Analyzing user input structure');

    const input = request.userInput.toLowerCase();
    const words = input.split(/\s+/);

    // Extract keywords from common patterns
    const analysisKeywords = ['analyze', 'review', 'check', 'assess', 'examine'];
    const designKeywords = ['design', 'architect', 'plan', 'structure', 'outline'];
    const codeKeywords = ['generate', 'implement', 'create', 'write', 'code'];
    const testKeywords = ['test', 'validate', 'verify', 'check', 'ensure'];

    const detectedKeywords = words.filter(
      (w) =>
        analysisKeywords.includes(w) ||
        designKeywords.includes(w) ||
        codeKeywords.includes(w) ||
        testKeywords.includes(w)
    );

    // Simple entity extraction
    const entities = new Map<string, string>();
    const fileMatch = input.match(/(?:file|in)\s+([^\s]+\.[^\s]+)/);
    if (fileMatch) {
      entities.set('targetFile', fileMatch[1]);
    }

    const complexity = this.assessComplexity(input, words.length);

    return {
      request,
      keywords: detectedKeywords,
      entities,
      complexity,
    };
  }

  /**
   * PHASE 2: DIAGNOSE
   * Detect user intent and load contextual information
   */
  private async diagnose(
    deconstructed: Awaited<ReturnType<typeof AgentX.prototype.deconstruct>>
  ): Promise<{
    deconstructed: Awaited<ReturnType<typeof AgentX.prototype.deconstruct>>;
    intent: IntentCategory;
    context: AgentContext;
    relevantHistory: MemoryStep[];
  }> {
    this.logger.debug('[DIAGNOSE] Detecting intent and loading context');

    const input = deconstructed.request.userInput.toLowerCase();
    const intent = this.detectIntent(input, deconstructed.keywords);

    // Load previous steps from memory
    const relevantHistory = await this.memoryManager.getRecentSteps(
      deconstructed.request.sessionId,
      intent,
      10
    );

    // Build agent context
    const context: AgentContext = {
      sessionId: deconstructed.request.sessionId,
      projectPath: deconstructed.request.projectPath,
      userInput: deconstructed.request.userInput,
      intent,
      fileContent: deconstructed.request.context?.fileContent,
      fileHash: deconstructed.request.context?.fileHash,
      previousSteps: relevantHistory,
      approvalRequired: false,
    };

    // Load cache key if applicable
    if (context.fileHash) {
      context.cacheKey = `${intent}:${context.fileHash}`;
    }

    return {
      deconstructed,
      intent,
      context,
      relevantHistory,
    };
  }

  /**
   * PHASE 3: DEVELOP
   * Select best agent and prepare for execution
   */
  private async develop(
    diagnosed: Awaited<ReturnType<typeof AgentX.prototype.diagnose>>
  ): Promise<{
    diagnosed: Awaited<ReturnType<typeof AgentX.prototype.diagnose>>;
    selectedAgent: AgentDefinition;
    approvalNeeded: boolean;
    contextLoaded: string;
  }> {
    this.logger.debug('[DEVELOP] Selecting agent and preparing execution');

    const { intent, context } = diagnosed;

    // Map intent to agent role
    const agentRole = this.mapIntentToAgent(intent);

    // Select best agent
    const selectedAgent = this.selectBestAgent(agentRole);
    if (!selectedAgent) {
      throw new Error(`No agent available for role: ${agentRole}`);
    }

    this.logger.debug(`[DEVELOP] Selected agent: ${selectedAgent.name} (${selectedAgent.id})`);

    // Load context incrementally based on complexity
    let contextLoaded = '';
    if (this.config.contextLoader.loadContext) {
      contextLoaded = await this.config.contextLoader.loadContext(
        context,
        diagnosed.deconstructed.complexity
      );
    }

    // Determine if approval is needed
    const approvalNeeded = selectedAgent.approvalLevel > 0;
    context.approvalRequired = approvalNeeded;

    // Emit hook
    await this.hookManager.emit('onAgentSelected', {
      sessionId: context.sessionId,
      agent: selectedAgent,
      intent,
      timestamp: Date.now(),
    } as HookContext);

    return {
      diagnosed,
      selectedAgent,
      approvalNeeded,
      contextLoaded,
    };
  }

  /**
   * PHASE 4: DISPATCH
   * Execute the selected agent
   */
  private async dispatch(
    developed: Awaited<ReturnType<typeof AgentX.prototype.develop>>
  ): Promise<{
    developed: Awaited<ReturnType<typeof AgentX.prototype.develop>>;
    results: AgentResult[];
    approvalStatus?: 'approved' | 'rejected' | 'pending';
  }> {
    this.logger.debug('[DISPATCH] Executing selected agent');

    const { selectedAgent, approvalNeeded, diagnosed } = developed;
    const { context } = diagnosed;

    // Check approval if needed
    let approvalStatus: 'approved' | 'rejected' | 'pending' | undefined;
    if (approvalNeeded) {
      approvalStatus = await this.checkApproval(selectedAgent, context);
      if (approvalStatus === 'rejected' || approvalStatus === 'pending') {
        this.logger.warn(
          `[DISPATCH] Agent execution blocked by approval framework (status: ${approvalStatus})`
        );
        return {
          developed,
          results: [],
          approvalStatus,
        };
      }
    }

    // Check cache first
    let result: AgentResult | null = null;
    if (context.cacheKey) {
      result = await this.memoryManager.getCachedResult(context.cacheKey);
      if (result) {
        this.logger.debug(`[DISPATCH] Cache hit for key: ${context.cacheKey}`);
        result.metadata.cacheHit = true;
      }
    }

    // Execute agent if no cache hit
    if (!result) {
      result = await this.executeAgent(selectedAgent, context);
    }

    // Emit success hook
    if (result.success) {
      const hookName =
        context.intent === 'analyze'
          ? 'onAnalysisComplete'
          : context.intent === 'design'
            ? 'onCodeGenerated'
            : context.intent === 'validate'
              ? 'onValidationComplete'
              : 'onAnalysisComplete';

      await this.hookManager.emit(hookName, {
        sessionId: context.sessionId,
        agent: selectedAgent.id,
        result,
        timestamp: Date.now(),
      } as HookContext);
    }

    return {
      developed,
      results: [result],
      approvalStatus,
    };
  }

  /**
   * Execute an agent with the given context
   */
  private async executeAgent(agent: AgentDefinition, context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.debug(`[EXECUTE] Running agent: ${agent.name}`);

    try {
      // Call LLM via provider manager
      const output = await this.callAgentLLM(agent, context);

      const endTime = Date.now();
      const result: AgentResult = {
        agentId: agent.id,
        role: agent.role,
        success: true,
        output,
        metadata: {
          startTime,
          endTime,
          tokensUsed: output.metadata?.tokensUsed || 0,
          costUsd: output.metadata?.costUsd || 0,
          cacheHit: output.metadata?.cached || false,
        },
      };

      // Cache result if applicable
      if (context.cacheKey) {
        await this.memoryManager.cacheResult(context.cacheKey, result);
      }

      return result;
    } catch (error) {
      const endTime = Date.now();
      return {
        agentId: agent.id,
        role: agent.role,
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          startTime,
          endTime,
          tokensUsed: 0,
          costUsd: 0,
          cacheHit: false,
        },
      };
    }
  }

  /**
   * Call LLM via provider manager with agent system prompt
   */
  private async callAgentLLM(agent: AgentDefinition, context: AgentContext): Promise<any> {
    if (!this.providerManager) {
      throw new Error('ProviderManager not initialized');
    }

    // Build messages with agent system prompt
    const messages = [
      {
        role: 'system' as const,
        content: agent.systemPrompt,
      },
      {
        role: 'user' as const,
        content: context.userInput,
      },
    ];

    // Get model for this intent
    const model = this.providerManager.getModelForIntent(context.intent);

    // Make provider call
    const response = await this.providerManager.call({
      model,
      messages,
      maxTokens: 2000,
      temperature: 0.7,
    });

    // Return response with metadata
    return {
      content: response.content,
      metadata: {
        tokensUsed: response.tokensUsed,
        costUsd: response.costUsd,
        cached: response.cached || false,
        provider: response.provider,
        latency: response.latency,
      },
    };
  }

  /**
   * Check approval status for an agent
   */
  private async checkApproval(agent: AgentDefinition, context: AgentContext): Promise<'approved' | 'rejected' | 'pending'> {
    if (!this.approvalManager) {
      return 'approved';
    }

    return this.approvalManager.checkApproval(agent, context);
  }

  /**
   * Helper: Detect user intent from keywords and patterns
   */
  private detectIntent(input: string, keywords: string[]): IntentCategory {
    const analysisKeywords = ['analyze', 'review', 'check', 'assess'];
    const designKeywords = ['design', 'architect', 'plan', 'structure'];
    const codeKeywords = ['generate', 'implement', 'create', 'write'];
    const testKeywords = ['test', 'validate', 'verify'];

    if (keywords.some((k) => analysisKeywords.includes(k))) return 'analyze';
    if (keywords.some((k) => designKeywords.includes(k))) return 'design';
    if (keywords.some((k) => codeKeywords.includes(k))) return 'generate';
    if (keywords.some((k) => testKeywords.includes(k))) return 'validate';

    // Default based on content
    if (input.includes('test') || input.includes('cover')) return 'validate';
    if (input.includes('design') || input.includes('architecture')) return 'design';
    if (input.includes('implement') || input.includes('code')) return 'generate';

    return 'analyze';
  }

  /**
   * Helper: Map intent to agent role
   */
  private mapIntentToAgent(intent: IntentCategory): string {
    const mapping: Record<IntentCategory, string> = {
      analyze: 'critic',
      design: 'architect',
      generate: 'coder',
      validate: 'tester',
    };
    return mapping[intent];
  }

  /**
   * Helper: Select best agent by role
   */
  private selectBestAgent(role: string): AgentDefinition | null {
    const candidates = this.config.agents.filter((a) => a.role === role);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    return candidates.reduce((best, agent) => {
      const score = (a: AgentDefinition) =>
        (4 - a.approvalLevel) * 10 + (a.costBudget !== undefined ? 1 : 0);
      return score(agent) > score(best) ? agent : best;
    });
  }

  /**
   * Helper: Assess input complexity
   */
  private assessComplexity(
    input: string,
    wordCount: number
  ): 'low' | 'medium' | 'high' {
    if (wordCount > 100) return 'high';
    if (wordCount > 30) return 'medium';
    return 'low';
  }

  /**
   * Record execution in memory
   */
  private async recordExecution(sessionId: string, dispatch: any): Promise<void> {
    const step: MemoryStep = {
      id: `step-${Date.now()}`,
      timestamp: Date.now(),
      agentId: dispatch.developed.selectedAgent.id,
      intentCategory: dispatch.developed.diagnosed.intent,
      content: JSON.stringify(dispatch.results[0]),
      checksum: '', // Will be computed by memory manager
      algorithm: 'sha256',
      metadata: {
        approvalStatus: dispatch.approvalStatus,
      },
    };

    await this.memoryManager.recordStep(sessionId, step);
  }

  /**
   * Compile final orchestration result
   */
  private compileResult(
    sessionId: string,
    dispatch: any,
    executionTime: number
  ): OrchestrationResult {
    const firstResult = dispatch.results[0];
    const totalTokens = dispatch.results.reduce((sum: number, r: AgentResult) => sum + r.metadata.tokensUsed, 0);
    const totalCost = dispatch.results.reduce((sum: number, r: AgentResult) => sum + r.metadata.costUsd, 0);

    return {
      sessionId,
      intentDetected: dispatch.developed.diagnosed.intent,
      selectedAgent: dispatch.developed.selectedAgent,
      agentResults: dispatch.results,
      finalOutput: firstResult.output,
      recommendedNextSteps: this.generateNextSteps(dispatch.developed.diagnosed.intent),
      totalTokens,
      totalCost,
      executionTime,
    };
  }

  /**
   * Generate recommended next steps based on intent
   */
  private generateNextSteps(intent: IntentCategory): string[] {
    const suggestions: Record<IntentCategory, string[]> = {
      analyze: ['Review identified issues', 'Plan refactoring', 'Check performance impact'],
      design: ['Review architecture', 'Create prototypes', 'Validate with team'],
      generate: ['Run tests', 'Review code quality', 'Deploy to staging'],
      validate: ['Fix failing tests', 'Improve coverage', 'Deploy to production'],
    };
    return suggestions[intent];
  }
}
