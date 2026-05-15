/**
 * PiCA - Pi Coding Agent
 * Main export file for the framework
 */

import { AgentX, type AgentXOptions } from './agentx';
import { MemoryManager, type MemoryManagerConfig } from './memory-manager';
import { SessionManager, type SessionManagerConfig } from './session-manager';
import { Logger } from './logger';
import { ContextLoader } from './context-loader';
import { PersistenceManager, type PersistenceManagerConfig } from './persistence-manager';
import { ProviderManager } from './providers/provider-manager';
import { AgentLoader } from './agent-loader';
import { HookManager } from './hook-manager';
import { ApprovalManager } from './approval-manager';
import { SkillRegistry } from './skill-registry';
import { ParallelExecutor } from './parallel-executor';
import { HygienizAgent } from './hygienizer-agent';
import { HygienizCLIHandler } from './hygienizer-cli-handler';
import { FileIO } from './utils/file-io';
import { ChecksumService } from './utils/checksum';
import {
  HygienizSessionMemory,
  createSessionMemory,
  getSessionMemory,
  deleteSessionMemory,
} from './hygienizer-session-memory';

// Core Types
export * from './types';

// Core Managers
export { AgentX, type AgentXOptions } from './agentx';
export { MemoryManager, type MemoryManagerConfig } from './memory-manager';
export { SessionManager, type SessionManagerConfig } from './session-manager';
export { Logger } from './logger';
export { ContextLoader } from './context-loader';
export { PersistenceManager, type PersistenceManagerConfig } from './persistence-manager';
export { ProviderManager } from './providers/provider-manager';
export { OpenRouterProvider } from './providers/openrouter-provider';
export { AgentLoader } from './agent-loader';
export { HookManager } from './hook-manager';
export { ApprovalManager } from './approval-manager';
export { SkillRegistry } from './skill-registry';
export { ParallelExecutor } from './parallel-executor';
export { HygienizAgent } from './hygienizer-agent';
export { HygienizCLIHandler } from './hygienizer-cli-handler';
export {
  HygienizSessionMemory,
  createSessionMemory,
  getSessionMemory,
  deleteSessionMemory,
  type FileOperation,
  type SessionFileTrack,
  type HygienizSessionState,
} from './hygienizer-session-memory';

/**
 * Initialize PiCA framework with configuration
 */
export async function initializePiCA(config: {
  projectPath: string;
  piPath: string;
  apiKey: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}): Promise<{
  agentx: AgentX;
  memoryManager: MemoryManager;
  sessionManager: SessionManager;
  logger: Logger;
  contextLoader: ContextLoader;
  persistenceManager: PersistenceManager;
  providerManager: ProviderManager;
  hookManager: HookManager;
  approvalManager: ApprovalManager;
  skillRegistry: SkillRegistry;
}> {
  const fileIOService = new FileIO(config.piPath);

  // Create logger
  const logger = new Logger('PiCA', {
    level: config.logLevel || 'info',
    logDir: `${config.piPath}/logs`,
    formats: ['jsonl', 'text'],
    maxFileSize: 10 * 1024 * 1024, // 10MB
    retention: 30, // days
  }, fileIOService);

  logger.info(`Initializing PiCA at ${config.projectPath}`);

  // Create dependencies
  const hookManager = new HookManager(logger);

  const approvalFrameworkConfig = {
    levels: {
      0: {
        name: 'Auto',
        description: 'Automatic execution',
        requiresManualApproval: false,
        auditTrail: false,
      },
      1: {
        name: 'Prompt',
        description: 'Ask before executing',
        requiresManualApproval: true,
        auditTrail: true,
      },
      2: {
        name: 'Required',
        description: 'Always require approval',
        requiresManualApproval: true,
        auditTrail: true,
      },
      3: {
        name: 'Manual',
        description: 'Manual execution only',
        requiresManualApproval: true,
        auditTrail: true,
      },
      4: {
        name: 'Blocked',
        description: 'No execution allowed',
        requiresManualApproval: false,
        auditTrail: true,
      },
    } as any,
    defaultLevel: 0 as any,
  };

  const approvalManager = new ApprovalManager(approvalFrameworkConfig, logger, hookManager);

  const checksumService = new ChecksumService();

  const dependencies = {
    logger,
    fileIO: fileIOService,
    checksumService,
    hookManager,
    approvalManager,
  };

  // Initialize managers
  const memoryManager = new MemoryManager(
    {
      sessionDir: `${config.piPath}/memory/session`,
      cacheDir: `${config.piPath}/memory/cache`,
      checksumAlgorithm: 'sha256',
      cacheDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
      keepVersions: 3,
      maxSessionSize: 100 * 1024 * 1024, // 100MB
    },
    dependencies
  );

  const sessionManager = new SessionManager(
    {
      sessionDir: `${config.piPath}/memory/session`,
      autoSaveInterval: 5000, // 5 seconds
    },
    { logger, fileIO: dependencies.fileIO, memoryManager }
  );

  const contextLoader = new ContextLoader(
    {
      strategy: 'incremental',
      maxTokensPerRequest: 4000,
      cacheDuration: 3600000, // 1 hour
      compressionEnabled: false,
    },
    { logger, memoryManager, fileIO: dependencies.fileIO }
  );

  const persistenceManager = new PersistenceManager(
    {
      baseDir: `${config.piPath}/memory`,
      autoSave: true,
      autoSaveInterval: 5000,
      consistencyCheck: true,
    },
    { logger, memoryManager, sessionManager, fileIO: dependencies.fileIO, checksumService: dependencies.checksumService }
  );

  // Initialize ProviderManager with OpenRouter
  const providerManager = new ProviderManager(
    {
      primary: 'openrouter',
      providers: {
        openrouter: {
          apiKey: config.apiKey,
          baseUrl: 'https://openrouter.ai/api/v1',
          models: {
            orchestrator: 'openrouter/openai/gpt-4-turbo',
            analysis: 'openrouter/deepseek/deepseek-chat',
            generation: 'openrouter/deepseek/deepseek-chat',
            validation: 'openrouter/google/gemini-2.0-flash',
          },
          rateLimit: 100,
          timeout: 30000,
        },
      },
    },
    logger
  );

  logger.info('ProviderManager initialized');

  // Initialize skill registry
  const skillRegistry = new SkillRegistry(logger);

  // Load agents using AgentLoader
  const agentLoader = new AgentLoader(
    {
      agentDir: `${config.piPath}/agents`,
      skillDir: `${config.piPath}/skills`,
    },
    logger
  );

  const agents = await agentLoader.loadDefaultAgents();
  logger.info(`Loaded ${agents.length} agents`);

  // Initialize AgentX with loaded agents
  const agentx = new AgentX({
    config: {
      agents,
      contextLoader: contextLoader as any,
      approvalFramework: approvalFrameworkConfig,
      hooks: {
        enabled: true,
        hooks: [],
      },
    },
    logger,
    memoryManager,
    hookManager,
    approvalManager,
    providerManager,
  });

  logger.info('PiCA initialization complete');

  return {
    agentx,
    memoryManager,
    sessionManager,
    logger,
    contextLoader,
    persistenceManager,
    providerManager,
    hookManager,
    approvalManager,
    skillRegistry,
  };
}

/**
 * Version information
 */
export const VERSION = '1.0.0-alpha';
export const NAME = 'PiCA';
