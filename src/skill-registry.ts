/**
 * Skill Registry
 * Manages skill definitions and provides querying capabilities
 * Skills extend agent capabilities for specialized tasks
 */

import { SkillDefinition, AgentRole } from './types';

export class SkillRegistry {
  private skills: Map<string, SkillDefinition>;
  private logger: any;

  constructor(logger: any) {
    this.skills = new Map();
    this.logger = logger;
    this.logger.info('[SkillRegistry] Initialized');
  }

  /**
   * Register a skill
   */
  registerSkill(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      this.logger.warn(`[SkillRegistry] Skill ${skill.id} already registered, overwriting`);
    }

    this.skills.set(skill.id, skill);
    this.logger.debug(`[SkillRegistry] Registered skill: ${skill.name} (${skill.id})`);
  }

  /**
   * Unregister a skill
   */
  unregisterSkill(skillId: string): boolean {
    if (!this.skills.has(skillId)) {
      this.logger.warn(`[SkillRegistry] Skill not found: ${skillId}`);
      return false;
    }

    this.skills.delete(skillId);
    this.logger.debug(`[SkillRegistry] Unregistered skill: ${skillId}`);
    return true;
  }

  /**
   * Get a skill by ID
   */
  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /**
   * Get all skills for an agent
   */
  getSkillsByAgent(agent: AgentRole): SkillDefinition[] {
    return Array.from(this.skills.values()).filter((skill) => skill.agents.includes(agent));
  }

  /**
   * Get all skills in a category
   */
  getSkillsByCategory(category: SkillDefinition['category']): SkillDefinition[] {
    return Array.from(this.skills.values()).filter((skill) => skill.category === category);
  }

  /**
   * Get all registered skills
   */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * List all skill IDs
   */
  listSkillIds(): string[] {
    return Array.from(this.skills.keys());
  }

  /**
   * Check if skill is registered
   */
  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * Get skills that support multiple agents
   */
  getSharedSkills(agents: AgentRole[]): SkillDefinition[] {
    return Array.from(this.skills.values()).filter((skill) =>
      agents.every((agent) => skill.agents.includes(agent))
    );
  }

  /**
   * Get statistics about registered skills
   */
  getStats(): {
    totalSkills: number;
    skillsByCategory: Record<string, number>;
    skillsByAgent: Record<string, number>;
  } {
    const skillsByCategory: Record<string, number> = {};
    const skillsByAgent: Record<string, number> = {};

    for (const skill of this.skills.values()) {
      // Count by category
      skillsByCategory[skill.category] = (skillsByCategory[skill.category] || 0) + 1;

      // Count by agent
      for (const agent of skill.agents) {
        skillsByAgent[agent] = (skillsByAgent[agent] || 0) + 1;
      }
    }

    return {
      totalSkills: this.skills.size,
      skillsByCategory,
      skillsByAgent,
    };
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
    this.logger.debug('[SkillRegistry] All skills cleared');
  }

  /**
   * Load multiple skills at once
   */
  loadSkills(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.registerSkill(skill);
    }
    this.logger.info(`[SkillRegistry] Loaded ${skills.length} skills`);
  }

  /**
   * Get skill count
   */
  count(): number {
    return this.skills.size;
  }

  /**
   * Search skills by name or description
   */
  search(query: string): SkillDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.skills.values()).filter(
      (skill) =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.id.toLowerCase().includes(lowerQuery)
    );
  }
}
