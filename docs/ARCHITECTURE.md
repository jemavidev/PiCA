# PiCA Architecture

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                   User Interface                     │
│              (CLI / Programmatic API)                │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              AgentX Orchestrator                     │
│         (4-D: Deconstruct→Diagnose→Develop→Dispatch)│
└──────────────────┬──────────────────────────────────┘
         ┌─────────┼─────────┬──────────┐
         │         │         │          │
    ┌────▼──┐ ┌───▼──┐ ┌───▼───┐ ┌──▼─────┐
    │Critic │ │Arch. │ │Coder  │ │Tester  │
    │Agent  │ │Agent │ │Agent  │ │Agent   │
    └────┬──┘ └───┬──┘ └───┬───┘ └──┬─────┘
         │         │        │       │
    ┌────▼─────────▼────────▼───────▼────┐
    │     Provider Manager (Multi-LLM)    │
    │  ┌─────────────────────────────┐   │
    │  │ Circuit Breaker + Failover  │   │
    │  └─────────────────────────────┘   │
    └────────────────────────────────────┘
         │         │        │       │
    ┌────▼─┐  ┌───▼──┐ ┌──▼──┐ ┌──▼───┐
    │OpenRouter│Anthropic│OpenAI│Gemini│
    └────────┘  └────────┘ └────┘ └─────┘
```

## Core Components

### 1. AgentX Orchestrator

**Purpose:** Route user requests to appropriate agents using the 4-D methodology

**Pipeline:**
```
DECONSTRUCT
  ├─ Parse input structure
  ├─ Extract keywords
  └─ Assess complexity

DIAGNOSE
  ├─ Detect intent (analyze/design/generate/validate)
  ├─ Load relevant context
  └─ Retrieve execution history

DEVELOP
  ├─ Map intent to best agent
  ├─ Prepare execution context
  └─ Check approval level

DISPATCH
  ├─ Execute agent
  ├─ Handle approvals
  ├─ Cache results
  ├─ Emit hooks
  └─ Record to memory
```

### 2. Memory Manager

**Responsibilities:**
- Session-based memory storage
- SHA256 checksum validation
- Analysis result caching
- Version rollback (keep 3 versions)
- Integrity verification

**Memory Step Structure:**
```json
{
  "id": "step-123",
  "timestamp": 1234567890,
  "agentId": "agent-critic",
  "intentCategory": "analyze",
  "content": "Analysis results...",
  "checksum": "sha256-hash",
  "metadata": { "duration": 150, "tokens": 512 }
}
```

### 3. Session Manager

**Features:**
- Session lifecycle management (active → paused → completed)
- Metadata persistence
- Auto-save every 5 seconds
- Session recovery
- Metrics tracking

### 4. Hook Manager

**8 Lifecycle Hooks:**
```
onSessionStart
  └─ Fires when orchestration begins

onSessionEnd
  └─ Fires when orchestration completes

onAgentSelected
  └─ Fires when agent is chosen

onAnalysisComplete
  └─ Fires when analysis finishes

onCodeGenerated
  └─ Fires when code is generated

onValidationComplete
  └─ Fires when validation finishes

onError
  └─ Fires when error occurs

onApprovalRequired
  └─ Fires when approval needed
```

**Features:**
- Priority-based execution
- Error isolation (failures don't cascade)
- Event history (max 100 events)
- Handler enable/disable at runtime

### 5. Approval Manager

**5-Level Authorization:**
```
Level 0: Auto
  └─ Automatic execution (no approval)

Level 1: Prompt
  └─ Ask before executing

Level 2: Required
  └─ Always require approval

Level 3: Manual
  └─ Manual execution only

Level 4: Blocked
  └─ No execution allowed
```

**Request Lifecycle:**
```
checkApproval()
  ├─ Check agent's approval level
  ├─ Create approval request if needed
  ├─ Emit onApprovalRequired hook
  ├─ Track in pending requests
  └─ Record in history

approveRequest()
  └─ Move to history

rejectRequest()
  └─ Move to history
```

### 6. Skill Registry

**Operations:**
- Register custom skills
- Query by agent, category
- Full-text search
- Get statistics
- Bulk loading

**Skill Structure:**
```json
{
  "id": "skill-id",
  "name": "Skill Name",
  "description": "What it does",
  "category": "analyzer|generator|validator|custom",
  "agents": ["coder", "critic"],
  "prompts": [
    {
      "name": "prompt-name",
      "content": "Prompt template",
      "parameters": { "param": "description" }
    }
  ],
  "examples": [],
  "version": "1.0.0"
}
```

### 7. Provider Manager

**Architecture:**
```
Provider Request
  │
  ├─ Check circuit breaker status
  ├─ Check rate limit
  ├─ Select provider (primary or failover)
  │
  ├─ If primary fails:
  │   └─ Increment failure count
  │   └─ Try backup provider
  │   └─ If threshold reached, open circuit
  │
  ├─ Execute API call
  ├─ Calculate cost
  ├─ Record latency
  │
  └─ Return response
```

**Features:**
- Circuit breaker (5 failures, 60s reset)
- Rate limiting (100 req/min per provider)
- Automatic failover
- Cost tracking
- Health checking

### 8. Context Loader

**Incremental Loading Strategy:**

```
Low Complexity    (~100 tokens)
  ├─ Intent summary
  └─ Key variables

Medium Complexity (~800 tokens)
  ├─ Intent + minimal context
  ├─ File content
  └─ Recent steps

High Complexity   (~2000 tokens)
  ├─ Full file
  ├─ Complete history
  ├─ Related files
  └─ Session context

Target: 40% token reduction vs full context
```

## Data Flow

### Analysis Workflow
```
User Input
    ↓
[AgentX] DECONSTRUCT
    ↓
[AgentX] DIAGNOSE + load context
    ↓
[ContextLoader] Smart context selection
    ↓
[AgentX] DEVELOP + map to Critic
    ↓
[ApprovalManager] Check level (0 = auto)
    ↓
[HookManager] Emit onAgentSelected
    ↓
[ProviderManager] Call OpenRouter with system prompt
    ↓
[MemoryManager] Cache result with checksum
    ↓
[HookManager] Emit onAnalysisComplete
    ↓
Result to User
```

### Code Generation Workflow
```
User Input ("create a function...")
    ↓
[AgentX] DECONSTRUCT intent
    ↓
[AgentX] DIAGNOSE = "generate"
    ↓
[ApprovalManager] Map Coder agent (level 0)
    ↓
[SkillRegistry] Load code-generation skills
    ↓
[ProviderManager] Call LLM with Coder system prompt + skills
    ↓
[MemoryManager] Store with SHA256 checksum
    ↓
[HookManager] Emit onCodeGenerated
    ↓
Generated Code to User
```

## Integration Points

### AgentX ↔ ApprovalManager
- `checkApproval()` delegates to ApprovalManager
- Returns: approved | rejected | pending
- Emits hook on approval required

### AgentX ↔ HookManager
- Emits all 8 lifecycle hooks
- Hooks run in priority order
- Errors don't cascade

### AgentX ↔ ProviderManager
- Calls provider for LLM responses
- Handles failover automatically
- Tracks costs and tokens

### AgentX ↔ MemoryManager
- Records steps with checksums
- Caches analysis results
- Retrieves history

## Security & Reliability

### Checksums
- SHA256 on every memory step
- Validation on retrieval
- Integrity verification on startup

### Circuit Breaker
- 5 consecutive failures = circuit open
- 60 second reset timeout
- Automatic failover to backup

### Approval Trail
- All approvals recorded
- Timestamp and metadata
- Queryable history

### Error Handling
- Isolated hook execution
- Provider failover
- Graceful degradation
- Detailed error logging

## Performance Characteristics

| Operation | Time | Notes |
|-----------|------|-------|
| Framework init | <1s | One-time cost |
| Hook emission | ~10ms | 8 handlers |
| Approval check | <5ms | Memory lookup |
| Provider call | 500ms-2s | Depends on LLM |
| Memory save | ~20ms | With checksum |

## Extensibility Points

1. **Custom Hooks** - Register handlers for any hook
2. **Custom Skills** - Add to SkillRegistry
3. **Custom Agents** - Load from markdown/JSON
4. **Custom Providers** - Implement Provider interface
5. **Custom Approval Logic** - Override checkApproval

## File Organization

```
src/
├── Core orchestration
│   ├── agentx.ts
│   ├── types.ts
│   └── index.ts
│
├── Managers
│   ├── memory-manager.ts
│   ├── session-manager.ts
│   ├── logger.ts
│   ├── hook-manager.ts
│   ├── approval-manager.ts
│   ├── skill-registry.ts
│   ├── context-loader.ts
│   └── persistence-manager.ts
│
├── Agents & Loading
│   └── agent-loader.ts
│
├── Providers
│   └── providers/
│       ├── provider-manager.ts
│       ├── openrouter-provider.ts
│       └── types.ts
│
├── CLI
│   └── cli/
│       └── cli-manager.ts
│
└── Utilities
    └── utils/
        ├── checksum.ts
        └── file-io.ts
```

## Future Extensions

- Dashboard real-time metrics
- Meta-Agent autonomous decision making
- Parallel agent execution
- Advanced caching strategies
- Performance profiling
- Custom provider development
