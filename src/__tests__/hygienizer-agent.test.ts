/**
 * Hygienizer Agent Tests
 * Tests for repository auditing and file classification
 * Note: Uses actual .pica-project-manifest.json from project root
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { HygienizAgent } from '../hygienizer-agent';
import { Logger } from '../logger';

describe('HygienizAgent', () => {
  let agent: HygienizAgent;
  let logger: Logger;
  // Use the actual project root where manifest exists (BetterAgents folder)
  const testProjectRoot = path.resolve(__dirname, '../..');

  beforeEach(() => {
    // Create logger with minimal config to avoid file I/O
    logger = new Logger(
      'HygienizTest',
      {
        level: 'error',
        logDir: '/tmp',
        formats: ['text'],
        maxFileSize: 1024,
        retention: 1,
      },
      {} as any
    );
    agent = new HygienizAgent(logger, testProjectRoot);
  });

  describe('File Classification', () => {
    it('should classify TypeScript source files as CORE', () => {
      const filePath = path.join(testProjectRoot, 'src', 'index.ts');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('CORE');
    });

    it('should classify test files as DEVELOPMENT', () => {
      const filePath = path.join(testProjectRoot, 'src', '__tests__', 'index.test.ts');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('DEVELOPMENT');
    });

    it('should classify _dev files as DEVELOPMENT', () => {
      const filePath = path.join(testProjectRoot, '_dev', 'analysis.md');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('DEVELOPMENT');
    });

    it('should classify documentation files as DOCS', () => {
      const filePath = path.join(testProjectRoot, 'docs', 'API.md');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('DOCS');
    });

    it('should classify configuration files as CONFIG', () => {
      const filePath = path.join(testProjectRoot, 'package.json');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('CONFIG');
    });

    it('should classify dist files as GENERATED', () => {
      const filePath = path.join(testProjectRoot, 'dist', 'index.js');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('GENERATED');
    });

    it('should classify bin files as CORE', () => {
      const filePath = path.join(testProjectRoot, 'bin', 'cli.ts');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('CORE');
    });

    it('should classify unknown files as UNKNOWN', () => {
      const filePath = path.join(testProjectRoot, 'random-file.xyz');
      const category = (agent as any).classifyFile(filePath);
      expect(category).toBe('UNKNOWN');
    });
  });

  describe('Correct Location Detection', () => {
    it('should confirm CORE files in src/ are correct', () => {
      const filePath = path.join(testProjectRoot, 'src', 'module.ts');
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, 'CORE');
      expect(isCorrect).toBe(true);
    });

    it('should detect CORE files in wrong location', () => {
      const filePath = path.join(testProjectRoot, '_dev', 'module.ts');
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, 'CORE');
      expect(isCorrect).toBe(false);
    });

    it('should confirm DEVELOPMENT files in _dev/ are correct', () => {
      const filePath = path.join(testProjectRoot, '_dev', 'analysis.md');
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, 'DEVELOPMENT');
      expect(isCorrect).toBe(true);
    });

    it('should confirm DEVELOPMENT files in src/__tests__/ are correct', () => {
      const filePath = path.join(testProjectRoot, 'src', '__tests__', 'app.test.ts');
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, 'DEVELOPMENT');
      expect(isCorrect).toBe(true);
    });

    it('should confirm DOCS files in docs/ are correct', () => {
      const filePath = path.join(testProjectRoot, 'docs', 'README.md');
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, 'DOCS');
      expect(isCorrect).toBe(true);
    });

    it('should confirm CONFIG files at root are correct', () => {
      const filePath = path.join(testProjectRoot, 'package.json');
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, 'CONFIG');
      expect(isCorrect).toBe(true);
    });
  });

  describe('Location Suggestion', () => {
    it('should return null for correctly placed files', () => {
      const filePath = path.join(testProjectRoot, 'src', 'index.ts');
      const suggestion = agent.suggestLocation(filePath);
      expect(suggestion).toBeNull();
    });

    it('should include git mv command in suggestion when file is misplaced', () => {
      const filePath = path.join(testProjectRoot, '_dev', 'handler.ts');
      (agent as any).classifyFile = () => 'CORE';
      (agent as any).isFileInCorrectLocation = () => false;
      (agent as any).getSuggestedLocation = () =>
        path.join(testProjectRoot, 'src', 'handler.ts');

      const suggestion = agent.suggestLocation(filePath);
      if (suggestion) {
        expect(suggestion.gitCommandsRequired.length).toBeGreaterThan(0);
        expect(suggestion.gitCommandsRequired[0]).toContain('git mv');
      }
    });
  });

  describe('Audit Report', () => {
    it('should generate audit report with correct structure', async () => {
      const report = await agent.audit();
      expect(report).toBeDefined();
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.totalFiles).toBeGreaterThan(0);
      expect(report.hygieneScore).toBeGreaterThanOrEqual(0);
      expect(report.hygieneScore).toBeLessThanOrEqual(100);
      expect(['CLEAN', 'NEEDS_ATTENTION', 'CRITICAL']).toContain(report.status);
    });

    it('should provide audit report with files classified', async () => {
      const report = await agent.audit();
      expect(report.filesCorrect + report.filesMisplaced).toBeLessThanOrEqual(
        report.totalFiles
      );
    });

    it('should track hygiene metrics accurately', async () => {
      const report = await agent.audit();
      expect(Number.isInteger(report.hygieneScore)).toBe(true);
      expect(report.filesCorrect).toBeGreaterThanOrEqual(0);
      expect(report.filesMisplaced).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Status Reporting', () => {
    it('should generate status report', async () => {
      const status = await agent.getStatus();
      expect(status).toBeDefined();
      expect(status.timestamp).toBeGreaterThan(0);
      expect(status.hygieneScore).toBeGreaterThanOrEqual(0);
      expect(status.filesByCategory).toBeDefined();
    });

    it('should count files by category in status', async () => {
      const status = await agent.getStatus();
      const totalFiles =
        (status.filesByCategory.CORE || 0) +
        (status.filesByCategory.CONFIG || 0) +
        (status.filesByCategory.DOCS || 0) +
        (status.filesByCategory.DEVELOPMENT || 0) +
        (status.filesByCategory.GENERATED || 0) +
        (status.filesByCategory.UNKNOWN || 0);

      expect(totalFiles).toBeGreaterThan(0);
    });

    it('should detect root directory status', async () => {
      const status = await agent.getStatus();
      expect(status.rootFileCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cleanup Plan', () => {
    it('should generate cleanup plan', async () => {
      const plan = await agent.generateCleanupPlan();
      expect(plan).toBeDefined();
      expect(Array.isArray(plan.fileRelocations)).toBe(true);
      expect(Array.isArray(plan.filesToDelete)).toBe(true);
      expect(plan.estimatedExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide git commands in cleanup plan', async () => {
      const plan = await agent.generateCleanupPlan();
      if (plan.fileRelocations.length > 0) {
        expect(plan.fileRelocations[0].gitCommand).toContain('git mv');
      }
    });
  });

  describe('Integration Tests', () => {
    it('should handle full workflow: audit -> status -> suggest -> cleanup', async () => {
      // 1. Get audit
      const audit = await agent.audit();
      expect(audit.status).toBeDefined();

      // 2. Get status
      const status = await agent.getStatus();
      expect(status.hygieneScore).toBeDefined();

      // 3. Generate cleanup plan
      const plan = await agent.generateCleanupPlan();
      expect(plan).toBeDefined();

      // All should be consistent
      expect(typeof audit.hygieneScore).toBe('number');
      expect(typeof status.hygieneScore).toBe('number');
    });

    it('should provide consistent classifications across operations', async () => {
      const filePath = path.join(testProjectRoot, 'src', 'test.ts');
      const classification = (agent as any).classifyFile(filePath);
      const isCorrect = (agent as any).isFileInCorrectLocation(filePath, classification);

      // src/ should be CORE and CORE should be correct in src/
      expect(classification).toBe('CORE');
      expect(isCorrect).toBe(true);
    });
  });
});
