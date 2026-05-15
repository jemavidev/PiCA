/**
 * PiCA Core Types
 * Single source of truth for all TypeScript interfaces
 */

// ============================================================================
// MEMORY & CHECKSUM
// ============================================================================

export interface MemoryStep {
  id: string;
  timestamp: number;
  agentId: string;
  intentCategory: string;
  content: string;
  checksum: string;
  algorithm: 'sha256';
  metadata: Record<string, any>;
}

export interface MemorySession {
  id: string;
  projectPath: string;
  createdAt: number;
  updatedAt: number;
  version: string;
  steps: MemoryStep[];
  checksumValidation: {
    algorithm: string;
    lastVerified: number;
    isValid: boolean;
  };
}

export interface ChecksumValidationResult {
  isValid: boolean;
  expected: string;
  actual: string;
  algorithm: string;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

export type SessionState = 'active' | 'paused' | 'completed' | 'error';

export interface SessionMetadata {
  id: string;
  projectPath: string;
  createdAt: number;
  updatedAt: number;
  version: string;
  state: SessionState;
  activeAgent?: string;
  totalTokens: number;
  totalCost: number;
  agentMetrics: Record<string, AgentMetrics>;
}

export interface AgentMetrics {
  executions: number;
  averageLatency: number;
  averageTokens: number;
  totalCost: number;
  lastExecution: number;
  errorCount: number;
}

export interface SessionFile {
  metadata: SessionMetadata;
  memory: MemorySession;
  lastCheckpoint?: CheckpointData;
}

// ============================================================================
// AGENT SYSTEM
// ============================================================================

export type AgentRole = 'critic' | 'architect' | 'coder' | 'tester';
export type IntentCategory = 'analyze' | 'design' | 'generate' | 'validate';
export type ApprovalLevel = 0 | 1 | 2 | 3 | 4; // Auto → Manual

export interface AgentDefinition {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  skills: string[];
  approvalLevel: ApprovalLevel;
  costBudget?: number;
}

export interface AgentContext {
  sessionId: string;
  projectPath: string;
  userInput: string;
  intent: IntentCategory;
  fileContent?: string;
  fileHash?: string;
  cacheKey?: string;
  previousSteps: MemoryStep[];
  approvalRequired: boolean;
}

export interface AgentResult {
  agentId: string;
  role: AgentRole;
  success: boolean;
  output: string;
  metadata: {
    startTime: number;
    endTime: number;
    tokensUsed: number;
    costUsd: number;
    cacheHit: boolean;
  };
  error?: string;
  actionItems?: ActionItem[];
}

export interface ActionItem {
  type: 'warning' | 'info' | 'suggestion' | 'error';
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface AgentState {
  agentId: string;
  role: AgentRole;
  isActive: boolean;
  lastExecution?: number;
  currentContext?: AgentContext;
  recentResults: AgentResult[];
}

// ============================================================================
// ORCHESTRATOR (AgentX)
// ============================================================================

export interface OrchestrationRequest {
  sessionId: string;
  userInput: string;
  projectPath: string;
  context?: Partial<AgentContext>;
}

export interface OrchestrationResult {
  sessionId: string;
  intentDetected: IntentCategory;
  selectedAgent: AgentDefinition;
  agentResults: AgentResult[];
  finalOutput: string;
  recommendedNextSteps: string[];
  totalTokens: number;
  totalCost: number;
  executionTime: number;
}

export interface AgentXConfig {
  agents: AgentDefinition[];
  contextLoader: ContextLoaderConfig;
  approvalFramework: ApprovalFrameworkConfig;
  hooks: HookConfig;
}

// ============================================================================
// CONTEXT LOADING (Token Efficiency)
// ============================================================================

export type ContextStep = 'intent' | 'minimal' | 'standard' | 'full';

export interface ContextLoaderConfig {
  strategy: 'incremental' | 'full' | 'smart';
  maxTokensPerRequest: number;
  cacheDuration: number; // milliseconds
  compressionEnabled: boolean;
  loadContext?: (context: AgentContext, complexity: 'low' | 'medium' | 'high') => Promise<string>;
}

export interface ContextLoadResult {
  step: ContextStep;
  content: string;
  tokensEstimate: number;
  cacheHit: boolean;
}

// ============================================================================
// CACHING & ANALYSIS PERSISTENCE
// ============================================================================

export interface AnalysisCache {
  fileHash: string;
  agentId: string;
  result: AgentResult;
  createdAt: number;
  expiresAt: number;
  hits: number;
}

export interface CacheEntry {
  key: string;
  value: any;
  expiresAt: number;
  hits: number;
  lastAccessed: number;
}

// ============================================================================
// CHECKPOINTING & RECOVERY
// ============================================================================

export interface CheckpointData {
  id: string;
  sessionId: string;
  timestamp: number;
  memorySnapshot: MemorySession;
  sessionSnapshot: SessionMetadata;
  userDescription?: string;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  label: string;
  timestamp: number;
  description?: string;
}

// ============================================================================
// APPROVAL FRAMEWORK
// ============================================================================

export interface ApprovalFrameworkConfig {
  levels: Record<ApprovalLevel, ApprovalLevelConfig>;
  defaultLevel: ApprovalLevel;
}

export interface ApprovalLevelConfig {
  name: string;
  description: string;
  requiresManualApproval: boolean;
  auditTrail: boolean;
}

export interface ApprovalRequest {
  id: string;
  agentId: string;
  context: AgentContext;
  proposedAction: string;
  level: ApprovalLevel;
  status: 'pending' | 'approved' | 'rejected';
}

// ============================================================================
// HOOKS & EXTENSIBILITY
// ============================================================================

export type HookName =
  | 'onSessionStart'
  | 'onSessionEnd'
  | 'onAgentSelected'
  | 'onAnalysisComplete'
  | 'onCodeGenerated'
  | 'onValidationComplete'
  | 'onError'
  | 'onApprovalRequired';

export interface Hook {
  name: HookName;
  handler: (context: HookContext) => Promise<void>;
  priority?: number;
}

export interface HookContext {
  sessionId: string;
  timestamp?: number;
  eventData?: any;
  [key: string]: any;
}

export interface HookConfig {
  enabled: boolean;
  hooks: Hook[];
}

// ============================================================================
// SKILLS & REGISTRY
// ============================================================================

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: 'analyzer' | 'generator' | 'validator' | 'custom';
  agents: AgentRole[];
  prompts: SkillPrompt[];
  examples: SkillExample[];
  version: string;
}

export interface SkillPrompt {
  name: string;
  content: string;
  parameters: Record<string, string>;
}

export interface SkillExample {
  input: string;
  output: string;
  explanation: string;
}

export interface SkillRegistry {
  skills: Map<string, SkillDefinition>;
  getSkill(id: string): SkillDefinition | undefined;
  getSkillsByAgent(agent: AgentRole): SkillDefinition[];
  getSkillsByCategory(category: SkillDefinition['category']): SkillDefinition[];
  registerSkill(skill: SkillDefinition): void;
}

// ============================================================================
// PROVIDERS & FAILOVER
// ============================================================================

export type ProviderName = 'openrouter' | 'anthropic' | 'openai' | 'gemini';

export interface ProviderConfig {
  name: ProviderName;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  models: Record<string, string>;
  rateLimit: number;
  timeout: number;
  retryAttempts: number;
}

export interface ProviderResponse {
  model: string;
  content: string;
  tokensUsed: number;
  costUsd: number;
  provider: ProviderName;
  latency: number;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

// ============================================================================
// LOGGING & METRICS
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface MetricsEntry {
  timestamp: number;
  sessionId: string;
  agentId: string;
  latency: number;
  tokensUsed: number;
  costUsd: number;
  cacheHit: boolean;
}

export interface LoggerConfig {
  level: LogLevel;
  logDir: string;
  formats: ('jsonl' | 'json' | 'text')[];
  maxFileSize?: number;
  retention?: number; // days
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface PiCAConfig {
  version: string;
  piPath: string;
  apiKey: string;
  providers: Record<string, ProviderConfig>;
  memory: MemoryConfig;
  logging: LoggerConfig;
  dashboard: DashboardConfig;
}

export interface LocalConfig {
  version: string;
  projectPath: string;
  openrouterApiKey: string;
  settings: {
    autoRefresh: number;
    tokenBudget: number;
    cacheDuration: number;
    logRetention: number;
  };
  customization: {
    dashboardPort?: number;
    customAgents: AgentDefinition[];
    customSkills: SkillDefinition[];
  };
}

export interface MemoryConfig {
  maxSessionSize: string;
  keepVersions: number;
  compressionEnabled: boolean;
  checksumAlgorithm: 'sha256' | 'md5';
}

export interface DashboardConfig {
  enabled: boolean;
  port: number | null;
  pollingInterval: number;
  maxChartPoints: number;
}

// ============================================================================
// DASHBOARD & METRICS
// ============================================================================

export interface DashboardData {
  timestamp: number;
  sessions: SessionMetadata[];
  metrics: MetricsEntry[];
  patterns: PatternDetection[];
}

export interface PatternDetection {
  type: 'highCost' | 'slowAgent' | 'repeatError' | 'cacheHit';
  severity: 'info' | 'warning' | 'alert';
  message: string;
  timestamp: number;
  affectedAgents?: string[];
}

export interface ChartDataPoint {
  timestamp: number;
  value: number;
  label?: string;
}

export interface TimelineEvent {
  timestamp: number;
  agentId: string;
  event: string;
  duration: number;
  status: 'success' | 'error';
}

// ============================================================================
// FILE I/O & PERSISTENCE
// ============================================================================

export interface FileIOConfig {
  basePath: string;
  encoding: 'utf-8';
  sync: boolean;
}

export interface FileIOResult {
  path: string;
  success: boolean;
  bytes: number;
  error?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface EventEmitter {
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}
