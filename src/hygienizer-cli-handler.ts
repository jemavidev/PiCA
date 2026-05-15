/**
 * Hygienizer CLI Handler
 * Provides slash command integration for Hygienizer Agent
 * Commands: /repo-audit, /repo-suggest-location, /repo-cleanup, /repo-status
 */

import { HygienizAgent } from './hygienizer-agent';
import { Logger } from './logger';
import {
  HygienizSessionMemory,
  createSessionMemory,
  getSessionMemory,
} from './hygienizer-session-memory';
import { ApprovalManager } from './approval-manager';
import type { AgentContext, ApprovalLevel } from './types';

export interface CLICommand {
  command: string;
  args: string[];
  sessionId: string;
  context: AgentContext;
}

export interface CLIResult {
  success: boolean;
  output: string;
  approvalRequired: boolean;
  approvalLevel?: ApprovalLevel;
  actionItems: Array<{
    type: 'warning' | 'info' | 'suggestion' | 'error';
    message: string;
  }>;
}

export class HygienizCLIHandler {
  private hygienizer: HygienizAgent;
  private logger: Logger;
  private approvalManager: ApprovalManager;
  private sessionMemory: Map<string, HygienizSessionMemory> = new Map();

  constructor(logger: Logger, projectRoot: string, approvalManager: ApprovalManager) {
    this.logger = logger;
    this.hygienizer = new HygienizAgent(logger, projectRoot);
    this.approvalManager = approvalManager;
  }

  /**
   * Parse and execute CLI command
   */
  async handleCommand(cmd: CLICommand): Promise<CLIResult> {
    const sessionMemory = this.getOrCreateSessionMemory(cmd.sessionId);

    try {
      switch (cmd.command) {
        case '/repo-audit':
          return await this.handleAudit(sessionMemory);

        case '/repo-status':
          return await this.handleStatus(sessionMemory);

        case '/repo-suggest-location':
          return await this.handleSuggestLocation(cmd.args[0], sessionMemory);

        case '/repo-cleanup':
          return await this.handleCleanup(sessionMemory);

        default:
          return {
            success: false,
            output: `Unknown command: ${cmd.command}`,
            approvalRequired: false,
            actionItems: [
              {
                type: 'error',
                message: 'Hygienizer command not recognized',
              },
            ],
          };
      }
    } catch (error) {
      this.logger.error(`Hygienizer command error: ${error}`);
      sessionMemory.recordFailure(
        'repository',
        cmd.command,
        error instanceof Error ? error.message : String(error)
      );

      return {
        success: false,
        output: `Error executing command: ${error}`,
        approvalRequired: false,
        actionItems: [
          {
            type: 'error',
            message: String(error),
          },
        ],
      };
    }
  }

  /**
   * /repo-audit - Full repository audit
   */
  private async handleAudit(memory: HygienizSessionMemory): Promise<CLIResult> {
    this.logger.info('Running /repo-audit');

    const report = await this.hygienizer.audit();

    const output = `
# Repository Hygiene Audit Report
**Generated:** ${new Date(report.timestamp).toISOString()}
**Status:** ${report.status}
**Hygiene Score:** ${report.hygieneScore}/100

## Summary
- Total files: ${report.totalFiles}
- Files in correct locations: ${report.filesCorrect} ✅
- Files potentially misplaced: ${report.filesMisplaced} ⚠️
- Files with import violations: ${report.filesWithImportViolations} ❌
- Orphaned files: ${report.orphanedFiles}

## Recommendations
${report.recommendations.map((r) => `- ${r}`).join('\n')}
`;

    const actionItems = [];

    if (report.filesMisplaced > 0) {
      actionItems.push({
        type: 'warning' as const,
        message: `${report.filesMisplaced} files are misplaced. Run /repo-cleanup to see relocation plan.`,
      });
    }

    if (report.filesWithImportViolations > 0) {
      actionItems.push({
        type: 'error' as const,
        message: `${report.filesWithImportViolations} import rule violations detected. Fix before deployment.`,
      });
    }

    if (report.hygieneScore < 70) {
      actionItems.push({
        type: 'error' as const,
        message: 'Repository hygiene score is critically low. Cleanup recommended.',
      });
    }

    memory.recordOperation({
      filePath: 'repository',
      operation: 'analyzed',
      category: 'audit',
      success: true,
      timestamp: Date.now(),
    });

    return {
      success: true,
      output,
      approvalRequired: false,
      actionItems,
    };
  }

  /**
   * /repo-status - Quick status check
   */
  private async handleStatus(memory: HygienizSessionMemory): Promise<CLIResult> {
    this.logger.info('Running /repo-status');

    const status = await this.hygienizer.getStatus();

    const categoryList = Object.entries(status.filesByCategory)
      .map(([cat, count]) => `  - ${cat}: ${count}`)
      .join('\n');

    const output = `
# Repository Status

## File Distribution
${categoryList}

## Root Directory
Files in root: ${status.rootFileCount} (ideal max: 15)

## Hygiene Score
${status.hygieneScore}/100

## Red Flags
${status.redFlags.length > 0 ? status.redFlags.map((f) => `⚠️ ${f}`).join('\n') : 'None detected ✅'}

## Last Audit
${status.lastAudit ? new Date(status.lastAudit).toISOString() : 'Never run'}
`;

    const actionItems = [];

    if (status.redFlags.length > 0) {
      actionItems.push({
        type: 'warning' as const,
        message: `${status.redFlags.length} red flags detected. Run /repo-audit for details.`,
      });
    } else {
      actionItems.push({
        type: 'info' as const,
        message: 'Repository structure looks good ✅',
      });
    }

    return {
      success: true,
      output,
      approvalRequired: false,
      actionItems,
    };
  }

  /**
   * /repo-suggest-location [filepath] - Suggest location for a file
   */
  private async handleSuggestLocation(
    filePath: string,
    memory: HygienizSessionMemory
  ): Promise<CLIResult> {
    if (!filePath) {
      return {
        success: false,
        output: 'Please specify a file path: /repo-suggest-location <filepath>',
        approvalRequired: false,
        actionItems: [
          {
            type: 'error',
            message: 'Missing file path argument',
          },
        ],
      };
    }

    this.logger.info(`Suggesting location for: ${filePath}`);

    const suggestion = this.hygienizer.suggestLocation(filePath);

    if (!suggestion) {
      return {
        success: true,
        output: `✅ File is already in the correct location: ${filePath}`,
        approvalRequired: false,
        actionItems: [
          {
            type: 'info',
            message: 'No relocation needed',
          },
        ],
      };
    }

    memory.trackAuditSuggestion(filePath, suggestion.suggestedLocation);

    const output = `
# Location Suggestion for: ${filePath}

**Current Location:** ${suggestion.currentLocation}
**Suggested Location:** ${suggestion.suggestedLocation}
**Category:** ${suggestion.category}
**Reason:** ${suggestion.reason}

## To Apply This Suggestion

Run this command to relocate the file:
\`\`\`bash
${suggestion.gitCommandsRequired[0]}
\`\`\`

Then update the manifest:
- Add \`${suggestion.suggestedLocation}\` to \`inventory.${suggestion.category}.locations\`
`;

    return {
      success: true,
      output,
      approvalRequired: suggestion.category !== 'UNKNOWN',
      approvalLevel: 1,
      actionItems: [
        {
          type: 'info',
          message: `File should be relocated to ${suggestion.suggestedLocation}`,
        },
      ],
    };
  }

  /**
   * /repo-cleanup - Generate and display cleanup plan
   */
  private async handleCleanup(memory: HygienizSessionMemory): Promise<CLIResult> {
    this.logger.info('Running /repo-cleanup');

    const plan = await this.hygienizer.generateCleanupPlan();

    if (plan.fileRelocations.length === 0) {
      return {
        success: true,
        output: '✅ Repository is clean! No relocations needed.',
        approvalRequired: false,
        actionItems: [
          {
            type: 'info',
            message: 'Repository structure is well organized',
          },
        ],
      };
    }

    memory.recordCleanupPlan(plan.fileRelocations.length);

    const relocations = plan.fileRelocations
      .map(
        (r) => `
- **${r.sourcePath}** → **${r.destPath}**
  \`${r.gitCommand}\`
`
      )
      .join('\n');

    const output = `
# Repository Cleanup Plan

## Summary
- Files to relocate: ${plan.fileRelocations.length}
- Files to delete: ${plan.filesToDelete.length}
- Manifest updates needed: ${plan.manifestUpdates.length}
- Estimated time: ${plan.estimatedExecutionTime / 1000}s

## File Relocations
${relocations}

## Manifest Updates Required
${plan.manifestUpdates.map((u) => `- ${u}`).join('\n')}

## Warnings & Issues
${plan.warningsAndIssues.map((w) => `⚠️ ${w}`).join('\n')}

## To Apply This Cleanup Plan

1. Review the changes above
2. Approve this cleanup plan
3. Execute each git mv command in order
4. Update .pica-project-manifest.json
5. Verify no import breaks: \`npm test\`
6. Commit: \`git commit -m "chore: clean repository structure"\`
`;

    return {
      success: true,
      output,
      approvalRequired: true,
      approvalLevel: 2, // Requires approval for destructive operations
      actionItems: [
        {
          type: 'info',
          message: `${plan.fileRelocations.length} files need relocation`,
        },
        ...plan.warningsAndIssues.map((w) => ({
          type: 'warning' as const,
          message: w,
        })),
      ],
    };
  }

  /**
   * Get or create session memory
   */
  private getOrCreateSessionMemory(sessionId: string): HygienizSessionMemory {
    let memory = this.sessionMemory.get(sessionId);

    if (!memory) {
      memory = createSessionMemory(sessionId);
      this.sessionMemory.set(sessionId, memory);
    }

    return memory;
  }

  /**
   * End session and cleanup
   */
  endSession(sessionId: string, hygieneScore?: number): HygienizSessionMemory | undefined {
    const memory = this.sessionMemory.get(sessionId);

    if (memory) {
      memory.endSession(hygieneScore);
    }

    return memory;
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): string | null {
    const memory = this.sessionMemory.get(sessionId);

    if (!memory) {
      return null;
    }

    const summary = memory.getSummary();
    return `
## Hygienizer Session Summary

- Files created: ${summary.filesCreated}
- Files relocated: ${summary.filesRelocated}
- Suggestions provided: ${summary.suggestionsProvided}
- Issues found: ${summary.issuesFound}
- Total operations: ${summary.operationCount}
`;
  }
}
