/**
 * Agent Loader
 * Loads agent definitions and prompts from files
 * Supports markdown prompts, JSON configurations, and custom agents
 */

import { AgentDefinition, AgentRole } from './types';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface AgentLoadConfig {
  agentDir: string;
  skillDir: string;
}

export class AgentLoader {
  private config: AgentLoadConfig;
  private logger: any;
  private loadedAgents: Map<string, AgentDefinition>;

  constructor(config: AgentLoadConfig, logger: any) {
    this.config = config;
    this.logger = logger;
    this.loadedAgents = new Map();
  }

  /**
   * Load all default agents (Critic, Architect, Coder, Tester)
   */
  async loadDefaultAgents(): Promise<AgentDefinition[]> {
    this.logger.info('[AgentLoader] Loading default agents');

    const agentRoles: AgentRole[] = ['critic', 'architect', 'coder', 'tester'];
    const agents: AgentDefinition[] = [];

    for (const role of agentRoles) {
      try {
        const agent = await this.loadAgent(role);
        agents.push(agent);
        this.loadedAgents.set(role, agent);
      } catch (error) {
        this.logger.warn(`Failed to load ${role} agent:`, error);
        // Provide default fallback
        agents.push(this.createDefaultAgent(role));
      }
    }

    this.logger.info(`[AgentLoader] Loaded ${agents.length} default agents`);
    return agents;
  }

  /**
   * Load a specific agent by role
   */
  async loadAgent(role: AgentRole): Promise<AgentDefinition> {
    // Check if already loaded
    if (this.loadedAgents.has(role)) {
      return this.loadedAgents.get(role)!;
    }

    // Try to load from files
    const agentPath = path.join(this.config.agentDir, `${role}.md`);

    try {
      // Check if file exists
      if (await fs.pathExists(agentPath)) {
        const content = await fs.readFile(agentPath, 'utf-8');
        return this.parseAgentMarkdown(content, role);
      }

      // Fallback to JSON config
      const jsonPath = path.join(this.config.agentDir, `${role}.json`);
      if (await fs.pathExists(jsonPath)) {
        const config = await fs.readJSON(jsonPath);
        return this.parseAgentConfig(config, role);
      }
    } catch (error) {
      this.logger.warn(`Error loading agent ${role}:`, error);
    }

    // Return default if loading fails
    return this.createDefaultAgent(role);
  }

  /**
   * Parse agent definition from markdown
   */
  private parseAgentMarkdown(content: string, role: AgentRole): AgentDefinition {
    // Extract system prompt from markdown
    // Format: # Agent Name\n\n## System Prompt\n\n[prompt content]
    const systemPromptMatch = content.match(/## System Prompt\n\n([\s\S]*?)(?=\n## |$)/);
    const systemPrompt = systemPromptMatch ? systemPromptMatch[1].trim() : this.getDefaultSystemPrompt(role);

    // Extract capabilities
    const capabilitiesMatch = content.match(/## Capabilities\n\n([\s\S]*?)(?=\n## |$)/);
    const capabilitiesText = capabilitiesMatch ? capabilitiesMatch[1] : '';
    const capabilities = capabilitiesText.split('\n').filter((line) => line.startsWith('-')).map((line) => line.substring(1).trim());

    // Extract skills
    const skillsMatch = content.match(/## Skills\n\n([\s\S]*?)(?=\n## |$)/);
    const skillsText = skillsMatch ? skillsMatch[1] : '';
    const skills = skillsText.split('\n').filter((line) => line.startsWith('-')).map((line) => line.substring(1).trim());

    return {
      id: `agent-${role}`,
      role,
      name: this.formatRoleName(role),
      description: `${this.formatRoleName(role)} agent specializing in ${role === 'critic' ? 'code analysis' : role === 'architect' ? 'system design' : role === 'coder' ? 'code generation' : 'validation'}`,
      systemPrompt,
      capabilities: capabilities.length > 0 ? capabilities : this.getDefaultCapabilities(role),
      skills: skills.length > 0 ? skills : this.getDefaultSkills(role),
      approvalLevel: role === 'architect' ? 1 : 0,
    };
  }

  /**
   * Parse agent definition from JSON config
   */
  private parseAgentConfig(config: any, role: AgentRole): AgentDefinition {
    return {
      id: config.id || `agent-${role}`,
      role,
      name: config.name || this.formatRoleName(role),
      description: config.description || `${this.formatRoleName(role)} agent`,
      systemPrompt: config.systemPrompt || this.getDefaultSystemPrompt(role),
      capabilities: config.capabilities || this.getDefaultCapabilities(role),
      skills: config.skills || this.getDefaultSkills(role),
      approvalLevel: config.approvalLevel || (role === 'architect' ? 1 : 0),
    };
  }

  /**
   * Create default agent when file not found
   */
  private createDefaultAgent(role: AgentRole): AgentDefinition {
    return {
      id: `agent-${role}`,
      role,
      name: this.formatRoleName(role),
      description: `${this.formatRoleName(role)} agent specializing in ${this.getRoleDescription(role)}`,
      systemPrompt: this.getDefaultSystemPrompt(role),
      capabilities: this.getDefaultCapabilities(role),
      skills: this.getDefaultSkills(role),
      approvalLevel: role === 'architect' ? 1 : 0,
    };
  }

  /**
   * Load custom agent from file
   */
  async loadCustomAgent(agentPath: string): Promise<AgentDefinition> {
    if (!await fs.pathExists(agentPath)) {
      throw new Error(`Agent file not found: ${agentPath}`);
    }

    const ext = path.extname(agentPath);

    if (ext === '.md') {
      const content = await fs.readFile(agentPath, 'utf-8');
      // Extract role from filename or use 'custom'
      const role = (path.basename(agentPath, '.md') as AgentRole) || 'coder';
      return this.parseAgentMarkdown(content, role);
    } else if (ext === '.json') {
      const config = await fs.readJSON(agentPath);
      const role = config.role || 'coder';
      return this.parseAgentConfig(config, role);
    }

    throw new Error(`Unsupported agent file format: ${ext}`);
  }

  /**
   * List available agents
   */
  async listAvailableAgents(): Promise<string[]> {
    const agents: string[] = [];

    if (await fs.pathExists(this.config.agentDir)) {
      const files = await fs.readdir(this.config.agentDir);
      agents.push(...files.filter((f) => f.match(/\.(md|json)$/)).map((f) => path.basename(f, path.extname(f))));
    }

    return agents;
  }

  /**
   * Get default system prompt for role
   */
  private getDefaultSystemPrompt(role: AgentRole): string {
    const prompts: Record<AgentRole, string> = {
      critic: `You are the Critic agent, a code analysis specialist. Your role is to:
1. Analyze code for quality issues
2. Identify performance bottlenecks
3. Detect security vulnerabilities
4. Suggest improvements

Provide structured feedback with:
- Issues found (severity: low/medium/high)
- Root causes
- Specific recommendations

Output format: Use markdown with clear sections.`,

      architect: `You are the Architect agent, a system design specialist. Your role is to:
1. Design system architecture
2. Plan component structure
3. Define data models
4. Create implementation roadmaps

Provide structured design with:
- System overview
- Component responsibilities
- Data flow diagrams
- Integration points

Output format: Use markdown with clear sections and ASCII diagrams where helpful.`,

      coder: `You are the Coder agent, a code generation specialist. Your role is to:
1. Generate production-ready code
2. Follow best practices
3. Include proper error handling
4. Add documentation

Provide complete code with:
- Implementation
- Type definitions (if applicable)
- Error handling
- Usage examples

Output format: Use code blocks with proper syntax highlighting.`,

      tester: `You are the Tester agent, a validation specialist. Your role is to:
1. Validate code quality
2. Review test coverage
3. Check edge cases
4. Ensure compliance

Provide validation report with:
- Test coverage analysis
- Edge cases identified
- Compliance issues
- Recommendations

Output format: Use markdown with clear sections.`,
    };

    return prompts[role];
  }

  /**
   * Get default capabilities for role
   */
  private getDefaultCapabilities(role: AgentRole): string[] {
    const capabilities: Record<AgentRole, string[]> = {
      critic: ['code-analysis', 'quality-assessment', 'security-review', 'performance-profiling'],
      architect: ['system-design', 'architecture-planning', 'component-modeling', 'data-flow-design'],
      coder: ['code-generation', 'implementation', 'refactoring', 'optimization'],
      tester: ['test-generation', 'validation', 'coverage-analysis', 'compliance-checking'],
    };

    return capabilities[role];
  }

  /**
   * Get default skills for role
   */
  private getDefaultSkills(role: AgentRole): string[] {
    const skills: Record<AgentRole, string[]> = {
      critic: ['pattern-detection', 'security-check', 'performance-analysis'],
      architect: ['architecture-planning', 'component-design', 'data-modeling'],
      coder: ['code-generation', 'best-practices', 'error-handling'],
      tester: ['test-generation', 'coverage-analysis', 'compliance-check'],
    };

    return skills[role];
  }

  /**
   * Get role description
   */
  private getRoleDescription(role: AgentRole): string {
    const descriptions: Record<AgentRole, string> = {
      critic: 'code analysis and quality assessment',
      architect: 'system design and architecture',
      coder: 'code generation and implementation',
      tester: 'validation and testing',
    };

    return descriptions[role];
  }

  /**
   * Format role name for display
   */
  private formatRoleName(role: AgentRole): string {
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  /**
   * Get all loaded agents
   */
  getLoadedAgents(): AgentDefinition[] {
    return Array.from(this.loadedAgents.values());
  }

  /**
   * Clear loaded agents cache
   */
  clearCache(): void {
    this.loadedAgents.clear();
    this.logger.debug('[AgentLoader] Cleared agent cache');
  }
}
