/**
 * Parallel Executor Tests
 * Tests for multi-agent parallel execution functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParallelExecutor } from '../parallel-executor';
import { Logger } from '../logger';
import type { AgentDefinition, AgentResult } from '../types';

describe('ParallelExecutor', () => {
  let executor: ParallelExecutor;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('Test', { level: 'warn' }, {} as any);
    executor = new ParallelExecutor(
      {
        maxConcurrentAgents: 3,
        agentTimeoutMs: 5000,
        consolidationStrategy: 'merge',
        respectRateLimits: true,
        enforceApprovals: true,
      },
      logger
    );
  });

  describe('Basic Parallel Execution', () => {
    it('should initialize with config', () => {
      const stats = executor.getStats();
      expect(stats.maxConcurrent).toBe(3);
      expect(stats.timeout).toBe(5000);
      expect(stats.consolidationStrategy).toBe('merge');
    });

    it('should execute multiple agents in parallel', async () => {
      const agents: AgentDefinition[] = [
        {
          id: 'agent-critic',
          role: 'critic',
          name: 'Critic',
          description: 'Code analyzer',
          systemPrompt: 'Analyze code',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
        {
          id: 'agent-coder',
          role: 'coder',
          name: 'Coder',
          description: 'Code generator',
          systemPrompt: 'Generate code',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
      ];

      const executeAgent = vi.fn(async (agent: AgentDefinition) => ({
        agentId: agent.id,
        role: agent.role,
        success: true,
        output: `Output from ${agent.name}`,
        metadata: {
          startTime: Date.now(),
          endTime: Date.now(),
          tokensUsed: 100,
          costUsd: 0.01,
          cacheHit: false,
        },
      }));

      const checkApproval = vi.fn(async () => 'approved' as const);

      const result = await executor.executeParallel({
        agents,
        context: {
          sessionId: 'test-session',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      expect(result.results.length).toBe(2);
      expect(result.executedAgents.length).toBe(2);
      expect(result.failedAgents.length).toBe(0);
      expect(result.successRate).toBe(1);
      expect(executeAgent).toHaveBeenCalledTimes(2);
    });

    it('should respect max concurrent agents', async () => {
      const concurrentExecutor = new ParallelExecutor(
        {
          maxConcurrentAgents: 1,
          agentTimeoutMs: 5000,
          consolidationStrategy: 'merge',
          respectRateLimits: false,
          enforceApprovals: false,
        },
        logger
      );

      const agents: AgentDefinition[] = Array(3).fill(null).map((_, i) => ({
        id: `agent-${i}`,
        role: 'coder' as const,
        name: `Agent ${i}`,
        description: 'Test agent',
        systemPrompt: 'Test',
        capabilities: [],
        skills: [],
        approvalLevel: 0,
      }));

      let maxConcurrent = 0;
      let currentExecuting = 0;

      const executeAgent = vi.fn(async () => {
        currentExecuting++;
        maxConcurrent = Math.max(maxConcurrent, currentExecuting);
        await new Promise((resolve) => setTimeout(resolve, 100));
        currentExecuting--;

        return {
          agentId: 'test',
          role: 'coder' as const,
          success: true,
          output: 'Test',
          metadata: {
            startTime: Date.now(),
            endTime: Date.now(),
            tokensUsed: 0,
            costUsd: 0,
            cacheHit: false,
          },
        };
      });

      await concurrentExecutor.executeParallel({
        agents,
        context: {
          sessionId: 'test',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval: async () => 'approved' as const,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      // With maxConcurrentAgents = 1, should execute sequentially
      expect(maxConcurrent).toBeLessThanOrEqual(1);
    });

    it('should handle agent failures gracefully', async () => {
      const agents: AgentDefinition[] = [
        {
          id: 'agent-1',
          role: 'critic',
          name: 'Agent 1',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
        {
          id: 'agent-2',
          role: 'coder',
          name: 'Agent 2',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
      ];

      const executeAgent = vi.fn(async (agent: AgentDefinition) => {
        if (agent.id === 'agent-1') {
          throw new Error('Agent 1 failed');
        }
        return {
          agentId: agent.id,
          role: agent.role,
          success: true,
          output: 'Success',
          metadata: {
            startTime: Date.now(),
            endTime: Date.now(),
            tokensUsed: 0,
            costUsd: 0,
            cacheHit: false,
          },
        };
      });

      const result = await executor.executeParallel({
        agents,
        context: {
          sessionId: 'test',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval: async () => 'approved' as const,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      expect(result.executedAgents.length).toBe(1);
      expect(result.failedAgents.length).toBe(1);
      expect(result.successRate).toBe(0.5);
    });

    it('should enforce approval framework', async () => {
      const agents: AgentDefinition[] = [
        {
          id: 'agent-critic',
          role: 'critic',
          name: 'Critic',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
        {
          id: 'agent-architect',
          role: 'architect',
          name: 'Architect',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 1,
        },
      ];

      const executeAgent = vi.fn(async (agent: AgentDefinition) => ({
        agentId: agent.id,
        role: agent.role,
        success: true,
        output: 'Output',
        metadata: {
          startTime: Date.now(),
          endTime: Date.now(),
          tokensUsed: 0,
          costUsd: 0,
          cacheHit: false,
        },
      }));

      const checkApproval = vi.fn(async (agent: AgentDefinition) => {
        return agent.approvalLevel > 0 ? ('rejected' as const) : ('approved' as const);
      });

      const result = await executor.executeParallel({
        agents,
        context: {
          sessionId: 'test',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      // Only critic (level 0) should be executed
      // Architect is filtered out due to approval check
      expect(result.executedAgents.length).toBe(1);
      expect(result.successRate).toBe(1); // Only 1 agent was attempted
      expect(executeAgent).toHaveBeenCalledTimes(1);
    });

    it('should apply consolidation strategy (merge)', async () => {
      const agents: AgentDefinition[] = [
        {
          id: 'agent-critic',
          role: 'critic',
          name: 'Critic',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
        {
          id: 'agent-coder',
          role: 'coder',
          name: 'Coder',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
      ];

      const executeAgent = vi.fn(async (agent: AgentDefinition) => ({
        agentId: agent.id,
        role: agent.role,
        success: true,
        output: `Output from ${agent.name}`,
        metadata: {
          startTime: Date.now(),
          endTime: Date.now(),
          tokensUsed: 100,
          costUsd: 0.01,
          cacheHit: false,
        },
      }));

      const result = await executor.executeParallel({
        agents,
        context: {
          sessionId: 'test',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval: async () => 'approved' as const,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      expect(result.consolidatedOutput).toContain('Critic Agent');
      expect(result.consolidatedOutput).toContain('Coder Agent');
      expect(result.consolidatedOutput).toContain('Output from Critic');
      expect(result.consolidatedOutput).toContain('Output from Coder');
    });

    it('should apply consolidation strategy (priority)', async () => {
      const priorityExecutor = new ParallelExecutor(
        {
          maxConcurrentAgents: 3,
          agentTimeoutMs: 5000,
          consolidationStrategy: 'priority',
          respectRateLimits: false,
          enforceApprovals: false,
        },
        logger
      );

      const agents: AgentDefinition[] = [
        {
          id: 'agent-coder',
          role: 'coder',
          name: 'Coder',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
        {
          id: 'agent-architect',
          role: 'architect',
          name: 'Architect',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
        {
          id: 'agent-critic',
          role: 'critic',
          name: 'Critic',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
      ];

      const executeAgent = vi.fn(async (agent: AgentDefinition) => ({
        agentId: agent.id,
        role: agent.role,
        success: true,
        output: `Output from ${agent.name}`,
        metadata: {
          startTime: Date.now(),
          endTime: Date.now(),
          tokensUsed: 100,
          costUsd: 0.01,
          cacheHit: false,
        },
      }));

      const result = await priorityExecutor.executeParallel({
        agents,
        context: {
          sessionId: 'test',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval: async () => 'approved' as const,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      // Should be in priority order: Architect, Critic, Coder
      const architectIndex = result.consolidatedOutput.indexOf('Architect');
      const criticIndex = result.consolidatedOutput.indexOf('Critic');
      const coderIndex = result.consolidatedOutput.indexOf('Coder');

      expect(architectIndex).toBeLessThan(criticIndex);
      expect(criticIndex).toBeLessThan(coderIndex);
    });

    it('should handle timeout gracefully', async () => {
      const timeoutExecutor = new ParallelExecutor(
        {
          maxConcurrentAgents: 1,
          agentTimeoutMs: 100, // Very short timeout
          consolidationStrategy: 'merge',
          respectRateLimits: false,
          enforceApprovals: false,
        },
        logger
      );

      const agents: AgentDefinition[] = [
        {
          id: 'agent-slow',
          role: 'coder',
          name: 'Slow Agent',
          description: 'Test',
          systemPrompt: 'Test',
          capabilities: [],
          skills: [],
          approvalLevel: 0,
        },
      ];

      const executeAgent = vi.fn(async () => {
        // Sleep longer than timeout
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {
          agentId: 'test',
          role: 'coder' as const,
          success: true,
          output: 'This should timeout',
          metadata: {
            startTime: Date.now(),
            endTime: Date.now(),
            tokensUsed: 0,
            costUsd: 0,
            cacheHit: false,
          },
        };
      });

      const result = await timeoutExecutor.executeParallel({
        agents,
        context: {
          sessionId: 'test',
          projectPath: '/tmp',
          userInput: 'test',
          intent: 'generate',
          previousSteps: [],
          approvalRequired: false,
        },
        executeAgent,
        checkApproval: async () => 'approved' as const,
        getProviderUsage: () => ({ currentRequests: 0, maxRequests: 100 }),
      });

      // Should have failed due to timeout
      expect(result.failedAgents.length).toBe(1);
      expect(result.successRate).toBe(0);
    });
  });
});
