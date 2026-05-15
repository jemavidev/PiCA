/**
 * Approval Manager
 * Manages approval levels and request tracking for agent execution
 * Integrates with HookManager for onApprovalRequired events
 */

import { ApprovalRequest, ApprovalLevel, ApprovalFrameworkConfig, AgentDefinition, AgentContext } from './types';

export class ApprovalManager {
  private config: ApprovalFrameworkConfig;
  private logger: any;
  private approvalRequests: Map<string, ApprovalRequest>;
  private approvalHistory: ApprovalRequest[];
  private maxHistorySize: number;
  private hookManager: any;

  constructor(config: ApprovalFrameworkConfig, logger: any, hookManager?: any) {
    this.config = config;
    this.logger = logger;
    this.approvalRequests = new Map();
    this.approvalHistory = [];
    this.maxHistorySize = 200;
    this.hookManager = hookManager;

    this.logger.info('[ApprovalManager] Initialized with approval framework');
  }

  /**
   * Check if approval is required and return status
   */
  async checkApproval(agent: AgentDefinition, context: AgentContext): Promise<'approved' | 'rejected' | 'pending'> {
    const level = agent.approvalLevel || 0;
    const levelConfig = this.config.levels[level];

    if (!levelConfig) {
      this.logger.warn(`[ApprovalManager] Unknown approval level: ${level}`);
      return 'approved';
    }

    // Level 0 (Auto) - always approve
    if (level === 0) {
      this.logger.debug(`[ApprovalManager] Agent ${agent.id} at Auto level - approved`);
      return 'approved';
    }

    // Level 4 (Blocked) - always reject
    if (level === 4) {
      this.logger.warn(`[ApprovalManager] Agent ${agent.id} is blocked`);
      return 'rejected';
    }

    // Levels 1-3 require manual approval
    const request = this.createApprovalRequest(agent, context, level);
    this.approvalRequests.set(request.id, request);

    // Emit hook event for approval required
    if (this.hookManager) {
      await this.hookManager.emit('onApprovalRequired', {
        sessionId: context.sessionId,
        timestamp: Date.now(),
        eventData: {
          approvalRequestId: request.id,
          agentId: agent.id,
          level,
          levelName: levelConfig.name,
          proposedAction: request.proposedAction,
        },
      });
    }

    this.logger.debug(
      `[ApprovalManager] Created approval request ${request.id} for agent ${agent.id} (level ${levelConfig.name})`
    );

    return 'pending';
  }

  /**
   * Approve an approval request
   */
  approveRequest(requestId: string): boolean {
    const request = this.approvalRequests.get(requestId);
    if (!request) {
      this.logger.warn(`[ApprovalManager] Approval request not found: ${requestId}`);
      return false;
    }

    request.status = 'approved';
    this.recordApprovalHistory(request);
    this.approvalRequests.delete(requestId);

    this.logger.info(`[ApprovalManager] Approved request ${requestId}`);
    return true;
  }

  /**
   * Reject an approval request
   */
  rejectRequest(requestId: string): boolean {
    const request = this.approvalRequests.get(requestId);
    if (!request) {
      this.logger.warn(`[ApprovalManager] Approval request not found: ${requestId}`);
      return false;
    }

    request.status = 'rejected';
    this.recordApprovalHistory(request);
    this.approvalRequests.delete(requestId);

    this.logger.info(`[ApprovalManager] Rejected request ${requestId}`);
    return true;
  }

  /**
   * Get pending approval requests
   */
  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.approvalRequests.values());
  }

  /**
   * Get specific approval request
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.approvalRequests.get(requestId);
  }

  /**
   * Get approval history
   */
  getApprovalHistory(limit: number = 50): ApprovalRequest[] {
    return this.approvalHistory.slice(-limit);
  }

  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    this.approvalRequests.clear();
    this.logger.debug('[ApprovalManager] Cleared all pending requests');
  }

  /**
   * Get statistics about approvals
   */
  getStats(): {
    pendingRequests: number;
    approvedCount: number;
    rejectedCount: number;
    totalProcessed: number;
  } {
    const approved = this.approvalHistory.filter((r) => r.status === 'approved').length;
    const rejected = this.approvalHistory.filter((r) => r.status === 'rejected').length;

    return {
      pendingRequests: this.approvalRequests.size,
      approvedCount: approved,
      rejectedCount: rejected,
      totalProcessed: approved + rejected,
    };
  }

  /**
   * Create an approval request
   */
  private createApprovalRequest(agent: AgentDefinition, context: AgentContext, level: ApprovalLevel): ApprovalRequest {
    return {
      id: `approval-${agent.id}-${Date.now()}`,
      agentId: agent.id,
      context,
      proposedAction: `Execute agent ${agent.name} for: ${context.userInput.substring(0, 100)}...`,
      level,
      status: 'pending',
    };
  }

  /**
   * Record approval in history
   */
  private recordApprovalHistory(request: ApprovalRequest): void {
    this.approvalHistory.push(request);

    // Keep history size bounded
    if (this.approvalHistory.length > this.maxHistorySize) {
      this.approvalHistory = this.approvalHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get approval level config
   */
  getLevelConfig(level: ApprovalLevel) {
    return this.config.levels[level];
  }

  /**
   * Check if approval is required for level
   */
  isApprovalRequired(level: ApprovalLevel): boolean {
    const levelConfig = this.config.levels[level];
    return levelConfig?.requiresManualApproval || false;
  }

  /**
   * Clear approval history
   */
  clearHistory(): void {
    this.approvalHistory = [];
    this.logger.debug('[ApprovalManager] Approval history cleared');
  }
}
