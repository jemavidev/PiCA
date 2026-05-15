/**
 * Session Manager
 * Manages session lifecycle, metadata tracking, and state persistence
 */

import {
  SessionMetadata,
  SessionState,
  AgentMetrics,
  SessionFile,
} from './types';

export interface SessionManagerConfig {
  sessionDir: string;
  autoSaveInterval: number; // milliseconds
}

export class SessionManager {
  private config: SessionManagerConfig;
  private logger: any;
  private fileIO: any;
  private memoryManager: any;
  private activeSessions: Map<string, SessionMetadata>;
  private autoSaveTimer: Map<string, NodeJS.Timeout>;

  constructor(config: SessionManagerConfig, dependencies: any) {
    this.config = config;
    this.logger = dependencies.logger;
    this.fileIO = dependencies.fileIO;
    this.memoryManager = dependencies.memoryManager;
    this.activeSessions = new Map();
    this.autoSaveTimer = new Map();

    this.logger.info('SessionManager initialized');
  }

  /**
   * Create a new session
   */
  async createSession(projectPath: string, metadata?: Partial<SessionMetadata>): Promise<string> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const sessionMetadata: SessionMetadata = {
      id: sessionId,
      projectPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1.0.0',
      state: 'active',
      totalTokens: 0,
      totalCost: 0,
      agentMetrics: {
        critic: this.createEmptyMetrics(),
        architect: this.createEmptyMetrics(),
        coder: this.createEmptyMetrics(),
        tester: this.createEmptyMetrics(),
      },
      ...metadata,
    };

    this.activeSessions.set(sessionId, sessionMetadata);

    // Load or create memory session
    await this.memoryManager.loadOrCreateSession(sessionId, projectPath);

    // Start auto-save
    this.startAutoSave(sessionId);

    // Save to disk
    await this.saveSessionMetadata(sessionMetadata);

    this.logger.info(`Created session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Load an existing session
   */
  async loadSession(sessionId: string): Promise<SessionMetadata | null> {
    // Check memory first
    if (this.activeSessions.has(sessionId)) {
      return this.activeSessions.get(sessionId)!;
    }

    // Load from disk
    try {
      const metadata = await this.fileIO.readJSON(`memory/session/${sessionId}.meta.json`);
      if (metadata) {
        this.activeSessions.set(sessionId, metadata);
        this.startAutoSave(sessionId);
        this.logger.debug(`Loaded session from disk: ${sessionId}`);
        return metadata;
      }
    } catch (error) {
      this.logger.debug(`Failed to load session: ${sessionId}`);
    }

    return null;
  }

  /**
   * Get current session metadata
   */
  getSession(sessionId: string): SessionMetadata | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Update session metadata
   */
  async updateSession(sessionId: string, updates: Partial<SessionMetadata>): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    Object.assign(session, updates);
    session.updatedAt = Date.now();

    await this.saveSessionMetadata(session);
  }

  /**
   * Record agent execution metrics
   */
  async recordAgentExecution(
    sessionId: string,
    agentId: string,
    latency: number,
    tokensUsed: number,
    costUsd: number,
    success: boolean
  ): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Map agent ID to role for metrics
    const agentRole = this.extractAgentRole(agentId);
    const metrics = session.agentMetrics[agentRole] || this.createEmptyMetrics();

    metrics.executions++;
    metrics.averageLatency = (metrics.averageLatency * (metrics.executions - 1) + latency) / metrics.executions;
    metrics.averageTokens = (metrics.averageTokens * (metrics.executions - 1) + tokensUsed) / metrics.executions;
    metrics.totalCost += costUsd;
    metrics.lastExecution = Date.now();

    if (!success) {
      metrics.errorCount++;
    }

    session.agentMetrics[agentRole] = metrics;
    session.totalTokens += tokensUsed;
    session.totalCost += costUsd;
    session.updatedAt = Date.now();

    await this.saveSessionMetadata(session);
  }

  /**
   * Pause a session
   */
  async pauseSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = 'paused';
    session.updatedAt = Date.now();

    await this.saveSessionMetadata(session);
    this.logger.info(`Paused session: ${sessionId}`);
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = 'active';
    session.updatedAt = Date.now();

    await this.saveSessionMetadata(session);
    this.startAutoSave(sessionId);
    this.logger.info(`Resumed session: ${sessionId}`);
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = 'completed';
    session.updatedAt = Date.now();

    await this.saveSessionMetadata(session);
    this.stopAutoSave(sessionId);
    this.logger.info(`Completed session: ${sessionId}`);
  }

  /**
   * Mark session as errored
   */
  async errorSession(sessionId: string, error: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.state = 'error';
    session.updatedAt = Date.now();

    await this.saveSessionMetadata(session);
    this.stopAutoSave(sessionId);
    this.logger.error(`Session error: ${sessionId} - ${error}`);
  }

  /**
   * List all active sessions
   */
  listActiveSessions(): SessionMetadata[] {
    return Array.from(this.activeSessions.values()).filter(
      (s) => s.state === 'active' || s.state === 'paused'
    );
  }

  /**
   * List all sessions (including completed)
   */
  async listAllSessions(): Promise<SessionMetadata[]> {
    const inMemory = Array.from(this.activeSessions.values());
    try {
      const files = await this.fileIO.listDir('memory/session');
      const diskSessions = await Promise.all(
        files
          .filter((f: string) => f.endsWith('.meta.json') && !this.activeSessions.has(f.replace('.meta.json', '')))
          .map(async (f: string) => {
            try {
              return await this.fileIO.readJSON(`memory/session/${f}`) as SessionMetadata;
            } catch {
              return null;
            }
          })
      );
      return [...inMemory, ...diskSessions.filter((s): s is SessionMetadata => s !== null)];
    } catch {
      return inMemory;
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    agentStats: Record<string, AgentMetrics>;
    totalTokens: number;
    totalCost: number;
    duration: number;
  } | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      agentStats: session.agentMetrics,
      totalTokens: session.totalTokens,
      totalCost: session.totalCost,
      duration: Date.now() - session.createdAt,
    };
  }

  /**
   * Export session for sharing/debugging
   */
  async exportSession(sessionId: string): Promise<SessionFile | null> {
    const metadata = this.activeSessions.get(sessionId);
    if (!metadata) {
      return null;
    }

    const memory = await this.memoryManager.loadOrCreateSession(sessionId, metadata.projectPath);

    return {
      metadata,
      memory,
    };
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    this.stopAutoSave(sessionId);
    this.activeSessions.delete(sessionId);

    try {
      await this.fileIO.delete(`memory/session/${sessionId}.meta.json`);
      this.logger.info(`Deleted session: ${sessionId}`);
    } catch (error) {
      this.logger.warn(`Failed to delete session files: ${sessionId}`);
    }
  }

  /**
   * Clean up stale sessions
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const maxInactivity = 7 * 24 * 60 * 60 * 1000; // 7 days

    const sessionsToDelete = [];

    for (const [sessionId, session] of this.activeSessions) {
      if (now - session.updatedAt > maxInactivity && session.state !== 'active') {
        sessionsToDelete.push(sessionId);
      }
    }

    for (const sessionId of sessionsToDelete) {
      await this.deleteSession(sessionId);
    }

    this.logger.info(`Cleaned up ${sessionsToDelete.length} stale sessions`);
  }

  /**
   * Shutdown all sessions gracefully
   */
  async shutdown(): Promise<void> {
    for (const sessionId of this.activeSessions.keys()) {
      this.stopAutoSave(sessionId);
    }
    this.logger.info('SessionManager shutdown complete');
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private startAutoSave(sessionId: string): void {
    if (this.autoSaveTimer.has(sessionId)) {
      return; // Already running
    }

    const timer = setInterval(async () => {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        await this.saveSessionMetadata(session);
      }
    }, this.config.autoSaveInterval);

    this.autoSaveTimer.set(sessionId, timer);
  }

  private stopAutoSave(sessionId: string): void {
    const timer = this.autoSaveTimer.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoSaveTimer.delete(sessionId);
    }
  }

  private async saveSessionMetadata(session: SessionMetadata): Promise<void> {
    try {
      await this.fileIO.writeJSON(`memory/session/${session.id}.meta.json`, session);
    } catch (error) {
      this.logger.error(`Failed to save session metadata: ${error}`);
    }
  }

  private createEmptyMetrics(): AgentMetrics {
    return {
      executions: 0,
      averageLatency: 0,
      averageTokens: 0,
      totalCost: 0,
      lastExecution: 0,
      errorCount: 0,
    };
  }

  private extractAgentRole(agentId: string): string {
    // Handle agent IDs like "agent-critic", "agent-architect", etc.
    const match = agentId.match(/(critic|architect|coder|tester)/);
    return match ? match[1] : 'critic';
  }
}
