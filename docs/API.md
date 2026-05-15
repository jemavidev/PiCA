# PiCA API Reference

## Main Export

### `initializePiCA(config)`

Initializes the PiCA framework with all managers.

**Parameters:**
```typescript
config: {
  projectPath: string;        // Path to your project
  piPath: string;             // Relative path to .pica directory
  apiKey: string;             // OpenRouter API key
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
```

**Returns:**
```typescript
{
  agentx: AgentX;
  memoryManager: MemoryManager;
  sessionManager: SessionManager;
  logger: Logger;
  contextLoader: ContextLoader;
  persistenceManager: PersistenceManager;
  providerManager: ProviderManager;
  hookManager: HookManager;
  approvalManager: ApprovalManager;
  skillRegistry: SkillRegistry;
}
```

**Example:**
```typescript
const pica = await initializePiCA({
  projectPath: process.cwd(),
  piPath: '.pica',
  apiKey: process.env.OPENROUTER_API_KEY,
  logLevel: 'info'
});
```

---

## AgentX Orchestrator

### `agentx.orchestrate(request)`

Route user input through the 4-D pipeline to appropriate agents.

**Parameters:**
```typescript
request: {
  sessionId: string;           // Current session ID
  userInput: string;           // User's request
  projectPath: string;         // Project directory
  context?: Partial<AgentContext>;
}
```

**Returns:**
```typescript
{
  sessionId: string;
  intentDetected: 'analyze' | 'design' | 'generate' | 'validate';
  selectedAgent: AgentDefinition;
  agentResults: AgentResult[];
  finalOutput: string;
  recommendedNextSteps: string[];
  totalTokens: number;
  totalCost: number;
  executionTime: number;
}
```

---

## HookManager

### `hookManager.on(hookName, handler, priority)`

Register a hook handler.

**Parameters:**
```typescript
hookName: HookName;                    // Hook to register
handler: (context: HookContext) => Promise<void>;
priority?: number;                     // Higher = executes first (default: 0)
```

**Returns:** `string` (handler ID)

### `hookManager.off(hookName, handlerId)`

Unregister a hook handler.

**Parameters:**
```typescript
hookName: HookName;
handlerId: string;
```

**Returns:** `boolean`

### `hookManager.emit(hookName, context)`

Emit a hook event (non-blocking).

**Parameters:**
```typescript
hookName: HookName;
context: HookContext;
```

### `hookManager.emitBlocking(hookName, context)`

Emit a hook event (blocking - wait for all handlers).

**Parameters:**
```typescript
hookName: HookName;
context: HookContext;
```

**Returns:** `Promise<void[]>`

### `hookManager.getEventHistory(limit)`

Get recent hook events.

**Parameters:**
```typescript
limit?: number;  // Default: 20
```

**Returns:** `Array<{ name: HookName; timestamp: number }>`

### `hookManager.getStats()`

Get hook statistics.

**Returns:**
```typescript
{
  totalHooks: number;
  hooksWithHandlers: number;
  totalHandlers: number;
  recentEvents: number;
}
```

### Hook Names

```typescript
type HookName =
  | 'onSessionStart'
  | 'onSessionEnd'
  | 'onAgentSelected'
  | 'onAnalysisComplete'
  | 'onCodeGenerated'
  | 'onValidationComplete'
  | 'onError'
  | 'onApprovalRequired';
```

---

## ApprovalManager

### `approvalManager.checkApproval(agent, context)`

Check if an agent requires approval.

**Parameters:**
```typescript
agent: AgentDefinition;
context: AgentContext;
```

**Returns:** `Promise<'approved' | 'rejected' | 'pending'>`

### `approvalManager.approveRequest(requestId)`

Approve an approval request.

**Parameters:**
```typescript
requestId: string;
```

**Returns:** `boolean`

### `approvalManager.rejectRequest(requestId)`

Reject an approval request.

**Parameters:**
```typescript
requestId: string;
```

**Returns:** `boolean`

### `approvalManager.getPendingRequests()`

Get all pending approval requests.

**Returns:** `ApprovalRequest[]`

### `approvalManager.getApprovalHistory(limit)`

Get approval history.

**Parameters:**
```typescript
limit?: number;  // Default: 50
```

**Returns:** `ApprovalRequest[]`

### `approvalManager.getStats()`

Get approval statistics.

**Returns:**
```typescript
{
  pendingRequests: number;
  approvedCount: number;
  rejectedCount: number;
  totalProcessed: number;
}
```

---

## SkillRegistry

### `skillRegistry.registerSkill(skill)`

Register a skill.

**Parameters:**
```typescript
skill: SkillDefinition
```

### `skillRegistry.getSkill(id)`

Get a skill by ID.

**Parameters:**
```typescript
id: string;
```

**Returns:** `SkillDefinition | undefined`

### `skillRegistry.getSkillsByAgent(agent)`

Get all skills for an agent.

**Parameters:**
```typescript
agent: AgentRole;  // 'critic' | 'architect' | 'coder' | 'tester'
```

**Returns:** `SkillDefinition[]`

### `skillRegistry.getSkillsByCategory(category)`

Get skills by category.

**Parameters:**
```typescript
category: 'analyzer' | 'generator' | 'validator' | 'custom';
```

**Returns:** `SkillDefinition[]`

### `skillRegistry.search(query)`

Search skills by name, description, or ID.

**Parameters:**
```typescript
query: string;
```

**Returns:** `SkillDefinition[]`

### `skillRegistry.getStats()`

Get registry statistics.

**Returns:**
```typescript
{
  totalSkills: number;
  skillsByCategory: Record<string, number>;
  skillsByAgent: Record<string, number>;
}
```

### `skillRegistry.unregisterSkill(skillId)`

Remove a skill.

**Parameters:**
```typescript
skillId: string;
```

**Returns:** `boolean`

---

## SessionManager

### `sessionManager.createSession(projectPath)`

Create a new session.

**Parameters:**
```typescript
projectPath: string;
```

**Returns:** `Promise<string>` (session ID)

### `sessionManager.loadSessionMetadata(sessionId)`

Get session metadata.

**Parameters:**
```typescript
sessionId: string;
```

**Returns:** `Promise<SessionMetadata>`

### `sessionManager.completeSession(sessionId)`

Mark session as complete.

**Parameters:**
```typescript
sessionId: string;
```

### `sessionManager.pauseSession(sessionId)`

Pause session (can be resumed).

**Parameters:**
```typescript
sessionId: string;
```

### `sessionManager.resumeSession(sessionId)`

Resume paused session.

**Parameters:**
```typescript
sessionId: string;
```

---

## MemoryManager

### `memoryManager.recordStep(step)`

Record a memory step.

**Parameters:**
```typescript
step: MemoryStep
```

### `memoryManager.loadMemory(sessionId)`

Load session memory.

**Parameters:**
```typescript
sessionId: string;
```

**Returns:** `Promise<MemorySession>`

### `memoryManager.validateChecksum(session)`

Validate memory integrity.

**Parameters:**
```typescript
session: MemorySession;
```

**Returns:** `ChecksumValidationResult`

---

## ContextLoader

### `contextLoader.load(context, complexity)`

Load context intelligently based on complexity.

**Parameters:**
```typescript
context: AgentContext;
complexity: 'low' | 'medium' | 'high';
```

**Returns:** `Promise<ContextLoadResult>`

**Result:**
```typescript
{
  step: 'intent' | 'minimal' | 'standard' | 'full';
  content: string;
  tokensEstimate: number;
  cacheHit: boolean;
}
```

---

## ProviderManager

### `providerManager.call(request)`

Call an LLM provider.

**Parameters:**
```typescript
request: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
}
```

**Returns:** `Promise<ProviderResponse>`

**Response:**
```typescript
{
  model: string;
  content: string;
  tokensUsed: number;
  costUsd: number;
  provider: ProviderName;
  latency: number;
  cached?: boolean;
}
```

### `providerManager.getModelForIntent(intent)`

Get recommended model for intent.

**Parameters:**
```typescript
intent: 'analyze' | 'design' | 'generate' | 'validate';
```

**Returns:** `string`

---

## AgentLoader

### `agentLoader.loadDefaultAgents()`

Load all 4 default agents.

**Returns:** `Promise<AgentDefinition[]>`

### `agentLoader.loadAgent(role)`

Load agent by role.

**Parameters:**
```typescript
role: 'critic' | 'architect' | 'coder' | 'tester';
```

**Returns:** `Promise<AgentDefinition>`

### `agentLoader.loadCustomAgent(agentPath)`

Load custom agent from file.

**Parameters:**
```typescript
agentPath: string;  // .md or .json file
```

**Returns:** `Promise<AgentDefinition>`

---

## Types

### AgentDefinition

```typescript
interface AgentDefinition {
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
```

### SkillDefinition

```typescript
interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: 'analyzer' | 'generator' | 'validator' | 'custom';
  agents: AgentRole[];
  prompts: SkillPrompt[];
  examples: SkillExample[];
  version: string;
}
```

### ApprovalRequest

```typescript
interface ApprovalRequest {
  id: string;
  agentId: string;
  context: AgentContext;
  proposedAction: string;
  level: ApprovalLevel;
  status: 'pending' | 'approved' | 'rejected';
}
```

### MemoryStep

```typescript
interface MemoryStep {
  id: string;
  timestamp: number;
  agentId: string;
  intentCategory: string;
  content: string;
  checksum: string;
  algorithm: 'sha256';
  metadata: Record<string, any>;
}
```

