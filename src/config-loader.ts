/**
 * Configuration Loader
 * Loads configuration from multiple sources with priority order:
 * 1. .pica-local.json (local development)
 * 2. Environment variables
 * 3. pi.config.json (project defaults)
 */

import * as fs from 'fs-extra';
import * as path from 'path';

export interface LocalConfig {
  version?: string;
  projectPath?: string;
  openrouterApiKey?: string;
  settings?: Record<string, any>;
  customization?: Record<string, any>;
}

export interface PiConfig {
  version: string;
  piPath: string;
  apiKey: string;
  providers: {
    primary: string;
    openrouter: {
      baseUrl: string;
      models: {
        orchestrator: string;
        analysis: string;
        generation: string;
        validation: string;
      };
      rateLimit: number;
    };
  };
  memory: Record<string, any>;
  logging: Record<string, any>;
  dashboard: Record<string, any>;
}

export class ConfigLoader {
  private static readonly LOCAL_CONFIG_FILE = '.pica-local.json';
  private static readonly PROJECT_CONFIG_FILE = 'pi.config.json';

  /**
   * Load configuration with priority order
   */
  static loadConfig(projectPath: string, piPath: string): PiConfig {
    const configDir = path.join(projectPath, piPath, 'config');

    // Load base project config
    const projectConfig = this.loadProjectConfig(configDir);

    // Load local config if it exists
    const localConfig = this.loadLocalConfig(projectPath);

    // Merge configurations
    return this.mergeConfigs(projectConfig, localConfig);
  }

  /**
   * Load project configuration from pi.config.json
   */
  private static loadProjectConfig(configDir: string): PiConfig {
    const configPath = path.join(configDir, this.PROJECT_CONFIG_FILE);

    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    return fs.readJsonSync(configPath) as PiConfig;
  }

  /**
   * Load local configuration from .pica-local.json
   */
  private static loadLocalConfig(projectPath: string): LocalConfig | null {
    const localConfigPath = path.join(projectPath, this.LOCAL_CONFIG_FILE);

    if (!fs.existsSync(localConfigPath)) {
      return null;
    }

    try {
      return fs.readJsonSync(localConfigPath) as LocalConfig;
    } catch (error) {
      console.warn(`Warning: Could not parse ${this.LOCAL_CONFIG_FILE}:`, error);
      return null;
    }
  }

  /**
   * Merge configurations with priority order
   */
  private static mergeConfigs(projectConfig: PiConfig, localConfig: LocalConfig | null): PiConfig {
    const merged = { ...projectConfig };

    // Apply local config overrides
    if (localConfig) {
      // Use API key from local config if available
      if (localConfig.openrouterApiKey) {
        merged.apiKey = localConfig.openrouterApiKey;
      }

      // Merge settings if provided
      if (localConfig.settings) {
        merged.logging = { ...merged.logging, ...localConfig.settings };
      }

      // Merge customization if provided
      if (localConfig.customization) {
        // Can be used for custom agents/skills in the future
      }
    }

    // Apply environment variable if set (highest priority)
    const envApiKey = process.env.OPENROUTER_API_KEY;
    if (envApiKey) {
      merged.apiKey = envApiKey;
    }

    // Validate API key is present
    if (!merged.apiKey) {
      throw new Error(
        'OpenRouter API key not configured. ' +
        'Please set it in .pica-local.json (openrouterApiKey) ' +
        'or environment variable (OPENROUTER_API_KEY)'
      );
    }

    return merged;
  }

  /**
   * Create .pica-local.json.example template
   */
  static createExampleLocalConfig(projectPath: string): void {
    const examplePath = path.join(projectPath, `${this.LOCAL_CONFIG_FILE}.example`);

    if (fs.existsSync(examplePath)) {
      return; // Already exists
    }

    const exampleConfig: LocalConfig = {
      version: '1.0.0',
      projectPath: '.',
      openrouterApiKey: 'sk-or-v1-your-api-key-here',
      settings: {
        autoRefresh: 2000,
        tokenBudget: 4000,
        cacheDuration: 604800,
        logRetention: 30,
      },
      customization: {
        dashboardPort: null,
        customAgents: [],
        customSkills: [],
      },
    };

    fs.writeJsonSync(examplePath, exampleConfig, { spaces: 2 });
  }
}
