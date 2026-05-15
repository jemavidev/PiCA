/**
 * CLI Manager
 * Handles all command-line interface commands for PiCA
 */

import { initializePiCA } from '../index';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface CLIContext {
  projectPath: string;
  piPath: string;
  apiKey: string;
  verbose?: boolean;
}

export class CLIManager {
  private context: CLIContext;

  constructor(context: CLIContext) {
    this.context = context;
  }

  /**
   * Initialize PiCA in a new project
   */
  async init(): Promise<void> {
    console.log('📦 Initializing PiCA...');

    const piPath = path.join(this.context.projectPath, this.context.piPath);

    // Check if already initialized
    if (await fs.pathExists(piPath)) {
      console.log('⚠️  PiCA already initialized at', piPath);
      return;
    }

    try {
      // Create directory structure
      await fs.ensureDir(path.join(piPath, 'agents'));
      await fs.ensureDir(path.join(piPath, 'skills'));
      await fs.ensureDir(path.join(piPath, 'config'));
      await fs.ensureDir(path.join(piPath, 'logs'));
      await fs.ensureDir(path.join(piPath, 'memory', 'session'));
      await fs.ensureDir(path.join(piPath, 'memory', 'cache'));
      await fs.ensureDir(path.join(piPath, 'memory', 'meta'));
      await fs.ensureDir(path.join(piPath, 'hooks'));

      // Create .gitkeep files
      const gitkeepDirs = [
        path.join(piPath, 'agents'),
        path.join(piPath, 'skills'),
        path.join(piPath, 'logs'),
        path.join(piPath, 'memory', 'session'),
        path.join(piPath, 'memory', 'cache'),
        path.join(piPath, 'memory', 'meta'),
        path.join(piPath, 'hooks'),
      ];

      for (const dir of gitkeepDirs) {
        await fs.writeFile(path.join(dir, '.gitkeep'), '');
      }

      // Create default config files
      await fs.writeJSON(
        path.join(piPath, 'config', 'pi.config.json'),
        {
          version: '1.0.0',
          piPath: this.context.piPath,
          apiKey: '${OPENROUTER_API_KEY}',
          providers: {
            primary: 'openrouter',
            openrouter: {
              baseUrl: 'https://openrouter.ai/api/v1',
              models: {
                orchestrator: 'openrouter/openai/gpt-4-turbo',
                analysis: 'openrouter/deepseek/deepseek-chat',
                generation: 'openrouter/deepseek/deepseek-chat',
                validation: 'openrouter/google/gemini-2.0-flash',
              },
              rateLimit: 100,
            },
          },
          memory: {
            maxSessionSize: '100MB',
            keepVersions: 3,
            compressionEnabled: false,
            checksumAlgorithm: 'sha256',
          },
          logging: {
            level: 'info',
            logDir: `${this.context.piPath}/logs`,
            formats: ['jsonl', 'text'],
          },
          dashboard: {
            enabled: true,
            port: null,
            pollingInterval: 2000,
            maxChartPoints: 100,
          },
        },
        { spaces: 2 }
      );

      // Create local config
      await fs.writeJSON(
        path.join(this.context.projectPath, '.pica-local.json'),
        {
          version: '1.0.0',
          projectPath: this.context.projectPath,
          openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
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
        },
        { spaces: 2 }
      );

      // Update .gitignore
      const gitignorePath = path.join(this.context.projectPath, '.gitignore');
      let gitignoreContent = await fs.readFile(gitignorePath, 'utf-8').catch(() => '');

      const entriesToAdd = [
        '.pica-local.json',
        `${this.context.piPath}/logs/*`,
        `${this.context.piPath}/memory/session/*`,
        '!.gitkeep',
      ];

      for (const entry of entriesToAdd) {
        if (!gitignoreContent.includes(entry)) {
          gitignoreContent += `\n${entry}`;
        }
      }

      await fs.writeFile(gitignorePath, gitignoreContent);

      console.log('✅ PiCA initialized successfully');
      console.log('📁 Configuration: ' + path.join(this.context.projectPath, '.pica-local.json'));
      console.log('🔑 Set API key: export OPENROUTER_API_KEY="your-key"');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Show PiCA status
   */
  async status(): Promise<void> {
    console.log('\n📊 PiCA Status\n');

    const piPath = path.join(this.context.projectPath, this.context.piPath);

    // Check if initialized
    if (!(await fs.pathExists(piPath))) {
      console.log('⚠️  PiCA not initialized');
      console.log('   Run: pica init\n');
      return;
    }

    console.log('✅ PiCA is initialized');
    console.log(`📁 Project: ${this.context.projectPath}`);

    // Check config
    const configPath = path.join(this.context.projectPath, '.pica-local.json');
    if (await fs.pathExists(configPath)) {
      const config = await fs.readJSON(configPath);
      console.log(`⚙️  Config version: ${config.version}`);
    }

    // Check sessions
    const sessionPath = path.join(piPath, 'memory', 'session');
    if (await fs.pathExists(sessionPath)) {
      const files = await fs.readdir(sessionPath);
      const metaFiles = files.filter((f) => f.endsWith('.meta.json'));
      if (metaFiles.length > 0) {
        console.log(`📋 Active sessions: ${metaFiles.length}`);
      }
    }

    // Check logs
    const logsPath = path.join(piPath, 'logs');
    if (await fs.pathExists(logsPath)) {
      const logFiles = await fs.readdir(logsPath);
      if (logFiles.length > 0) {
        console.log(`📝 Log files: ${logFiles.length}`);
      }
    }

    console.log('\n📚 Resources:');
    console.log('  Dashboard: ' + path.join(this.context.piPath, 'dashboard.html'));
    console.log('  Config: .pica-local.json\n');
  }

  /**
   * Analyze a code file
   */
  async analyze(filePath: string): Promise<void> {
    console.log(`📊 Analyzing: ${filePath}`);

    try {
      // Initialize PiCA
      const pica = await initializePiCA({
        projectPath: this.context.projectPath,
        piPath: this.context.piPath,
        apiKey: this.context.apiKey,
      });

      // Create session
      const sessionId = await pica.sessionManager.createSession(this.context.projectPath);
      console.log(`📌 Session: ${sessionId}`);

      // Read file
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const fileHash = require('crypto').createHash('sha256').update(fileContent).digest('hex');

      // Orchestrate
      const result = await pica.agentx.orchestrate({
        sessionId,
        userInput: `Analyze this code file: ${filePath}`,
        projectPath: this.context.projectPath,
        context: {
          fileContent,
          fileHash,
        },
      });

      console.log('\n✅ Analysis complete');
      console.log(`🎯 Intent: ${result.intentDetected}`);
      console.log(`🤖 Agent: ${result.selectedAgent.name}`);
      console.log(`📊 Tokens: ${result.totalTokens}`);
      console.log(`💰 Cost: $${result.totalCost.toFixed(4)}`);
      console.log(`⏱️  Time: ${result.executionTime}ms\n`);

      console.log('Output:');
      console.log(result.finalOutput);

      // Cleanup
      await pica.sessionManager.completeSession(sessionId);
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate code from description
   */
  async generate(description: string): Promise<void> {
    console.log(`🔨 Generating code: ${description}`);

    try {
      const pica = await initializePiCA({
        projectPath: this.context.projectPath,
        piPath: this.context.piPath,
        apiKey: this.context.apiKey,
      });

      const sessionId = await pica.sessionManager.createSession(this.context.projectPath);

      const result = await pica.agentx.orchestrate({
        sessionId,
        userInput: `Generate code for: ${description}`,
        projectPath: this.context.projectPath,
      });

      console.log('\n✅ Generation complete');
      console.log(`📊 Tokens: ${result.totalTokens}`);
      console.log(`💰 Cost: $${result.totalCost.toFixed(4)}\n`);
      console.log('Generated Code:');
      console.log(result.finalOutput);

      await pica.sessionManager.completeSession(sessionId);
    } catch (error) {
      console.error('❌ Generation failed:', error);
      throw error;
    }
  }

  /**
   * Validate code file
   */
  async validate(filePath: string): Promise<void> {
    console.log(`✔️  Validating: ${filePath}`);

    try {
      const pica = await initializePiCA({
        projectPath: this.context.projectPath,
        piPath: this.context.piPath,
        apiKey: this.context.apiKey,
      });

      const sessionId = await pica.sessionManager.createSession(this.context.projectPath);
      const fileContent = await fs.readFile(filePath, 'utf-8');

      const result = await pica.agentx.orchestrate({
        sessionId,
        userInput: `Validate this code for quality and best practices`,
        projectPath: this.context.projectPath,
        context: {
          fileContent,
        },
      });

      console.log('\n✅ Validation complete');
      console.log(`📊 Tokens: ${result.totalTokens}`);
      console.log(`💰 Cost: $${result.totalCost.toFixed(4)}\n`);
      console.log('Validation Report:');
      console.log(result.finalOutput);

      await pica.sessionManager.completeSession(sessionId);
    } catch (error) {
      console.error('❌ Validation failed:', error);
      throw error;
    }
  }

  /**
   * Show help
   */
  showHelp(): void {
    console.log('\n🤖 PiCA - AI Agent Framework\n');
    console.log('Commands:');
    console.log('  pica init                  Initialize PiCA in current project');
    console.log('  pica analyze <file>        Analyze code file');
    console.log('  pica generate <description> Generate code from description');
    console.log('  pica validate <file>       Validate code file');
    console.log('  pica status                Show PiCA status\n');
    console.log('Options:');
    console.log('  -h, --help                 Show this help');
    console.log('  -v, --version              Show version\n');
  }
}
