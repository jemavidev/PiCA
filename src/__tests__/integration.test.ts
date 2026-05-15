/**
 * PiCA E2E Integration Tests
 * Tests core functionality end-to-end including:
 * - Framework initialization
 * - Session management
 * - Agent orchestration
 * - Hook system
 * - Approval framework
 * - Skill registry
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { initializePiCA } from '../index';
import { Logger } from '../logger';
import { HookManager } from '../hook-manager';
import { ApprovalManager } from '../approval-manager';
import { SkillRegistry } from '../skill-registry';
import type { AgentDefinition, SkillDefinition, ApprovalLevel } from '../types';

describe('PiCA Framework E2E Integration Tests', () => {
  let pica: any;
  const testProjectPath = '/tmp/pica-test';
  const testPiPath = '.pica';

  beforeAll(async () => {
    // Mock environment
    process.env.OPENROUTER_API_KEY = 'test-key-12345';

    // Initialize PiCA framework
    pica = await initializePiCA({
      projectPath: testProjectPath,
      piPath: testPiPath,
      apiKey: process.env.OPENROUTER_API_KEY,
      logLevel: 'warn', // Reduce log noise in tests
    });
  });

  describe('Framework Initialization', () => {
    it('should initialize all core managers', () => {
      expect(pica).toBeDefined();
      expect(pica.agentx).toBeDefined();
      expect(pica.logger).toBeDefined();
      expect(pica.memoryManager).toBeDefined();
      expect(pica.sessionManager).toBeDefined();
      expect(pica.providerManager).toBeDefined();
      expect(pica.hookManager).toBeDefined();
      expect(pica.approvalManager).toBeDefined();
      expect(pica.skillRegistry).toBeDefined();
    });

    it('should have correct logger instance', () => {
      expect(pica.logger).toBeInstanceOf(Logger);
    });

    it('should have correct hook manager instance', () => {
      expect(pica.hookManager).toBeInstanceOf(HookManager);
    });

    it('should have correct approval manager instance', () => {
      expect(pica.approvalManager).toBeInstanceOf(ApprovalManager);
    });

    it('should have correct skill registry instance', () => {
      expect(pica.skillRegistry).toBeInstanceOf(SkillRegistry);
    });
  });

  describe('Session Management', () => {
    it('should have session manager initialized', () => {
      expect(pica.sessionManager).toBeDefined();
    });

    it('should have session manager with expected methods', () => {
      expect(typeof pica.sessionManager.createSession).toBe('function');
      expect(typeof pica.sessionManager.completeSession).toBe('function');
    });
  });

  describe('Hook System', () => {
    it('should register hook handler', () => {
      const hookManager = pica.hookManager as HookManager;
      const handler = vi.fn();

      const handlerId = hookManager.on('onSessionStart', handler, 10);
      expect(handlerId).toBeDefined();
      expect(typeof handlerId).toBe('string');

      hookManager.off('onSessionStart', handlerId);
    });

    it('should emit hook events', async () => {
      const hookManager = pica.hookManager as HookManager;
      const handler = vi.fn();

      hookManager.on('onSessionStart', handler);
      await hookManager.emit('onSessionStart', {
        sessionId: 'test-session',
        timestamp: Date.now(),
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should execute handlers in priority order', async () => {
      const hookManager = pica.hookManager as HookManager;
      const callOrder: number[] = [];

      hookManager.on('onSessionStart', () => {
        callOrder.push(1);
      }, 1);

      hookManager.on('onSessionStart', () => {
        callOrder.push(2);
      }, 2);

      hookManager.on('onSessionStart', () => {
        callOrder.push(3);
      }, 3);

      await hookManager.emit('onSessionStart', { sessionId: 'test' });

      // Higher priority should be called first
      expect(callOrder).toEqual([3, 2, 1]);

      // Cleanup
      hookManager.clear();
    });

    it('should get event history', async () => {
      const hookManager = pica.hookManager as HookManager;

      await hookManager.emit('onSessionStart', { sessionId: 'test-1' });
      await hookManager.emit('onSessionEnd', { sessionId: 'test-1' });

      const history = hookManager.getEventHistory(10);
      expect(history.length).toBeGreaterThan(0);
      expect(history[history.length - 1].name).toBe('onSessionEnd');

      hookManager.clearEventHistory();
    });

    it('should get hook statistics', async () => {
      const hookManager = pica.hookManager as HookManager;

      hookManager.on('onSessionStart', () => {});
      hookManager.on('onAgentSelected', () => {});

      const stats = hookManager.getStats();
      expect(stats.totalHooks).toBe(8);
      expect(stats.hooksWithHandlers).toBeGreaterThan(0);
      expect(stats.totalHandlers).toBeGreaterThan(0);

      hookManager.clear();
    });
  });

  describe('Approval Framework', () => {
    it('should create approval manager', () => {
      const approvalManager = pica.approvalManager as ApprovalManager;
      expect(approvalManager).toBeDefined();
    });

    it('should auto-approve level 0 agents', async () => {
      const approvalManager = pica.approvalManager as ApprovalManager;
      const agent: AgentDefinition = {
        id: 'test-agent-0',
        role: 'coder',
        name: 'Test Coder',
        description: 'Test agent',
        systemPrompt: 'Test prompt',
        capabilities: [],
        skills: [],
        approvalLevel: 0 as ApprovalLevel,
      };

      const status = await approvalManager.checkApproval(agent, {
        sessionId: 'test-session',
        projectPath: '/tmp',
        userInput: 'test input',
        intent: 'generate',
        previousSteps: [],
        approvalRequired: false,
      });

      expect(status).toBe('approved');
    });

    it('should reject level 4 agents', async () => {
      const approvalManager = pica.approvalManager as ApprovalManager;
      const agent: AgentDefinition = {
        id: 'test-agent-4',
        role: 'coder',
        name: 'Test Coder',
        description: 'Test agent',
        systemPrompt: 'Test prompt',
        capabilities: [],
        skills: [],
        approvalLevel: 4 as ApprovalLevel,
      };

      const status = await approvalManager.checkApproval(agent, {
        sessionId: 'test-session',
        projectPath: '/tmp',
        userInput: 'test input',
        intent: 'generate',
        previousSteps: [],
        approvalRequired: false,
      });

      expect(status).toBe('rejected');
    });

    it('should require approval for level 1-3 agents', async () => {
      const approvalManager = pica.approvalManager as ApprovalManager;
      const agent: AgentDefinition = {
        id: 'test-agent-1',
        role: 'architect',
        name: 'Test Architect',
        description: 'Test agent',
        systemPrompt: 'Test prompt',
        capabilities: [],
        skills: [],
        approvalLevel: 1 as ApprovalLevel,
      };

      const status = await approvalManager.checkApproval(agent, {
        sessionId: 'test-session',
        projectPath: '/tmp',
        userInput: 'test input',
        intent: 'design',
        previousSteps: [],
        approvalRequired: false,
      });

      expect(status).toBe('pending');

      const pendingRequests = approvalManager.getPendingRequests();
      expect(pendingRequests.length).toBeGreaterThan(0);

      // Approve the request
      if (pendingRequests.length > 0) {
        approvalManager.approveRequest(pendingRequests[0].id);
        const stats = approvalManager.getStats();
        expect(stats.approvedCount).toBeGreaterThan(0);
      }
    });

    it('should track approval history', async () => {
      const approvalManager = pica.approvalManager as ApprovalManager;

      // Clear previous state
      approvalManager.clearPendingRequests();
      approvalManager.clearHistory();

      const agent: AgentDefinition = {
        id: 'test-agent',
        role: 'coder',
        name: 'Test Coder',
        description: 'Test agent',
        systemPrompt: 'Test prompt',
        capabilities: [],
        skills: [],
        approvalLevel: 2 as ApprovalLevel,
      };

      const status = await approvalManager.checkApproval(agent, {
        sessionId: 'test-session',
        projectPath: '/tmp',
        userInput: 'test input',
        intent: 'generate',
        previousSteps: [],
        approvalRequired: false,
      });

      expect(status).toBe('pending');

      const pendingRequests = approvalManager.getPendingRequests();
      if (pendingRequests.length > 0) {
        approvalManager.rejectRequest(pendingRequests[0].id);

        const history = approvalManager.getApprovalHistory(10);
        expect(history.length).toBeGreaterThan(0);
        expect(history[0].status).toBe('rejected');
      }
    });

    it('should get approval level config', () => {
      const approvalManager = pica.approvalManager as ApprovalManager;

      const levelConfig = approvalManager.getLevelConfig(0 as ApprovalLevel);
      expect(levelConfig).toBeDefined();
      expect(levelConfig.name).toBe('Auto');
      expect(levelConfig.requiresManualApproval).toBe(false);

      const level1Config = approvalManager.getLevelConfig(1 as ApprovalLevel);
      expect(level1Config.requiresManualApproval).toBe(true);
    });
  });

  describe('Skill Registry', () => {
    it('should register and retrieve skills', () => {
      const skillRegistry = pica.skillRegistry as SkillRegistry;

      const skill: SkillDefinition = {
        id: 'test-skill-1',
        name: 'Test Skill',
        description: 'A test skill',
        category: 'analyzer',
        agents: ['coder', 'tester'],
        prompts: [
          {
            name: 'test-prompt',
            content: 'Test prompt content',
            parameters: {},
          },
        ],
        examples: [],
        version: '1.0.0',
      };

      skillRegistry.registerSkill(skill);
      const retrieved = skillRegistry.getSkill('test-skill-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Skill');
      expect(retrieved?.id).toBe('test-skill-1');
    });

    it('should get skills by agent', () => {
      const skillRegistry = pica.skillRegistry as SkillRegistry;

      const skill1: SkillDefinition = {
        id: 'coder-skill-1',
        name: 'Coder Skill',
        description: 'For coders',
        category: 'generator',
        agents: ['coder'],
        prompts: [],
        examples: [],
        version: '1.0.0',
      };

      const skill2: SkillDefinition = {
        id: 'shared-skill',
        name: 'Shared Skill',
        description: 'For all',
        category: 'analyzer',
        agents: ['coder', 'tester', 'critic'],
        prompts: [],
        examples: [],
        version: '1.0.0',
      };

      skillRegistry.registerSkill(skill1);
      skillRegistry.registerSkill(skill2);

      const coderSkills = skillRegistry.getSkillsByAgent('coder');
      expect(coderSkills.length).toBeGreaterThanOrEqual(2);
      expect(coderSkills.some((s) => s.id === 'coder-skill-1')).toBe(true);
      expect(coderSkills.some((s) => s.id === 'shared-skill')).toBe(true);
    });

    it('should get skills by category', () => {
      const skillRegistry = pica.skillRegistry as SkillRegistry;

      const skill: SkillDefinition = {
        id: 'category-test-skill',
        name: 'Category Test',
        description: 'Test category filtering',
        category: 'validator',
        agents: ['tester'],
        prompts: [],
        examples: [],
        version: '1.0.0',
      };

      skillRegistry.registerSkill(skill);

      const validatorSkills = skillRegistry.getSkillsByCategory('validator');
      expect(validatorSkills.length).toBeGreaterThan(0);
      expect(validatorSkills.some((s) => s.id === 'category-test-skill')).toBe(true);
    });

    it('should search skills', () => {
      const skillRegistry = pica.skillRegistry as SkillRegistry;

      const skill: SkillDefinition = {
        id: 'searchable-skill',
        name: 'Find Me Skill',
        description: 'This is searchable',
        category: 'generator',
        agents: ['coder'],
        prompts: [],
        examples: [],
        version: '1.0.0',
      };

      skillRegistry.registerSkill(skill);

      const results = skillRegistry.search('Find Me');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((s) => s.id === 'searchable-skill')).toBe(true);
    });

    it('should get skill statistics', () => {
      const skillRegistry = pica.skillRegistry as SkillRegistry;

      const stats = skillRegistry.getStats();
      expect(stats).toBeDefined();
      expect(stats.totalSkills).toBeGreaterThanOrEqual(0);
      expect(stats.skillsByCategory).toBeDefined();
      expect(stats.skillsByAgent).toBeDefined();
    });

    it('should unregister skills', () => {
      const skillRegistry = pica.skillRegistry as SkillRegistry;

      const skill: SkillDefinition = {
        id: 'temp-skill',
        name: 'Temporary',
        description: 'To be removed',
        category: 'analyzer',
        agents: ['critic'],
        prompts: [],
        examples: [],
        version: '1.0.0',
      };

      skillRegistry.registerSkill(skill);
      expect(skillRegistry.hasSkill('temp-skill')).toBe(true);

      skillRegistry.unregisterSkill('temp-skill');
      expect(skillRegistry.hasSkill('temp-skill')).toBe(false);
    });
  });

  describe('Default Agents', () => {
    it('should have agentx initialized', () => {
      expect(pica.agentx).toBeDefined();
    });

    it('should have agentx with expected methods', () => {
      expect(typeof pica.agentx.orchestrate).toBe('function');
    });

    it('should have agentx managers initialized', () => {
      expect(pica.agentx.hookManager).toBeDefined();
      expect(pica.agentx.approvalManager).toBeDefined();
      expect(pica.agentx.providerManager).toBeDefined();
    });
  });

  describe('Integration Points', () => {
    it('should have all managers properly integrated', () => {
      expect(pica.agentx.hookManager).toBeDefined();
      expect(pica.agentx.approvalManager).toBeDefined();
      expect(pica.agentx.providerManager).toBeDefined();
    });

    it('should have logger available to all managers', () => {
      expect(pica.hookManager.logger).toBeDefined();
      expect(pica.approvalManager.logger).toBeDefined();
      expect(pica.skillRegistry.logger).toBeDefined();
    });
  });
});
