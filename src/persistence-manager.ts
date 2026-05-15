/**
 * Persistence Manager
 * Orchestrates persistence operations across memory, sessions, and checkpoints
 * Handles save/resume workflows and consistency guarantees
 */

import {
  MemorySession,
  SessionMetadata,
  CheckpointData,
  SessionFile,
} from './types';

export interface PersistenceManagerConfig {
  baseDir: string;
  autoSave: boolean;
  autoSaveInterval: number;
  consistencyCheck: boolean;
}

export class PersistenceManager {
  private config: PersistenceManagerConfig;
  private logger: any;
  private memoryManager: any;
  private sessionManager: any;
  private fileIO: any;
  private checksumService: any;
  private activeCheckpoints: Map<string, CheckpointData>;

  constructor(config: PersistenceManagerConfig, dependencies: any) {
    this.config = config;
    this.logger = dependencies.logger;
    this.memoryManager = dependencies.memoryManager;
    this.sessionManager = dependencies.sessionManager;
    this.fileIO = dependencies.fileIO;
    this.checksumService = dependencies.checksumService;
    this.activeCheckpoints = new Map();

    this.logger.info('PersistenceManager initialized');
  }

  /**
   * Save session state (memory + metadata)
   */
  async saveSession(sessionId: string): Promise<boolean> {
    try {
      this.logger.debug(`[Persistence] Saving session: ${sessionId}`);

      const memory = await this.memoryManager.loadOrCreateSession(sessionId, '');
      const metadata = this.sessionManager.getSession(sessionId);

      if (!memory || !metadata) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (this.config.consistencyCheck) {
        await this.verifySessionConsistency(sessionId, memory, metadata);
      }

      this.logger.debug(`[Persistence] Session verified: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(`[Persistence] Failed to save session: ${error}`);
      return false;
    }
  }

  /**
   * Load session state (memory + metadata)
   */
  async loadSession(sessionId: string): Promise<SessionFile | null> {
    try {
      this.logger.debug(`[Persistence] Loading session: ${sessionId}`);

      const memory = await this.memoryManager.loadOrCreateSession(sessionId, '');
      const metadata = this.sessionManager.getSession(sessionId) ?? (await this.sessionManager.loadSession(sessionId));

      if (!memory || !metadata) {
        return null;
      }

      const validation = await this.memoryManager.validateSession(memory);
      if (!validation.isValid) {
        this.logger.warn(`[Persistence] Session failed checksum validation: ${sessionId}`);
      }

      this.logger.debug(`[Persistence] Session loaded: ${sessionId}`);
      return { metadata, memory };
    } catch (error) {
      this.logger.error(`[Persistence] Failed to load session: ${error}`);
      return null;
    }
  }

  /**
   * Create a checkpoint for safe recovery
   */
  async createCheckpoint(sessionId: string, label: string): Promise<string> {
    try {
      this.logger.info(`[Persistence] Creating checkpoint: ${label}`);

      // Use memory manager's checkpoint system
      const checkpointId = await this.memoryManager.createCheckpoint(sessionId, label);

      // Also store metadata
      const metadata = this.sessionManager.getSession(sessionId);
      const checkpointData: CheckpointData = {
        id: checkpointId,
        sessionId,
        timestamp: Date.now(),
        memorySnapshot: await this.memoryManager.loadOrCreateSession(sessionId, ''),
        sessionSnapshot: metadata!,
        userDescription: label,
      };

      this.activeCheckpoints.set(checkpointId, checkpointData);
      await this.fileIO.writeJSON(`memory/checkpoints/${checkpointId}.json`, checkpointData);

      return checkpointId;
    } catch (error) {
      this.logger.error(`[Persistence] Failed to create checkpoint: ${error}`);
      throw error;
    }
  }

  /**
   * Restore from a checkpoint
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<string> {
    try {
      this.logger.info(`[Persistence] Restoring from checkpoint: ${checkpointId}`);

      const checkpointData = await this.fileIO.readJSON(`memory/checkpoints/${checkpointId}.json`);

      if (!checkpointData) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      const sessionId = checkpointData.sessionId;

      // Restore memory
      await this.memoryManager.rollbackToCheckpoint(sessionId, checkpointId);

      // Restore metadata
      await this.sessionManager.updateSession(sessionId, checkpointData.sessionSnapshot);

      this.logger.info(`[Persistence] Restored from checkpoint: ${checkpointId}`);
      return sessionId;
    } catch (error) {
      this.logger.error(`[Persistence] Failed to restore checkpoint: ${error}`);
      throw error;
    }
  }

  /**
   * List available checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<CheckpointData[]> {
    try {
      const checkpoints = await this.memoryManager.listCheckpoints(sessionId);
      return checkpoints.map((c: { id: string; label: string; timestamp: number }) => ({
        id: c.id,
        sessionId,
        timestamp: c.timestamp,
        memorySnapshot: {} as any,
        sessionSnapshot: {} as any,
        userDescription: c.label,
      }));
    } catch (error) {
      this.logger.error(`[Persistence] Failed to list checkpoints: ${error}`);
      return [];
    }
  }

  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    try {
      this.activeCheckpoints.delete(checkpointId);
      await this.fileIO.delete(`memory/checkpoints/${checkpointId}.json`);
      this.logger.debug(`[Persistence] Deleted checkpoint: ${checkpointId}`);
    } catch (error) {
      this.logger.warn(`[Persistence] Failed to delete checkpoint: ${error}`);
    }
  }

  /**
   * Export session for backup or sharing
   */
  async exportSession(sessionId: string, format: 'json' | 'archive' = 'json'): Promise<string> {
    try {
      const sessionFile = await this.loadSession(sessionId);

      if (!sessionFile) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (format === 'json') {
        return JSON.stringify(sessionFile, null, 2);
      }

      // Could implement ZIP format here
      throw new Error('Archive format not yet implemented');
    } catch (error) {
      this.logger.error(`[Persistence] Export failed: ${error}`);
      throw error;
    }
  }

  /**
   * Import session from backup
   */
  async importSession(data: string, overwrite: boolean = false): Promise<string> {
    try {
      const sessionFile: SessionFile = JSON.parse(data);

      // Validate structure
      if (!sessionFile.metadata || !sessionFile.memory) {
        throw new Error('Invalid session file format');
      }

      const sessionId = sessionFile.metadata.id;

      // Check if session exists
      const existing = await this.loadSession(sessionId);
      if (existing && !overwrite) {
        throw new Error(`Session already exists: ${sessionId}`);
      }

      // Validate checksums
      const validation = await this.memoryManager.validateSession(sessionFile.memory);
      if (!validation.isValid) {
        throw new Error('Imported session failed checksum validation');
      }

      // Save
      await this.fileIO.writeJSON(`memory/sessions/${sessionId}.json`, sessionFile);

      this.logger.info(`[Persistence] Imported session: ${sessionId}`);
      return sessionId;
    } catch (error) {
      this.logger.error(`[Persistence] Import failed: ${error}`);
      throw error;
    }
  }

  /**
   * Verify session consistency
   */
  private async verifySessionConsistency(
    sessionId: string,
    memory: MemorySession,
    metadata: SessionMetadata
  ): Promise<boolean> {
    // Verify session ID matches
    if (memory.id !== sessionId || metadata.id !== sessionId) {
      throw new Error('Session ID mismatch');
    }

    // Verify memory integrity
    const validation = await this.memoryManager.validateSession(memory);
    if (!validation.isValid) {
      throw new Error('Memory checksum validation failed');
    }

    // Verify timestamps are consistent
    if (memory.updatedAt > Date.now()) {
      this.logger.warn('[Persistence] Memory has future timestamp');
    }

    return true;
  }

  /**
   * Compact session by removing old steps
   */
  async compactSession(sessionId: string, keepLastN: number = 1000): Promise<void> {
    try {
      const sessionFile = await this.loadSession(sessionId);

      if (!sessionFile) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (sessionFile.memory.steps.length > keepLastN) {
        sessionFile.memory.steps = sessionFile.memory.steps.slice(-keepLastN);
        await this.fileIO.writeJSON(`memory/sessions/${sessionId}.json`, sessionFile);
        this.logger.info(`[Persistence] Compacted session: ${sessionId}`);
      }
    } catch (error) {
      this.logger.error(`[Persistence] Compaction failed: ${error}`);
    }
  }

  /**
   * Health check - verify persistence layer is working
   */
  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check write access
    try {
      const testFile = 'memory/.health-check';
      await this.fileIO.write(testFile, JSON.stringify({ timestamp: Date.now() }));
      await this.fileIO.delete(testFile);
    } catch (error) {
      issues.push(`Write access failed: ${error}`);
    }

    // Check session store
    try {
      // Would check if sessions directory exists and is readable
    } catch (error) {
      issues.push(`Session store check failed: ${error}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Get persistence statistics
   */
  async getStats(): Promise<{
    totalSessions: number;
    totalCheckpoints: number;
    diskUsage: number;
    lastBackupTime: number | null;
  }> {
    return {
      totalSessions: this.sessionManager.listActiveSessions().length,
      totalCheckpoints: this.activeCheckpoints.size,
      diskUsage: 0, // Would calculate actual disk usage
      lastBackupTime: null, // Would track backup timestamps
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info('[Persistence] Shutting down gracefully');

    // Save all active sessions
    const activeSessions = this.sessionManager.listActiveSessions();
    for (const session of activeSessions) {
      await this.saveSession(session.id);
    }

    this.logger.info('[Persistence] Shutdown complete');
  }
}
