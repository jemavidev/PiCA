# Installation & Setup Guide

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- OpenRouter API key (or alternative LLM provider key)

## Installation Steps

### 1. Install PiCA

```bash
npm install @pica/agent
```

### 2. Set API Key

Get your API key from [OpenRouter](https://openrouter.ai) and set it:

```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

Or add to `.env`:

```
OPENROUTER_API_KEY=your-api-key-here
```

### 3. Initialize Your Project

```bash
cd your-project
pica init
```

This creates:

```
your-project/
├── .pica/
│   ├── agents/          # Custom agent definitions
│   ├── skills/          # Extended capabilities
│   ├── config/
│   │   ├── pi.config.json
│   │   ├── memory-schema.json
│   │   └── session-schema.json
│   ├── logs/            # Execution logs
│   ├── memory/
│   │   ├── session/     # Session data
│   │   ├── cache/       # Analysis cache
│   │   └── meta/        # Metadata
│   ├── hooks/           # Custom hooks
│   └── .gitkeep
└── .pica-local.json     # Local configuration
```

### 4. Verify Installation

```bash
pica status
```

You should see:
```
📊 PiCA Status

✅ PiCA is initialized
📁 Project: /path/to/your/project
⚙️  Config version: 1.0.0

📚 Resources:
  Dashboard: .pica/dashboard.html
  Config: .pica-local.json
```

## Configuration

### `.pica-local.json`

```json
{
  "version": "1.0.0",
  "projectPath": "/path/to/project",
  "openrouterApiKey": "sk-...",
  "settings": {
    "autoRefresh": 2000,
    "tokenBudget": 4000,
    "cacheDuration": 604800,
    "logRetention": 30
  },
  "customization": {
    "dashboardPort": null,
    "customAgents": [],
    "customSkills": []
  }
}
```

### `.pica/config/pi.config.json`

```json
{
  "version": "1.0.0",
  "providers": {
    "primary": "openrouter",
    "openrouter": {
      "baseUrl": "https://openrouter.ai/api/v1",
      "models": {
        "orchestrator": "openrouter/openai/gpt-4-turbo",
        "analysis": "openrouter/deepseek/deepseek-chat",
        "generation": "openrouter/deepseek/deepseek-chat",
        "validation": "openrouter/google/gemini-2.0-flash"
      },
      "rateLimit": 100
    }
  },
  "memory": {
    "maxSessionSize": "100MB",
    "keepVersions": 3,
    "compressionEnabled": false
  },
  "logging": {
    "level": "info",
    "formats": ["jsonl", "text"]
  }
}
```

## Custom Agents

Add custom agents to `.pica/agents/`:

```markdown
# My Custom Agent

## System Prompt

Your specialized instructions here...

## Capabilities

- capability-1
- capability-2

## Skills

- skill-1
- skill-2
```

## Custom Skills

Add custom skills to `.pica/skills/`:

```json
{
  "id": "my-skill",
  "name": "My Skill",
  "description": "What this skill does",
  "category": "analyzer",
  "agents": ["critic", "architect"],
  "prompts": [
    {
      "name": "analyze",
      "content": "Prompt content here",
      "parameters": {
        "input": "Parameter description"
      }
    }
  ],
  "examples": [],
  "version": "1.0.0"
}
```

## Troubleshooting

### API Key Not Found

```bash
# Check if variable is set
echo $OPENROUTER_API_KEY

# If empty, set it
export OPENROUTER_API_KEY="your-key"
```

### Permission Denied

If you get permission errors:

```bash
# Make CLI executable
chmod +x node_modules/@pica/agent/bin/cli.js
```

### Build Issues

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

## Next Steps

1. Read the [API Reference](API.md)
2. Check out [Examples](EXAMPLES.md)
3. Learn about [Architecture](ARCHITECTURE.md)

## Support

For issues or questions:
- Check existing documentation
- Review example projects
- Open an issue on GitHub
