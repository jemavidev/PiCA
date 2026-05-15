import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryManager } from '../memory-manager';
import type { MemorySession, MemoryStep } from '../types';

function createMockFileIO() {
  const storage = new Map<string, any>();
  return {
    storage,
    readJSON: vi.fn(async (path: string) => {
      if (!storage.has(path)) throw new Error(`Not found: ${path}`);
      return storage.get(path);
    }),
    writeJSON: vi.fn(async (path: string, data: any) => {
      storage.set(path, data);
    }),
    delete: vi.fn(async (path: string) => {
      storage.delete(path);
    }),
    listDir: vi.fn(async (dir: string) => {
      const prefix = dir.endsWith('/') ? dir : dir + '/';
      return Array.from(storage.keys()).filter((k) => k.startsWith(prefix)).map((k) => k.substring(prefix.length));
    }),
  };
}

function createMockChecksumService() {
  return {
    compute: vi.fn(async (content: string) => {
      return content + '-hash';
    }),
    verify: vi.fn(async (content: string, checksum: string) => {
      return (content + '-hash') === checksum;
    }),
  };
}

const config = {
  sessionDir: 'memory/session',
  cacheDir: 'memory/cache',
  checksumAlgorithm: 'sha256' as const,
  cacheDuration: 60_000,
  keepVersions: 3,
  maxSessionSize: 10 * 1024 * 1024,
};

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let mockFileIO: any;
  let mockChecksumService: any;

  beforeEach(() => {
    mockFileIO = createMockFileIO();
    mockChecksumService = createMockChecksumService();

    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    memoryManager = new MemoryManager(config, {
      logger,
      fileIO: mockFileIO,
      checksumService: mockChecksumService,
    });
  });

  describe('recordStep with checksum', () => {
    it('should compute checksum and store step', async () => {
      const sessionId = 'test-session';
      const projectPath = '/test/project';

      await memoryManager.loadOrCreateSession(sessionId, projectPath);

      const step = {
        id: 'step-1',
        timestamp: Date.now(),
        agentId: 'agent-critic',
        intentCategory: 'analyze',
        content: 'test content',
        metadata: {},
      };

      await memoryManager.recordStep(sessionId, step);

      expect(mockChecksumService.compute).toHaveBeenCalledWith('test content', 'sha256');
      expect(mockFileIO.writeJSON).toHaveBeenCalled();

      const recentSteps = await memoryManager.getRecentSteps(sessionId, 'analyze', 10);
      expect(recentSteps.length).toBe(1);
      expect(recentSteps[0].checksum).toBe('test content-hash');
    });
  });

  describe('validateSession', () => {
    it('should validate session with matching checksums', async () => {
      const sessionId = 'test-session';
      const projectPath = '/test/project';

      const session = await memoryManager.loadOrCreateSession(sessionId, projectPath);

      const step = {
        id: 'step-1',
        timestamp: Date.now(),
        agentId: 'agent-critic',
        intentCategory: 'analyze',
        content: 'valid content',
        metadata: {},
      };

      await memoryManager.recordStep(sessionId, step);

      mockChecksumService.compute.mockImplementation(async (content: string) => {
        return content + '-hash';
      });

      const validation = await memoryManager.validateSession(session);

      expect(validation.isValid).toBe(true);
      expect(validation.algorithm).toBe('sha256');
    });

    it('should detect checksum mismatch', async () => {
      const sessionId = 'test-session';
      const projectPath = '/test/project';

      const session = await memoryManager.loadOrCreateSession(sessionId, projectPath);

      const step = {
        id: 'step-1',
        timestamp: Date.now(),
        agentId: 'agent-critic',
        intentCategory: 'analyze',
        content: 'original content',
        metadata: {},
      };

      await memoryManager.recordStep(sessionId, step);

      mockChecksumService.compute.mockImplementation(async () => {
        return 'different-hash';
      });

      const validation = await memoryManager.validateSession(session);

      expect(validation.isValid).toBe(false);
    });

    it('should return checksum in expected field (not timestamp)', async () => {
      const sessionId = 'test-session';
      const projectPath = '/test/project';

      const session = await memoryManager.loadOrCreateSession(sessionId, projectPath);

      const step = {
        id: 'step-1',
        timestamp: Date.now(),
        agentId: 'agent-critic',
        intentCategory: 'analyze',
        content: 'test content',
        metadata: {},
      };

      await memoryManager.recordStep(sessionId, step);

      const validation = await memoryManager.validateSession(session);

      expect(validation.expected).not.toBeNaN();
      expect(validation.expected).toBe('test content-hash');
      expect(Number.isFinite(Number(validation.expected))).toBe(false);
    });
  });

  describe('cacheResult and getCachedResult', () => {
    it('should cache result and retrieve it', async () => {
      const cacheKey = 'cache:key:123';
      const result = {
        id: 'result-1',
        agentId: 'agent-critic',
        success: true,
        output: 'test output',
        usage: { inputTokens: 100, outputTokens: 50 },
        metadata: {},
      };

      await memoryManager.cacheResult(cacheKey, result);

      const retrieved = await memoryManager.getCachedResult(cacheKey);

      expect(retrieved).toEqual(result);
    });

    it('should return null for non-existent cache key', async () => {
      const retrieved = await memoryManager.getCachedResult('nonexistent:key');
      expect(retrieved).toBeNull();
    });

    it('should return null for expired cache', async () => {
      const cacheKey = 'cache:expiring';
      const result = {
        id: 'result-1',
        agentId: 'agent-critic',
        success: true,
        output: 'test output',
        usage: { inputTokens: 100, outputTokens: 50 },
        metadata: {},
      };

      await memoryManager.cacheResult(cacheKey, result, 1);

      await new Promise((r) => setTimeout(r, 5));

      const retrieved = await memoryManager.getCachedResult(cacheKey);
      expect(retrieved).toBeNull();
    });
  });

  describe('createCheckpoint and rollbackToCheckpoint', () => {
    it('should create checkpoint and restore it', async () => {
      const sessionId = 'test-session';
      const projectPath = '/test/project';

      const session = await memoryManager.loadOrCreateSession(sessionId, projectPath);

      const step1 = {
        id: 'step-1',
        timestamp: Date.now(),
        agentId: 'agent-critic',
        intentCategory: 'analyze',
        content: 'content 1',
        metadata: {},
      };

      await memoryManager.recordStep(sessionId, step1);

      const checkpointId = await memoryManager.createCheckpoint(sessionId, 'before-refactor');

      expect(checkpointId).toMatch(/^checkpoint-/);
      expect(mockFileIO.writeJSON).toHaveBeenCalled();

      const step2 = {
        id: 'step-2',
        timestamp: Date.now(),
        agentId: 'agent-critic',
        intentCategory: 'analyze',
        content: 'content 2',
        metadata: {},
      };

      await memoryManager.recordStep(sessionId, step2);

      let recentSteps = await memoryManager.getRecentSteps(sessionId, 'analyze', 10);
      expect(recentSteps.length).toBe(2);

      await memoryManager.rollbackToCheckpoint(sessionId, checkpointId);

      recentSteps = await memoryManager.getRecentSteps(sessionId, 'analyze', 10);
      expect(recentSteps.length).toBe(1);
    });
  });

  describe('listCheckpoints', () => {
    it('should list checkpoints for a session', async () => {
      const sessionId = 'test-session';
      const projectPath = '/test/project';

      await memoryManager.loadOrCreateSession(sessionId, projectPath);

      const checkpoint1 = await memoryManager.createCheckpoint(sessionId, 'checkpoint-1');

      const checkpoints = await memoryManager.listCheckpoints(sessionId);

      expect(checkpoints.length).toBeGreaterThanOrEqual(1);
      expect(checkpoints[0]).toHaveProperty('id');
      expect(checkpoints[0]).toHaveProperty('label');
      expect(checkpoints[0]).toHaveProperty('timestamp');
      expect(checkpoints[0].id).toBe(checkpoint1);
    });

    it('should return empty array when no checkpoints exist', async () => {
      const checkpoints = await memoryManager.listCheckpoints('nonexistent-session');
      expect(checkpoints).toEqual([]);
    });
  });
});
