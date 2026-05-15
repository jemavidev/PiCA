# PiCA - Proactive Integrated Coding Agent

**A powerful AI-driven framework for automated code analysis, generation, and validation.**

## Overview

PiCA is a multi-agent orchestration framework that leverages large language models to assist with:
- **Code Analysis** (Critic Agent)
- **System Design** (Architect Agent)
- **Code Generation** (Coder Agent)
- **Testing & Validation** (Tester Agent)

## Quick Start

### Installation

```bash
npm install @pica/agent
```

### Initialize a Project

```bash
pica init
```

This creates the `.pica` directory structure with:
- `agents/` - Custom agent definitions
- `skills/` - Extended agent capabilities
- `config/` - Configuration files
- `memory/` - Session and cache storage
- `logs/` - Execution logs

### Basic Usage

```bash
# Analyze a code file
pica analyze src/app.ts

# Generate code from description
pica generate "create a function to calculate fibonacci"

# Validate code quality
pica validate src/utils.ts

# Show project status
pica status
```

## Features

### 🎯 Multi-Agent System
- **Critic Agent**: Code analysis, quality assessment, security review
- **Architect Agent**: System design, architecture planning, component modeling
- **Coder Agent**: Code generation, implementation, refactoring
- **Tester Agent**: Test generation, validation, coverage analysis

### 🔄 4-D Orchestration Pipeline
1. **Deconstruct** - Parse and analyze user input
2. **Diagnose** - Detect intent and load context
3. **Develop** - Map to appropriate agent
4. **Dispatch** - Execute with approval and caching

### 🪝 Event-Driven Architecture
- 8 lifecycle hooks for extensibility
- Priority-based handler execution
- Event history and introspection

### ✅ Approval Framework
- 5-level authorization system (Auto → Manual → Blocked)
- Request tracking and audit trail
- Integration with hook system

### 📚 Skill Registry
- Dynamic skill registration
- Advanced querying and search
- Per-agent capability management

### 🔗 Multi-Provider Support
- OpenRouter (primary)
- Anthropic
- OpenAI
- Google Gemini
- Automatic failover with circuit breaker

### 💾 Smart Memory Management
- SHA256 checksum validation
- Session-based persistence
- Incremental context loading (~40% token efficiency)
- Analysis result caching

## Project Structure

```
BetterAgents/
├── src/              # Source TypeScript
├── dist/             # Compiled output
├── bin/              # CLI executables
├── template/         # User templates
├── docs/             # Documentation
└── package.json      # Dependencies
```

## Documentation

- [Installation & Setup](INSTALLATION.md)
- [API Reference](API.md)
- [Architecture](ARCHITECTURE.md)
- [Examples & Guides](EXAMPLES.md)

## Development

```bash
# Build TypeScript
npm run build

# Run tests
npm run test

# Watch mode
npm run build:watch
npm run test:watch

# Type checking
npm run lint
```

## Configuration

Create a `.pica-local.json` file in your project root:

```json
{
  "version": "1.0.0",
  "projectPath": "/path/to/project",
  "openrouterApiKey": "your-api-key",
  "settings": {
    "autoRefresh": 2000,
    "tokenBudget": 4000,
    "cacheDuration": 604800
  }
}
```

## Environment Variables

```bash
export OPENROUTER_API_KEY="your-api-key"
export PICA_VERBOSE="true"  # Optional: verbose logging
```

## License

MIT

## Contributing

Contributions welcome! Please see our contributing guidelines.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
