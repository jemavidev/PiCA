/**
 * Repository Hygienizer Agent
 * Maintains repository cleanliness and prevents directory saturation
 * by analyzing file locations against .pica-project-manifest.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export interface ProjectManifest {
  project: {
    name: string;
    version: string;
    type: string;
    publish_target: string;
    main_entry: string;
    types_entry: string;
  };
  inventory: {
    CORE: { locations: string[]; key_files: string[] };
    CONFIG: { locations: string[] };
    DOCS: { locations: string[] };
    DEVELOPMENT: { locations: string[] };
    GENERATED: { locations: string[] };
  };
  import_rules: Record<string, any>;
  file_creation_protocol: Record<string, any>;
  saturation_prevention: Record<string, any>;
}

export type FileCategory = 'CORE' | 'CONFIG' | 'DOCS' | 'DEVELOPMENT' | 'GENERATED' | 'UNKNOWN';

export interface FileClassification {
  filePath: string;
  category: FileCategory;
  currentLocation: string;
  suggestedLocation?: string;
  isCorrect: boolean;
  issues: string[];
}

export interface AuditReport {
  timestamp: number;
  totalFiles: number;
  filesCorrect: number;
  filesMisplaced: number;
  filesWithImportViolations: number;
  orphanedFiles: number;
  hygieneScore: number;
  status: 'CLEAN' | 'NEEDS_ATTENTION' | 'CRITICAL';
  classifications: FileClassification[];
  recommendations: string[];
}

export interface StatusReport {
  timestamp: number;
  filesByCategory: Record<FileCategory, number>;
  rootFileCount: number;
  redFlags: string[];
  lastAudit?: number;
  hygieneScore: number;
}

export interface CleanupPlan {
  fileRelocations: Array<{
    sourcePath: string;
    destPath: string;
    gitCommand: string;
    importChangesNeeded: boolean;
  }>;
  filesToDelete: string[];
  manifestUpdates: string[];
  warningsAndIssues: string[];
  estimatedExecutionTime: number;
}

export interface LocationSuggestion {
  filePath: string;
  currentLocation: string;
  suggestedLocation: string;
  reason: string;
  category: FileCategory;
  importChangesNeeded: string[];
  gitCommandsRequired: string[];
}

export class HygienizAgent {
  private logger: Logger;
  private manifestPath: string;
  private projectRoot: string;
  private manifest?: ProjectManifest;

  constructor(logger: Logger, projectRoot: string) {
    this.logger = logger;
    this.projectRoot = projectRoot;
    this.manifestPath = path.join(projectRoot, '.pica-project-manifest.json');
  }

  /**
   * Load and validate the project manifest
   */
  private loadManifest(): ProjectManifest {
    if (this.manifest) return this.manifest;

    try {
      const content = fs.readFileSync(this.manifestPath, 'utf-8');
      this.manifest = JSON.parse(content) as ProjectManifest;
      this.logger.info('Project manifest loaded successfully');
      return this.manifest;
    } catch (error) {
      this.logger.error(`Failed to load manifest: ${error}`);
      throw new Error('Cannot load .pica-project-manifest.json');
    }
  }

  /**
   * Classify a file based on its content and location
   */
  private classifyFile(filePath: string): FileCategory {
    const manifest = this.loadManifest();
    const relativePath = path.relative(this.projectRoot, filePath);

    // Check if it matches any DEVELOPMENT patterns
    if (
      relativePath.startsWith('_dev/') ||
      relativePath.startsWith('src/__tests__/') ||
      relativePath.startsWith('scripts/') ||
      relativePath.endsWith('.test.ts') ||
      relativePath.endsWith('.test.js')
    ) {
      return 'DEVELOPMENT';
    }

    // Check if it matches CORE patterns
    if (
      relativePath.startsWith('src/') &&
      !relativePath.startsWith('src/__tests__/') &&
      !relativePath.endsWith('.test.ts') &&
      !relativePath.endsWith('.test.js')
    ) {
      return 'CORE';
    }

    if (relativePath.startsWith('bin/') || relativePath.startsWith('template/')) {
      return 'CORE';
    }

    // Check if it matches DOCS patterns
    if (relativePath.startsWith('docs/') || relativePath === 'README.md') {
      return 'DOCS';
    }

    // Check if it matches CONFIG patterns
    if (
      relativePath === 'package.json' ||
      relativePath === 'tsconfig.json' ||
      relativePath === '.gitignore' ||
      relativePath === 'LICENSE'
    ) {
      return 'CONFIG';
    }

    // Check if it matches GENERATED patterns
    if (
      relativePath.startsWith('dist/') ||
      relativePath.startsWith('node_modules/') ||
      relativePath.startsWith('logs/') ||
      relativePath.endsWith('.log') ||
      relativePath.startsWith('.pica/')
    ) {
      return 'GENERATED';
    }

    return 'UNKNOWN';
  }

  /**
   * Get the correct location for a file based on its category
   */
  private getSuggestedLocation(filePath: string, category: FileCategory): string | undefined {
    const manifest = this.loadManifest();
    const filename = path.basename(filePath);

    const inventoryKey = category as keyof typeof manifest.inventory;
    const locations = manifest.inventory[inventoryKey]?.locations || [];

    // For DEVELOPMENT files
    if (category === 'DEVELOPMENT') {
      if (filename.endsWith('.test.ts') || filename.endsWith('.test.js')) {
        return path.join(this.projectRoot, 'src/__tests__', filename);
      }
      return path.join(this.projectRoot, '_dev', filename);
    }

    // For CORE files
    if (category === 'CORE') {
      if (filename.startsWith('index.') || !filename.includes('.')) {
        return path.join(this.projectRoot, 'src', filename);
      }
      return path.join(this.projectRoot, 'src', filename);
    }

    // For DOCS files
    if (category === 'DOCS') {
      return path.join(this.projectRoot, 'docs', filename);
    }

    return undefined;
  }

  /**
   * Perform a full repository audit
   */
  async audit(): Promise<AuditReport> {
    this.logger.info('Starting repository audit...');

    const manifest = this.loadManifest();
    const allFiles = this.getAllFiles(this.projectRoot);
    const classifications: FileClassification[] = [];

    let filesCorrect = 0;
    let filesMisplaced = 0;
    let filesWithImportViolations = 0;
    let orphanedFiles = 0;
    const recommendations: string[] = [];

    for (const file of allFiles) {
      const category = this.classifyFile(file);
      const relativePath = path.relative(this.projectRoot, file);
      const isCorrect = this.isFileInCorrectLocation(file, category);
      const suggestedLocation = !isCorrect ? this.getSuggestedLocation(file, category) : undefined;

      const issues: string[] = [];

      if (!isCorrect) {
        filesMisplaced++;
        issues.push(`File is in wrong location. Should be in: ${suggestedLocation}`);
      } else {
        filesCorrect++;
      }

      if (category === 'UNKNOWN') {
        orphanedFiles++;
        issues.push('File category cannot be determined');
      }

      // Check for import violations (simplified)
      if (category === 'CORE') {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes("from '_dev") || content.includes("from '_dev/")) {
          filesWithImportViolations++;
          issues.push('CORE file imports from DEVELOPMENT (violation)');
        }
      }

      classifications.push({
        filePath: relativePath,
        category,
        currentLocation: relativePath,
        suggestedLocation,
        isCorrect,
        issues,
      });

      if (issues.length > 0 && !isCorrect) {
        recommendations.push(`Review and relocate ${relativePath} to correct location`);
      }
    }

    const hygieneScore = Math.max(
      0,
      100 -
        filesMisplaced * 10 -
        filesWithImportViolations * 20 -
        orphanedFiles * 15
    );

    const status: 'CLEAN' | 'NEEDS_ATTENTION' | 'CRITICAL' =
      hygieneScore >= 90 ? 'CLEAN' : hygieneScore >= 70 ? 'NEEDS_ATTENTION' : 'CRITICAL';

    const report: AuditReport = {
      timestamp: Date.now(),
      totalFiles: allFiles.length,
      filesCorrect,
      filesMisplaced,
      filesWithImportViolations,
      orphanedFiles,
      hygieneScore: Math.round(hygieneScore),
      status,
      classifications: classifications.filter((c) => !c.isCorrect || c.issues.length > 0),
      recommendations,
    };

    this.logger.info(`Audit complete. Hygiene score: ${report.hygieneScore}`);
    return report;
  }

  /**
   * Get current repository status
   */
  async getStatus(): Promise<StatusReport> {
    const allFiles = this.getAllFiles(this.projectRoot);
    const filesByCategory: Record<FileCategory, number> = {
      CORE: 0,
      CONFIG: 0,
      DOCS: 0,
      DEVELOPMENT: 0,
      GENERATED: 0,
      UNKNOWN: 0,
    };

    const redFlags: string[] = [];
    let rootFileCount = 0;

    for (const file of allFiles) {
      const relativePath = path.relative(this.projectRoot, file);
      const category = this.classifyFile(file);
      filesByCategory[category]++;

      // Count root files
      if (!relativePath.includes(path.sep)) {
        rootFileCount++;
      }
    }

    // Check for red flags
    if (rootFileCount > 15) {
      redFlags.push(`Root directory has ${rootFileCount} files (ideal max: 15)`);
    }

    if (filesByCategory.UNKNOWN > 0) {
      redFlags.push(`${filesByCategory.UNKNOWN} files with unclear purpose detected`);
    }

    const audit = await this.audit();
    const hygieneScore = audit.hygieneScore;

    return {
      timestamp: Date.now(),
      filesByCategory,
      rootFileCount,
      redFlags,
      lastAudit: audit.timestamp,
      hygieneScore,
    };
  }

  /**
   * Suggest location for a specific file
   */
  suggestLocation(filePath: string): LocationSuggestion | null {
    const category = this.classifyFile(filePath);
    const isCorrect = this.isFileInCorrectLocation(filePath, category);

    if (isCorrect) {
      return null; // File is already in correct location
    }

    const suggestedLocation = this.getSuggestedLocation(filePath, category);
    const relativePath = path.relative(this.projectRoot, filePath);

    if (!suggestedLocation) {
      return null;
    }

    const relativeTarget = path.relative(this.projectRoot, suggestedLocation);
    const gitCommand = `git mv ${relativePath} ${relativeTarget}`;

    return {
      filePath: relativePath,
      currentLocation: relativePath,
      suggestedLocation: relativeTarget,
      reason: `This is a ${category} file and should be located in appropriate directory`,
      category,
      importChangesNeeded: [],
      gitCommandsRequired: [gitCommand],
    };
  }

  /**
   * Generate a cleanup plan
   */
  async generateCleanupPlan(): Promise<CleanupPlan> {
    const audit = await this.audit();
    const fileRelocations = [];
    const manifestUpdates = [];
    const warningsAndIssues = [];

    for (const classification of audit.classifications) {
      if (!classification.isCorrect && classification.suggestedLocation) {
        const fullPath = path.join(this.projectRoot, classification.filePath);
        const gitCommand = `git mv ${classification.filePath} ${path.relative(
          this.projectRoot,
          classification.suggestedLocation
        )}`;

        fileRelocations.push({
          sourcePath: classification.filePath,
          destPath: path.relative(this.projectRoot, classification.suggestedLocation),
          gitCommand,
          importChangesNeeded: false,
        });

        manifestUpdates.push(`Update inventory.${classification.category}.locations`);
      }

      warningsAndIssues.push(...classification.issues);
    }

    return {
      fileRelocations,
      filesToDelete: [],
      manifestUpdates,
      warningsAndIssues,
      estimatedExecutionTime: fileRelocations.length * 1000, // 1 sec per file
    };
  }

  /**
   * Check if a file is in the correct location for its category
   */
  private isFileInCorrectLocation(filePath: string, category: FileCategory): boolean {
    const relativePath = path.relative(this.projectRoot, filePath);

    switch (category) {
      case 'CORE':
        return (
          relativePath.startsWith('src/') ||
          relativePath.startsWith('bin/') ||
          relativePath.startsWith('template/')
        );
      case 'CONFIG':
        return [
          'package.json',
          'tsconfig.json',
          '.gitignore',
          'LICENSE',
        ].includes(relativePath);
      case 'DOCS':
        return relativePath.startsWith('docs/') || relativePath === 'README.md';
      case 'DEVELOPMENT':
        return (
          relativePath.startsWith('_dev/') ||
          relativePath.startsWith('src/__tests__/') ||
          relativePath.startsWith('scripts/')
        );
      case 'GENERATED':
        return (
          relativePath.startsWith('dist/') ||
          relativePath.startsWith('node_modules/') ||
          relativePath.startsWith('logs/') ||
          relativePath.startsWith('.pica/')
        );
      default:
        return false;
    }
  }

  /**
   * Get all files in the project recursively
   */
  private getAllFiles(
    dir: string,
    fileList: string[] = [],
    ignorePatterns: RegExp[] = [
      /node_modules/,
      /dist/,
      /\.pica/,
      /logs/,
      /\.git/,
    ]
  ): string[] {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const relativePath = path.relative(this.projectRoot, filePath);

        // Skip ignored patterns
        if (ignorePatterns.some((pattern) => pattern.test(relativePath))) {
          continue;
        }

        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
          this.getAllFiles(filePath, fileList, ignorePatterns);
        } else {
          fileList.push(filePath);
        }
      }
    } catch (error) {
      this.logger.error(`Error reading directory ${dir}: ${error}`);
    }

    return fileList;
  }
}
