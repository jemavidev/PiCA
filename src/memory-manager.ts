/**
 * Memory Manager
 * Handles memory persistence with SHA256 checksums, session tracking, and analysis caching
 */

import {
  MemoryStep,
  MemorySession,
  AnalysisCache,
  ChecksumValidationResult,
  SessionMetadata,
  AgentResult,
} from './types';

export interface MemoryManagerConfig {
  sessionDir: string;
  cacheDir: string;
  checksumAlgorithm: 'sha256' | 'md5';
  cacheDuration: number; // milliseconds
  keepVersions: number;
  maxSessionSize: number; // bytes
}

export class MemoryManager {
  private config: MemoryManagerConfig;
  private logger: any;
  private checksumService: any;
  private fileIO: any;
  private sessions: Map<string, MemorySession>;
  private cache: Map<string, AnalysisCache>;

  constructor(config: MemoryManagerConfig, dependencies: any) {
    this.config = config;
    this.logger = dependencies.logger;
    this.checksumService = dependencies.checksumService;
    this.fileIO = dependencies.fileIO;
    this.sessions = new Map();
    this.cache = new Map();

    this.logger.info(`MemoryManager initialized with algorithm: ${config.checksumAlgorithm}`);
  }

  /**
   * Load or create a session
   */
  async loadOrCreateSession(sessionId: string, projectPath: string): Promise<MemorySession> {
    // Check if already in memory
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      // Validate checksum
      const validation = await this.validateSession(session);
      if (!validation.isValid) {
        this.logger.warn(`Session ${sessionId} failed checksum validation`);
      }
      return session;
    }

    // Try to load from disk
    const session = await this.loadSessionFromDisk(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
      return session;
    }

    // Create new session
    const newSession: MemorySession = {
      id: sessionId,
      projectPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1.0.0',
      steps: [],
      checksumValidation: {
        algorithm: this.config.checksumAlgorithm,
        lastVerified: Date.now(),
        isValid: true,
      },
    };

    this.sessions.set(sessionId, newSession);
    await this.saveSessionToDisk(newSession);
    return newSession;
  }

  /**
   * Record a new step in the session
   */
  async recordStep(sessionId: string, step: Omit<MemoryStep, 'checksum'>): Promise<void> {
    const session = await this.loadOrCreateSession(sessionId, '');
    if (!session) {
      throw new Error(`Failed to load session: ${sessionId}`);
    }

    // Compute checksum
    const checksum = await this.checksumService.compute(step.content, this.config.checksumAlgorithm);

    const stepWithChecksum: MemoryStep = {
      ...step,
      checksum,
    };

    session.steps.push(stepWithChecksum);
    session.updatedAt = Date.now();

    // Validate session integrity
    const validation = await this.validateSession(session);
    session.checksumValidation = {
      algorithm: this.config.checksumAlgorithm,
      lastVerified: Date.now(),
      isValid: validation.isValid,
    };

    // Check size limits
    const sessionSize = JSON.stringify(session).length;
    if (sessionSize > this.config.maxSessionSize) {
      await this.pruneOldSteps(sessionId);
    }

    this.sessions.set(sessionId, session);
    await this.saveSessionToDisk(session);

    this.logger.debug(`Recorded step in session ${sessionId}`);
  }

  /**
   * Get recent steps for a session filtered by intent
   */
  async getRecentSteps(
    sessionId: string,
    intentCategory: string,
    limit: number = 10
  ): Promise<MemoryStep[]> {
    const session = await this.loadOrCreateSession(sessionId, '');
    if (!session) {
      return [];
    }

    return session.steps
      .filter((step) => step.intentCategory === intentCategory)
      .slice(-limit);
  }

  /**
   * Get all steps for a session
   */
  async getAllSteps(sessionId: string): Promise<MemoryStep[]> {
    const session = await this.loadOrCreateSession(sessionId, '');
    return session?.steps || [];
  }

  /**
   * Cache an analysis result by file hash
   */
  async cacheResult(cacheKey: string, result: AgentResult, durationMs?: number): Promise<void> {
    const duration = durationMs || this.config.cacheDuration;
    const expiresAt = Date.now() + duration;

    const cacheEntry: AnalysisCache = {
      fileHash: cacheKey.split(':')[1] || cacheKey,
      agentId: result.agentId,
      result,
      createdAt: Date.now(),
      expiresAt,
      hits: 0,
    };

    this.cache.set(cacheKey, cacheEntry);
    await this.saveCacheToDisk(cacheKey, cacheEntry);

    this.logger.debug(`Cached result with key: ${cacheKey}`);
  }

  /**
   * Retrieve cached result if still valid
   */
  async getCachedResult(cacheKey: string): Promise<AgentResult | null> {
    // Check memory first
    let cacheEntry = this.cache.get(cacheKey);

    // Fall back to disk
    if (!cacheEntry) {
      cacheEntry = await this.loadCacheFromDisk(cacheKey);
    }

    if (!cacheEntry) {
      return null;
    }

    // Check expiration
    if (cacheEntry.expiresAt < Date.now()) {
      this.logger.debug(`Cache expired for key: ${cacheKey}`);
      this.cache.delete(cacheKey);
      await this.deleteCacheFile(cacheKey);
      return null;
    }

    // Update hits
    cacheEntry.hits++;
    this.cache.set(cacheKey, cacheEntry);

    this.logger.debug(`Cache hit for key: ${cacheKey} (hits: ${cacheEntry.hits})`);

    return cacheEntry.result;
  }

  /**
   * Validate session integrity using checksums
   */
  async validateSession(session: MemorySession): Promise<ChecksumValidationResult> {
    let isValid = true;

    for (const step of session.steps) {
      const computed = await this.checksumService.compute(
        step.content,
        this.config.checksumAlgorithm
      );

      if (computed !== step.checksum) {
        this.logger.warn(`Checksum mismatch for step ${step.id}`);
        isValid = false;
        break;
      }
    }

    const lastStep = session.steps[session.steps.length - 1];
    return {
      isValid,
      expected: lastStep?.checksum ?? '',
      actual: isValid ? lastStep?.checksum ?? '' : 'MISMATCH',
      algorithm: this.config.checksumAlgorithm,
    };
  }

  /**
   * Create a checkpoint for potential rollback
   */
  async createCheckpoint(sessionId: string, label: string): Promise<string> {
    const session = await this.loadOrCreateSession(sessionId, '');
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const checkpointId = `checkpoint-${Date.now()}`;
    const checkpointData = {
      id: checkpointId,
      sessionId,
      label,
      timestamp: Date.now(),
      steps: [...session.steps],
      metadata: session.checksumValidation,
    };

    await this.fileIO.writeJSON(`memory/checkpoints/${checkpointId}.json`, checkpointData);

    this.logger.info(`Created checkpoint: ${checkpointId}`);
    return checkpointId;
  }

  /**
   * Rollback to a checkpoint
   */
  async rollbackToCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    const checkpointData = await this.fileIO.readJSON(
      `memory/checkpoints/${checkpointId}.json`
    );

    if (!checkpointData) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const session = await this.loadOrCreateSession(sessionId, '');
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.steps = checkpointData.steps;
    session.updatedAt = Date.now();
    session.checksumValidation = checkpointData.metadata;

    this.sessions.set(sessionId, session);
    await this.saveSessionToDisk(session);

    this.logger.info(`Rolled back to checkpoint: ${checkpointId}`);
  }

  /**
   * List available checkpoints
   */
  async listCheckpoints(sessionId: string): Promise<Array<{ id: string; label: string; timestamp: number }>> {
    try {
      const files = await this.fileIO.listDir('memory/checkpoints');
      const results = await Promise.all(
        files
          .filter((f: string) => f.endsWith('.json'))
          .map(async (f: string) => {
            try {
              const data = await this.fileIO.readJSON(`memory/checkpoints/${f}`);
              if (data?.sessionId === sessionId) {
                return { id: data.id, label: data.label, timestamp: data.timestamp };
              }
              return null;
            } catch {
              return null;
            }
          })
      );
      return results.filter((c): c is { id: string; label: string; timestamp: number } => c !== null);
    } catch {
      return [];
    }
  }

  /**
   * Delete old sessions and cache entries
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Cleanup sessions
    for (const [sessionId, session] of this.sessions) {
      if (now - session.updatedAt > maxAge) {
        this.sessions.delete(sessionId);
        await this.fileIO.delete(`memory/session/${sessionId}.json`);
        this.logger.debug(`Cleaned up old session: ${sessionId}`);
      }
    }

    // Cleanup cache
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        await this.deleteCacheFile(key);
      }
    }

    this.logger.info('Memory cleanup completed');
  }

  /**
   * Export session data for backup
   */
  async exportSession(sessionId: string): Promise<string> {
    const session = await this.loadOrCreateSession(sessionId, '');
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return JSON.stringify(session, null, 2);
  }

  /**
   * Import session data from backup
   */
  async importSession(sessionId: string, data: string): Promise<void> {
    const session: MemorySession = JSON.parse(data);

    // Validate before importing
    const validation = await this.validateSession(session);
    if (!validation.isValid) {
      throw new Error('Imported session failed checksum validation');
    }

    this.sessions.set(sessionId, session);
    await this.saveSessionToDisk(session);

    this.logger.info(`Imported session: ${sessionId}`);
  }

  /**
   * Get memory statistics
   */
  getStats(): {
    totalSessions: number;
    totalSteps: number;
    cacheSize: number;
    memoryUsage: number;
  } {
    let totalSteps = 0;
    for (const session of this.sessions.values()) {
      totalSteps += session.steps.length;
    }

    return {
      totalSessions: this.sessions.size,
      totalSteps,
      cacheSize: this.cache.size,
      memoryUsage: JSON.stringify(Array.from(this.sessions.values())).length,
    };
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private async loadSessionFromDisk(sessionId: string): Promise<MemorySession | null> {
    try {
      return await this.fileIO.readJSON(`memory/session/${sessionId}.json`);
    } catch {
      return null;
    }
  }

  private async saveSessionToDisk(session: MemorySession): Promise<void> {
    await this.fileIO.writeJSON(`memory/session/${session.id}.json`, session);
  }

  private async saveCacheToDisk(cacheKey: string, cacheEntry: AnalysisCache): Promise<void> {
    const sanitizedKey = cacheKey.replace(/[^a-z0-9-]/gi, '_');
    await this.fileIO.writeJSON(`memory/cache/${sanitizedKey}.json`, cacheEntry);
  }

  private async loadCacheFromDisk(cacheKey: string): Promise<AnalysisCache | undefined> {
    try {
      const sanitizedKey = cacheKey.replace(/[^a-z0-9-]/gi, '_');
      return await this.fileIO.readJSON(`memory/cache/${sanitizedKey}.json`);
    } catch {
      return undefined;
    }
  }

  private async deleteCacheFile(cacheKey: string): Promise<void> {
    try {
      const sanitizedKey = cacheKey.replace(/[^a-z0-9-]/gi, '_');
      await this.fileIO.delete(`memory/cache/${sanitizedKey}.json`);
    } catch {
      // Silently ignore delete errors
    }
  }

  private async pruneOldSteps(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Keep only the most recent steps per intent category
    const stepsPerCategory = new Map<string, MemoryStep[]>();
    for (const step of session.steps) {
      const key = step.intentCategory;
      if (!stepsPerCategory.has(key)) {
        stepsPerCategory.set(key, []);
      }
      stepsPerCategory.get(key)!.push(step);
    }

    session.steps = [];
    for (const steps of stepsPerCategory.values()) {
      session.steps.push(...steps.slice(-100));
    }

    await this.saveSessionToDisk(session);
    this.logger.info(`Pruned old steps in session: ${sessionId}`);
  }
}
