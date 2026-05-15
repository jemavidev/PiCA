/**
 * Logger
 * Structured logging with JSONL output for dashboard consumption
 */

import { LogLevel, LogEntry, MetricsEntry, LoggerConfig } from './types';

export class Logger {
  private config: LoggerConfig;
  private fileIO: any;
  private levels: Record<LogLevel, number>;
  private componentName: string;

  constructor(componentName: string, config: LoggerConfig, fileIO: any) {
    this.componentName = componentName;
    this.config = config;
    this.fileIO = fileIO;
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    this.ensureLogDirectories();
  }

  /**
   * Log at debug level
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata);
  }

  /**
   * Log at info level
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata);
  }

  /**
   * Log at warn level
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata);
  }

  /**
   * Log at error level
   */
  error(message: string, metadata?: Record<string, any>): void {
    this.log('error', message, metadata);
  }

  /**
   * Log metrics entry (used by orchestrator after execution)
   */
  async logMetrics(metrics: MetricsEntry): Promise<void> {
    if (!this.config.formats.includes('jsonl')) {
      return;
    }

    const line = JSON.stringify({
      type: 'metrics',
      timestamp: metrics.timestamp,
      sessionId: metrics.sessionId,
      agentId: metrics.agentId,
      latency: metrics.latency,
      tokensUsed: metrics.tokensUsed,
      costUsd: metrics.costUsd,
      cacheHit: metrics.cacheHit,
    });

    await this.appendToFile('metrics.jsonl', line);
  }

  /**
   * Log a pattern detection (for alerts)
   */
  async logPattern(pattern: {
    type: string;
    severity: string;
    message: string;
    affectedAgents?: string[];
  }): Promise<void> {
    if (!this.config.formats.includes('jsonl')) {
      return;
    }

    const line = JSON.stringify({
      type: 'pattern',
      timestamp: Date.now(),
      patternType: pattern.type,
      severity: pattern.severity,
      message: pattern.message,
      affectedAgents: pattern.affectedAgents,
    });

    await this.appendToFile('patterns.jsonl', line);
  }

  /**
   * Log an event (for timeline visualization)
   */
  async logEvent(event: {
    agentId: string;
    eventName: string;
    duration: number;
    status: 'success' | 'error';
  }): Promise<void> {
    if (!this.config.formats.includes('jsonl')) {
      return;
    }

    const line = JSON.stringify({
      type: 'event',
      timestamp: Date.now(),
      agentId: event.agentId,
      event: event.eventName,
      duration: event.duration,
      status: event.status,
    });

    await this.appendToFile('events.jsonl', line);
  }

  /**
   * Get recent logs from a file
   */
  async getRecentLogs(filename: string, limit: number = 100): Promise<any[]> {
    try {
      const content = await this.fileIO.read(`${this.config.logDir}/${filename}`);
      const lines = content.trim().split('\n').filter((line: string) => line.trim());
      return lines.slice(-limit).map((line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter((entry: any) => entry !== null);
    } catch {
      return [];
    }
  }

  /**
   * Aggregate metrics over time period
   */
  async getMetricsForPeriod(
    startTime: number,
    endTime: number
  ): Promise<MetricsEntry[]> {
    const logs = await this.getRecentLogs('metrics.jsonl', 1000);
    return logs.filter(
      (log) => log.type === 'metrics' && log.timestamp >= startTime && log.timestamp <= endTime
    );
  }

  /**
   * Clear old logs based on retention policy
   */
  async pruneOldLogs(): Promise<void> {
    if (!this.config.retention) {
      return;
    }

    const maxAge = this.config.retention * 24 * 60 * 60 * 1000; // days to ms
    const now = Date.now();

    for (const format of this.config.formats) {
      if (format !== 'jsonl') continue;

      for (const filename of ['trace.jsonl', 'metrics.jsonl', 'patterns.jsonl', 'events.jsonl']) {
        try {
          const logs = await this.getRecentLogs(filename, 10000);
          const filtered = logs.filter((log: any) => now - log.timestamp < maxAge);

          if (filtered.length < logs.length) {
            // Rewrite file with filtered logs
            await this.fileIO.write(
              `${this.config.logDir}/${filename}`,
              filtered.map((log: any) => JSON.stringify(log)).join('\n')
            );
          }
        } catch (error) {
          this.warn(`Failed to prune logs in ${filename}`, { error: String(error) });
        }
      }
    }
  }

  /**
   * Export logs for debugging
   */
  async exportLogs(format: 'json' | 'csv' = 'json'): Promise<string> {
    const metrics = await this.getRecentLogs('metrics.jsonl', 10000);
    const events = await this.getRecentLogs('events.jsonl', 10000);
    const patterns = await this.getRecentLogs('patterns.jsonl', 10000);

    if (format === 'json') {
      return JSON.stringify(
        {
          exportedAt: Date.now(),
          metrics,
          events,
          patterns,
        },
        null,
        2
      );
    }

    // CSV format
    const csv = [
      'timestamp,type,agentId,metric,value',
      ...metrics.map((m: any) => `${m.timestamp},metrics,${m.agentId},tokens,${m.tokensUsed}`),
      ...metrics.map((m: any) => `${m.timestamp},metrics,${m.agentId},cost,${m.costUsd}`),
      ...events.map((e: any) => `${e.timestamp},event,${e.agentId},${e.event},${e.duration}`),
    ].join('\n');

    return csv;
  }

  /**
   * Get log statistics
   */
  async getStats(): Promise<{
    totalLogs: number;
    totalMetrics: number;
    totalEvents: number;
    totalPatterns: number;
    logFileSize: number;
  }> {
    const metrics = await this.getRecentLogs('metrics.jsonl', 100000);
    const events = await this.getRecentLogs('events.jsonl', 100000);
    const patterns = await this.getRecentLogs('patterns.jsonl', 100000);

    return {
      totalLogs: metrics.length + events.length + patterns.length,
      totalMetrics: metrics.length,
      totalEvents: events.length,
      totalPatterns: patterns.length,
      logFileSize: JSON.stringify([...metrics, ...events, ...patterns]).length,
    };
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  private log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    // Check log level
    if (this.levels[level] < this.levels[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      component: this.componentName,
      message,
      metadata,
    };

    // Console output
    this.printToConsole(entry);

    // File output
    this.writeToFile(entry);
  }

  private printToConsole(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString();
    const prefix = `[${timestamp}] [${entry.component}] [${entry.level.toUpperCase()}]`;

    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m', // green
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
    };
    const reset = '\x1b[0m';

    const coloredPrefix = colors[entry.level] + prefix + reset;
    console.log(`${coloredPrefix} ${entry.message}`, entry.metadata || '');
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    for (const format of this.config.formats) {
      if (format === 'jsonl') {
        await this.appendToFile('trace.jsonl', JSON.stringify(entry));
      } else if (format === 'json') {
        // Could implement JSON array appending if needed
      } else if (format === 'text') {
        const timestamp = new Date(entry.timestamp).toISOString();
        const line = `${timestamp} [${entry.component}] [${entry.level.toUpperCase()}] ${entry.message}`;
        await this.appendToFile('trace.txt', line);
      }
    }
  }

  private async appendToFile(filename: string, line: string): Promise<void> {
    try {
      const path = `${this.config.logDir}/${filename}`;
      const content = await this.fileIO.read(path).catch(() => '');
      const newContent = content ? `${content}\n${line}` : line;
      await this.fileIO.write(path, newContent);
    } catch (error) {
      console.error(`Failed to write log: ${error}`);
    }
  }

  private ensureLogDirectories(): void {
    // This would be called during initialization
    // Assumes fileIO has mkdir capability
  }
}
