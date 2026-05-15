/**
 * Hook Manager
 * Manages event hooks for agent lifecycle and workflow extensibility
 * Allows Meta-Agent and custom extensions to react to PiCA events
 */

import { Hook, HookName, HookContext } from './types';

export type HookHandler = (context: HookContext) => Promise<void>;

export interface HookRegistration {
  name: HookName;
  handler: HookHandler;
  priority: number;
  enabled: boolean;
}

export class HookManager {
  private hooks: Map<HookName, HookRegistration[]>;
  private logger: any;
  private eventHistory: Array<{ name: HookName; timestamp: number; context: HookContext }>;
  private maxHistorySize: number;

  constructor(logger: any) {
    this.logger = logger;
    this.hooks = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 100;

    // Initialize hook collections for all hook names
    const hookNames: HookName[] = [
      'onSessionStart',
      'onSessionEnd',
      'onAgentSelected',
      'onAnalysisComplete',
      'onCodeGenerated',
      'onValidationComplete',
      'onError',
      'onApprovalRequired',
    ];

    for (const name of hookNames) {
      this.hooks.set(name, []);
    }

    this.logger.info('[HookManager] Initialized with 8 hook points');
  }

  /**
   * Register a hook handler
   */
  on(hookName: HookName, handler: HookHandler, priority: number = 0): string {
    if (!this.hooks.has(hookName)) {
      this.logger.warn(`Hook ${hookName} not recognized`);
      return '';
    }

    const registration: HookRegistration = {
      name: hookName,
      handler,
      priority,
      enabled: true,
    };

    const handlers = this.hooks.get(hookName)!;
    handlers.push(registration);

    // Sort by priority (higher priority first)
    handlers.sort((a, b) => b.priority - a.priority);

    this.logger.debug(`[HookManager] Registered handler for ${hookName} (priority: ${priority})`);

    // Return handler ID (index-based for now)
    return `${hookName}-${handlers.length - 1}`;
  }

  /**
   * Unregister a hook handler
   */
  off(hookName: HookName, handlerId: string): boolean {
    if (!this.hooks.has(hookName)) {
      return false;
    }

    const handlers = this.hooks.get(hookName)!;
    const index = parseInt(handlerId.split('-')[1]);

    if (index >= 0 && index < handlers.length) {
      handlers.splice(index, 1);
      this.logger.debug(`[HookManager] Unregistered handler ${handlerId}`);
      return true;
    }

    return false;
  }

  /**
   * Emit a hook event
   * Calls all registered handlers asynchronously
   */
  async emit(hookName: HookName, context: HookContext): Promise<void> {
    if (!this.hooks.has(hookName)) {
      this.logger.warn(`Attempted to emit unknown hook: ${hookName}`);
      return;
    }

    const handlers = this.hooks.get(hookName)!;

    // Add timestamp if not present
    if (!context.timestamp) {
      context.timestamp = Date.now();
    }

    this.logger.debug(`[HookManager] Emitting ${hookName} with ${handlers.length} handlers`);

    // Record in history
    this.recordEvent(hookName, context);

    // Call all handlers in parallel, but don't let errors propagate
    const promises = handlers
      .filter((h) => h.enabled)
      .map((registration) =>
        this.callHandler(hookName, registration, context)
      );

    // Wait for all handlers but continue even if some fail
    await Promise.allSettled(promises);
  }

  /**
   * Emit hook and wait for all handlers (blocking)
   */
  async emitBlocking(hookName: HookName, context: HookContext): Promise<void[]> {
    if (!this.hooks.has(hookName)) {
      throw new Error(`Unknown hook: ${hookName}`);
    }

    const handlers = this.hooks.get(hookName)!;

    if (!context.timestamp) {
      context.timestamp = Date.now();
    }

    this.logger.debug(`[HookManager] Blocking emit ${hookName} with ${handlers.length} handlers`);
    this.recordEvent(hookName, context);

    const promises = handlers
      .filter((h) => h.enabled)
      .map((registration) =>
        this.callHandler(hookName, registration, context)
      );

    return Promise.all(promises.map((p) => p.then(() => undefined)));
  }

  /**
   * Call a single hook handler with error handling
   */
  private async callHandler(hookName: HookName, registration: HookRegistration, context: HookContext): Promise<void> {
    try {
      const startTime = Date.now();
      await registration.handler(context);
      const duration = Date.now() - startTime;

      this.logger.debug(`[HookManager] Handler for ${hookName} completed in ${duration}ms`);
    } catch (error) {
      this.logger.error(`[HookManager] Handler error for ${hookName}:`, error);
      // Don't re-throw, let other handlers continue
    }
  }

  /**
   * Get all handlers for a hook
   */
  getHandlers(hookName: HookName): HookRegistration[] {
    return this.hooks.get(hookName) || [];
  }

  /**
   * List all registered hooks with handler counts
   */
  listHooks(): Record<HookName, number> {
    const result: Record<HookName, number> = {} as any;

    for (const [name, handlers] of this.hooks) {
      result[name] = handlers.length;
    }

    return result;
  }

  /**
   * Enable/disable a handler
   */
  setHandlerEnabled(handlerId: string, enabled: boolean): boolean {
    const [hookName, indexStr] = handlerId.split('-');
    const index = parseInt(indexStr);

    const handlers = this.hooks.get(hookName as HookName);
    if (handlers && index >= 0 && index < handlers.length) {
      handlers[index].enabled = enabled;
      this.logger.debug(`[HookManager] Handler ${handlerId} set to ${enabled ? 'enabled' : 'disabled'}`);
      return true;
    }

    return false;
  }

  /**
   * Get recent event history
   */
  getEventHistory(limit: number = 20): Array<{ name: HookName; timestamp: number }> {
    return this.eventHistory
      .map((e) => ({ name: e.name, timestamp: e.timestamp }))
      .slice(-limit);
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
    this.logger.debug('[HookManager] Event history cleared');
  }

  /**
   * Get handler count for hook
   */
  getHandlerCount(hookName: HookName): number {
    return this.hooks.get(hookName)?.length || 0;
  }

  /**
   * Record event in history
   */
  private recordEvent(hookName: HookName, context: HookContext): void {
    this.eventHistory.push({
      name: hookName,
      timestamp: context.timestamp || Date.now(),
      context,
    });

    // Keep history size bounded
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get statistics about hook usage
   */
  getStats(): {
    totalHooks: number;
    hooksWithHandlers: number;
    totalHandlers: number;
    recentEvents: number;
  } {
    let hooksWithHandlers = 0;
    let totalHandlers = 0;

    for (const handlers of this.hooks.values()) {
      if (handlers.length > 0) {
        hooksWithHandlers++;
        totalHandlers += handlers.length;
      }
    }

    return {
      totalHooks: this.hooks.size,
      hooksWithHandlers,
      totalHandlers,
      recentEvents: this.eventHistory.length,
    };
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    for (const handlers of this.hooks.values()) {
      handlers.length = 0;
    }
    this.eventHistory = [];
    this.logger.info('[HookManager] All hooks and history cleared');
  }
}
