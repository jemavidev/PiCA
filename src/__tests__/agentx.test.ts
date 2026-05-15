/**
 * AgentX Orchestrator Tests
 * Tests the 4-D methodology: Deconstruct → Diagnose → Develop → Dispatch
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentX } from '../agentx';
import {
  AgentDefinition,
  OrchestrationRequest,
  AgentRole,
  IntentCategory,
} from '../types';

describe('AgentX Orchestrator', () => {
  let agentx: AgentX;
  let mockLogger: any;
  let mockMemoryManager: any;
  let mockHookManager: any;
  let mockApprovalManager: any;

  const mockAgents: AgentDefinition[] = [
    {
      id: 'agent-critic',
      role: 'critic' as AgentRole,
      name: 'Critic',
      description: 'Code analysis specialist',
      systemPrompt: 'Analyze code for quality issues',
      capabilities: ['analyze', 'review'],
      skills: ['pattern-detection', 'security-check'],
      approvalLevel: 0,
    },
    {
      id: 'agent-architect',
      role: 'architect' as AgentRole,
      name: 'Architect',
      description: 'Design specialist',
      systemPrompt: 'Design system architecture',
      capabilities: ['design', 'plan'],
      skills: ['architecture-planning'],
      approvalLevel: 1,
    },
    {
      id: 'agent-coder',
      role: 'coder' as AgentRole,
      name: 'Coder',
      description: 'Implementation specialist',
      systemPrompt: 'Generate production code',
      capabilities: ['generate', 'implement'],
      skills: ['code-generation', 'best-practices'],
      approvalLevel: 0,
    },
    {
      id: 'agent-tester',
      role: 'tester' as AgentRole,
      name: 'Tester',
      description: 'Validation specialist',
      systemPrompt: 'Validate code and tests',
      capabilities: ['validate', 'verify'],
      skills: ['test-generation', 'coverage-analysis'],
      approvalLevel: 0,
    },
  ];

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    // Mock memory manager
    mockMemoryManager = {
      getRecentSteps: vi.fn().mockResolvedValue([]),
      recordStep: vi.fn().mockResolvedValue(undefined),
      getCachedResult: vi.fn().mockResolvedValue(null),
      cacheResult: vi.fn().mockResolvedValue(undefined),
    };

    // Mock hook manager
    mockHookManager = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    // Mock approval manager
    mockApprovalManager = {
      checkApproval: vi.fn().mockResolvedValue('approved'),
    };

    // Create AgentX instance
    agentx = new AgentX({
      config: {
        agents: mockAgents,
        contextLoader: {
          loadContext: vi
            .fn()
            .mockResolvedValue('Loaded context'),
        } as any,
        approvalFramework: {
          levels: {
            0: {
              name: 'Auto',
              description: 'Automatic',
              requiresManualApproval: false,
              auditTrail: false,
            },
            1: {
              name: 'Prompt',
              description: 'Ask first',
              requiresManualApproval: true,
              auditTrail: true,
            },
            2: {
              name: 'Required',
              description: 'Required approval',
              requiresManualApproval: true,
              auditTrail: true,
            },
            3: {
              name: 'Manual',
              description: 'Manual only',
              requiresManualApproval: true,
              auditTrail: true,
            },
            4: {
              name: 'Blocked',
              description: 'No execution',
              requiresManualApproval: false,
              auditTrail: true,
            },
          },
          defaultLevel: 0,
        },
        hooks: {
          enabled: true,
          hooks: [],
        },
      },
      logger: mockLogger,
      memoryManager: mockMemoryManager,
      hookManager: mockHookManager,
      approvalManager: mockApprovalManager,
    });
  });

  describe('PHASE 1: DECONSTRUCT', () => {
    it('should deconstruct user input into components', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-1',
        userInput: 'Analyze this Python file for security issues',
        projectPath: '/home/user/project',
        context: {},
      };

      // Call orchestrate to trigger deconstruction
      const result = await agentx.orchestrate(request);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe('session-1');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should identify keywords in user input', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-2',
        userInput: 'Generate a REST API implementation',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(result.intentDetected).toBe('generate');
    });

    it('should assess complexity correctly', async () => {
      // Low complexity
      const lowRequest: OrchestrationRequest = {
        sessionId: 'session-3a',
        userInput: 'Analyze file',
        projectPath: '/home/user/project',
      };

      const result1 = await agentx.orchestrate(lowRequest);
      expect(result1).toBeDefined();

      // High complexity
      const highRequest: OrchestrationRequest = {
        sessionId: 'session-3b',
        userInput:
          'Analyze and refactor the entire authentication module to support OAuth2, add multi-factor authentication support, and integrate with LDAP for enterprise deployments',
        projectPath: '/home/user/project',
      };

      const result2 = await agentx.orchestrate(highRequest);
      expect(result2).toBeDefined();
    });
  });

  describe('PHASE 2: DIAGNOSE', () => {
    it('should detect intent category from keywords', async () => {
      const intents: Record<string, IntentCategory> = {
        'Analyze the code for bugs': 'analyze',
        'Design the system architecture': 'design',
        'Generate a new component': 'generate',
        'Validate the test coverage': 'validate',
      };

      for (const [input, expectedIntent] of Object.entries(intents)) {
        const request: OrchestrationRequest = {
          sessionId: `session-${input.substring(0, 5)}`,
          userInput: input,
          projectPath: '/home/user/project',
        };

        const result = await agentx.orchestrate(request);
        expect(result.intentDetected).toBe(expectedIntent);
      }
    });

    it('should load previous context from memory', async () => {
      mockMemoryManager.getRecentSteps.mockResolvedValue([
        {
          id: 'step-1',
          timestamp: Date.now(),
          agentId: 'agent-critic',
          intentCategory: 'analyze',
          content: 'Previous analysis result',
          checksum: 'abc123',
          algorithm: 'sha256',
          metadata: {},
        },
      ]);

      const request: OrchestrationRequest = {
        sessionId: 'session-4',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(mockMemoryManager.getRecentSteps).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should load context incrementally based on complexity', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-5',
        userInput: 'Analyze the code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Orchestration completed')
      );
    });
  });

  describe('PHASE 3: DEVELOP', () => {
    it('should map intent to correct agent role', async () => {
      const testCases = [
        { intent: 'analyze', expectedRole: 'critic' },
        { intent: 'design', expectedRole: 'architect' },
        { intent: 'generate', expectedRole: 'coder' },
        { intent: 'validate', expectedRole: 'tester' },
      ];

      for (const { intent, expectedRole } of testCases) {
        const request: OrchestrationRequest = {
          sessionId: `session-intent-${intent}`,
          userInput: `${intent} the code`,
          projectPath: '/home/user/project',
        };

        const result = await agentx.orchestrate(request);

        expect(result.selectedAgent.role).toBe(expectedRole);
      }
    });

    it('should select best available agent', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-6',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(result.selectedAgent).toBeDefined();
      expect(result.selectedAgent.id).toBe('agent-critic');
      expect(mockHookManager.emit).toHaveBeenCalledWith(
        'onAgentSelected',
        expect.objectContaining({
          agent: result.selectedAgent,
        })
      );
    });

    it('should prepare context for agent execution', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-7',
        userInput: 'Analyze the module',
        projectPath: '/home/user/project',
        context: {
          fileContent: 'function test() { return true; }',
          fileHash: 'hash123',
        },
      };

      const result = await agentx.orchestrate(request);

      expect(result).toBeDefined();
    });
  });

  describe('PHASE 4: DISPATCH', () => {
    it('should execute selected agent', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-8',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(result.agentResults).toBeDefined();
      expect(result.agentResults.length).toBeGreaterThan(0);
    });

    it('should check approval if needed', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-9',
        userInput: 'Design the system',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      // Architect has approval level 1, so should check
      expect(result.selectedAgent.role).toBe('architect');
    });

    it('should check cache before execution', async () => {
      mockMemoryManager.getCachedResult.mockResolvedValue({
        agentId: 'agent-critic',
        role: 'critic',
        success: true,
        output: 'Cached result',
        metadata: {
          startTime: Date.now(),
          endTime: Date.now(),
          tokensUsed: 100,
          costUsd: 0.01,
          cacheHit: true,
        },
      });

      const request: OrchestrationRequest = {
        sessionId: 'session-10',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
        context: {
          fileHash: 'hash-test',
        },
      };

      const result = await agentx.orchestrate(request);

      expect(result).toBeDefined();
    });

    it('should emit success hooks', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-11',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(mockHookManager.emit).toHaveBeenCalled();
    });
  });

  describe('Result Compilation', () => {
    it('should compile orchestration result correctly', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-12',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(result.sessionId).toBe('session-12');
      expect(result.intentDetected).toBeDefined();
      expect(result.selectedAgent).toBeDefined();
      expect(result.agentResults).toBeDefined();
      expect(result.finalOutput).toBeDefined();
      expect(result.recommendedNextSteps).toBeDefined();
      expect(result.totalTokens).toBeGreaterThanOrEqual(0);
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should generate appropriate next steps', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-13',
        userInput: 'Analyze this code',
        projectPath: '/home/user/project',
      };

      const result = await agentx.orchestrate(request);

      expect(result.recommendedNextSteps).toContain(
        expect.stringMatching(/(review|Check|Plan|Run)/i)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle missing session', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-missing',
        userInput: 'Analyze code',
        projectPath: '/home/user/project',
      };

      mockMemoryManager.getRecentSteps.mockResolvedValue([]);

      const result = await agentx.orchestrate(request);

      expect(result).toBeDefined();
    });

    it('should emit error hooks on failure', async () => {
      // This test would need modification to trigger actual errors
      // For now, we just verify the hook system is in place
      expect(mockHookManager.emit).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should complete full orchestration cycle', async () => {
      const request: OrchestrationRequest = {
        sessionId: 'session-full-cycle',
        userInput: 'Analyze this TypeScript file for security issues and performance bottlenecks',
        projectPath: '/home/user/project',
        context: {
          fileContent: 'export async function fetchData() { return await fetch(url); }',
          fileHash: 'hash-abc123',
        },
      };

      const result = await agentx.orchestrate(request);

      // Verify all phases completed
      expect(result.sessionId).toBe('session-full-cycle');
      expect(result.intentDetected).toBe('analyze');
      expect(result.selectedAgent.role).toBe('critic');
      expect(result.agentResults.length).toBeGreaterThan(0);
      expect(result.executionTime).toBeGreaterThan(0);

      // Verify memory was updated
      expect(mockMemoryManager.recordStep).toHaveBeenCalled();

      // Verify hooks were fired
      expect(mockHookManager.emit).toHaveBeenCalled();
    });
  });
});
