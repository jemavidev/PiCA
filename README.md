# PiCA - Pi Coding Agent

**A specialized multi-agent framework for intelligent code analysis, design, generation, and validation.**

PiCA is an advanced orchestration system that coordinates multiple specialized agents to deliver comprehensive code solutions. Built with safety, approval workflows, and extensibility at its core.

---

## 🎯 What is PiCA?

PiCA (Pi Coding Agent) is a **framework for building intelligent agent-based systems** that can:

- **Analyze** code with deep architectural understanding
- **Design** solutions with best practices
- **Generate** high-quality code implementations
- **Validate** code correctness and safety
- **Maintain** repository cleanliness and structure

It combines:
- 🔄 **Multi-Agent Orchestration** - Critic, Architect, Coder, Tester agents working in harmony
- 🎛️ **Approval Framework** - 5-level security model for all operations
- 🎣 **Hook System** - 8 lifecycle events for extensibility
- 💾 **Memory Management** - Session tracking with checksummed integrity
- 🚀 **Parallel Execution** - Up to 4x speedup with agent parallelization
- 🏠 **Repository Hygienizer** - Automated structure analysis and maintenance

---

## 🚀 Quick Start

### Installation

```bash
npm install @pica/agent
```

### Initialize PiCA

```typescript
import { initializePiCA } from '@pica/agent';

const pica = await initializePiCA({
  projectPath: '/path/to/project',
  piPath: '/path/to/.pica',
  apiKey: process.env.OPENROUTER_API_KEY,
});

console.log('✅ PiCA initialized');
```

### Run Analysis

```typescript
const result = await pica.agentx.orchestrate({
  sessionId: 'session-1',
  userInput: 'Analyze this component for performance issues',
  projectPath: '/path/to/project',
});

console.log('Analysis complete:', result.finalOutput);
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Input                           │
├─────────────────────────────────────────────────────────────┤
│                   AgentX Orchestrator                       │
│  ├─ Intent Detection                                       │
│  ├─ Agent Selection                                        │
│  └─ Result Consolidation                                  │
├─────────────────────────────────────────────────────────────┤
│                   Multi-Agent System                        │
│  ├─ Critic Agent (Analyze)                                │
│  ├─ Architect Agent (Design)                              │
│  ├─ Coder Agent (Generate)                                │
│  ├─ Tester Agent (Validate)                               │
│  └─ Hygienizer Agent (Maintain)                           │
├─────────────────────────────────────────────────────────────┤
│              Support Infrastructure                         │
│  ├─ HookManager (Events)                                  │
│  ├─ ApprovalManager (Security)                            │
│  ├─ MemoryManager (State)                                 │
│  ├─ ProviderManager (Models)                              │
│  └─ ParallelExecutor (Performance)                        │
├─────────────────────────────────────────────────────────────┤
│              External Integrations                          │
│  ├─ OpenRouter API                                        │
│  ├─ Git / Version Control                                 │
│  └─ Project File System                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧠 The Four Core Agents

### 1. **Critic Agent** 🔍
Analyzes code for issues, patterns, and improvements.
- Code quality assessment
- Anti-pattern detection
- Performance analysis
- Security review

### 2. **Architect Agent** 🏛️
Designs system structure and high-level solutions.
- Architecture reviews
- Design pattern recommendations
- System redesigns
- Structural improvements

### 3. **Coder Agent** 💻
Generates production-ready code.
- Feature implementation
- Bug fixes
- Code generation
- Refactoring

### 4. **Tester Agent** ✅
Validates code correctness.
- Test generation
- Test execution
- Coverage analysis
- Validation reports

---

## 🔐 Safety & Governance

### 5-Level Approval Framework
```
Level 0: Auto      - Automatic execution (read-only operations)
Level 1: Prompt    - Ask user before executing
Level 2: Required  - Always require explicit approval
Level 3: Manual    - Manual execution only
Level 4: Blocked   - No execution allowed
```

### 8 Lifecycle Hooks
- `onSessionStart` - Session initialization
- `onSessionEnd` - Session completion
- `onAgentSelected` - Agent dispatched
- `onAnalysisComplete` - Analysis finished
- `onCodeGenerated` - Code created
- `onValidationComplete` - Validation done
- `onError` - Error occurred
- `onApprovalRequired` - Approval needed

---

## 🏡 Repository Hygienizer

Automated repository structure maintenance:

```bash
# Quick status check
/repo-status

# Full audit with recommendations
/repo-audit

# Suggest correct location for a file
/repo-suggest-location src/my-file.ts

# Generate cleanup plan
/repo-cleanup
```

Features:
- File classification (CORE, CONFIG, DOCS, DEVELOPMENT, GENERATED)
- Automatic location validation
- Misplaced file detection
- Import rule enforcement
- Hygiene scoring (0-100)

---

## ⚡ Performance

### Parallel Execution
Run multiple agents simultaneously with automatic rate limiting:

```typescript
const result = await executor.executeParallel({
  agents: [criticAgent, architectAgent],
  context: agentContext,
  executeAgent: async (agent, ctx) => { /* ... */ },
  checkApproval: async (agent, ctx) => 'approved',
  getProviderUsage: () => ({ currentRequests: 45, maxRequests: 100 }),
});

// 2 agents in parallel: ~500ms instead of ~1200ms (2.4x faster)
console.log(`Success rate: ${(result.successRate * 100).toFixed(0)}%`);
```

### Context Efficiency
Intelligent context loading with caching:
- **40% token reduction** vs full context
- Incremental loading strategy
- Cache-aware consolidation
- Compression support

---

## 📊 Memory & State

### Session Memory
Automatically tracks:
- User interactions
- Agent decisions
- File operations
- Cost tracking
- Error history

### Checksum Validation
All memory is SHA256-validated:
```typescript
const validation = await memoryManager.validateChecksum(session);
if (validation.isValid) {
  console.log('✅ Memory integrity verified');
}
```

---

## 🔌 Provider Management

Switch between providers transparently:

```typescript
const providerManager = new ProviderManager({
  primary: 'openrouter',
  providers: {
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY,
      models: {
        orchestrator: 'openrouter/openai/gpt-4-turbo',
        analysis: 'openrouter/deepseek/deepseek-chat',
        generation: 'openrouter/deepseek/deepseek-chat',
        validation: 'openrouter/google/gemini-2.0-flash',
      },
      rateLimit: 100,
      timeout: 30000,
    },
  },
}, logger);
```

---

## 📚 Documentation

- **[Installation Guide](./docs/INSTALLATION.md)** - Setup & initialization
- **[API Reference](./docs/API.md)** - Complete API documentation
- **[Architecture Guide](./docs/ARCHITECTURE.md)** - System design & internals
- **[Examples & Guides](./docs/EXAMPLES.md)** - Practical usage examples

---

## 🔧 Project Structure

```
BetterAgents/
├── src/
│   ├── agentx.ts                 # Main orchestrator
│   ├── agent-loader.ts           # Agent management
│   ├── approval-manager.ts       # Security framework
│   ├── hook-manager.ts           # Event system
│   ├── memory-manager.ts         # State management
│   ├── session-manager.ts        # Session tracking
│   ├── parallel-executor.ts      # Parallel execution
│   ├── hygienizer-agent.ts       # Repository analysis
│   ├── hygienizer-cli-handler.ts # CLI commands
│   └── index.ts                  # Main exports
├── docs/
│   ├── README.md                 # This file
│   ├── INSTALLATION.md           # Setup guide
│   ├── API.md                    # API reference
│   ├── ARCHITECTURE.md           # Architecture guide
│   └── EXAMPLES.md               # Usage examples
├── _dev/
│   ├── SECURITY-ANALYSIS.md      # Security analysis
│   ├── PARALLEL-EXECUTION.md     # Parallelization
│   ├── HYGIENIZER-AGENT.md       # Hygienizer spec
│   └── HYGIENIZER-IMPLEMENTATION.md  # Implementation
└── .pica-project-manifest.json   # Repository structure
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm test:watch

# Coverage report
npm test:coverage
```

**Current Coverage:**
- ✅ ParallelExecutor: 8/8 tests passing
- ✅ HygienizAgent: 26/26 tests passing
- ✅ ApprovalManager: Full coverage
- ✅ HookManager: Full coverage

---

## 📦 Publish to npm

```bash
npm run build
npm publish
```

---

## 🤝 Contributing

PiCA welcomes contributions:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🎯 Roadmap

### ✅ Completed
- Core orchestration framework
- 4 specialized agents
- Approval framework
- Hook system
- Memory management
- Session tracking
- Parallel execution
- Repository Hygienizer

### 🚧 In Progress
- AgentX integration with CLI
- HookManager lifecycle integration
- Dashboard visualization

### 🗓️ Planned
- Distributed agent execution
- Advanced caching (L2 Redis)
- ML-based structure optimization
- Team-wide metrics
- Automated CI/CD integration

---

## 📞 Support

- **Issues:** Report bugs via GitHub Issues
- **Discussions:** Ask questions in Discussions
- **Docs:** Full documentation in `/docs`

---

**PiCA - Pi Coding Agent** 🚀  
*Intelligent code analysis, design, generation, and validation at scale.*

Made with ❤️ for developers who demand excellence
