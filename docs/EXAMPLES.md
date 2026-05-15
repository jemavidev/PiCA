# PiCA Examples & Guides

## CLI Examples

### Initialize a Project

```bash
pica init
```

Creates `.pica/` structure and configuration files.

### Analyze Code

```bash
# Analyze a TypeScript file
pica analyze src/app.ts

# Analyze multiple files (analyze one at a time)
pica analyze src/utils.ts
pica analyze src/helpers.ts
```

Output includes:
- Quality issues identified
- Security vulnerabilities
- Performance bottlenecks
- Recommendations

### Generate Code

```bash
# Generate a function
pica generate "create a function to validate email addresses"

# Generate a class
pica generate "create a User class with methods for login and logout"

# Generate a module
pica generate "create an authentication middleware for Express"
```

### Validate Code Quality

```bash
# Validate a file
pica validate src/app.ts

# Check test coverage
pica validate src/utils.ts
```

### Check Status

```bash
pica status
```

Shows:
- Initialization status
- Active sessions
- Log files
- Configuration

---

## Programmatic API Examples

### Basic Initialization

```typescript
import { initializePiCA } from '@pica/agent';

const pica = await initializePiCA({
  projectPath: '/home/user/my-project',
  piPath: '.pica',
  apiKey: process.env.OPENROUTER_API_KEY,
  logLevel: 'info'
});

console.log('PiCA initialized');
console.log('AgentX ready:', pica.agentx);
console.log('Hooks ready:', pica.hookManager);
```

### Using Hooks

```typescript
// Register a hook handler
pica.hookManager.on('onAgentSelected', async (context) => {
  console.log('Agent selected:', context.eventData.agentId);
}, 10); // priority 10

pica.hookManager.on('onAnalysisComplete', async (context) => {
  console.log('Analysis done:', context.eventData.results);
}, 5);

pica.hookManager.on('onApprovalRequired', async (context) => {
  console.log('Approval needed for:', context.eventData.agentId);
  // Could trigger notification system
}, 15); // Higher priority = executes first
```

### Managing Approvals

```typescript
const approvalManager = pica.approvalManager;

// Check approval status
const status = await approvalManager.checkApproval(agent, context);
// Returns: 'approved' | 'rejected' | 'pending'

// Get pending requests
const pending = approvalManager.getPendingRequests();
pending.forEach(req => {
  console.log(`Request ${req.id}: ${req.proposedAction}`);
});

// Approve a request
if (pending.length > 0) {
  approvalManager.approveRequest(pending[0].id);
}

// Get statistics
const stats = approvalManager.getStats();
console.log(`Approved: ${stats.approvedCount}, Rejected: ${stats.rejectedCount}`);

// View history
const history = approvalManager.getApprovalHistory(10);
history.forEach(req => {
  console.log(`${req.status}: ${req.proposedAction}`);
});
```

### Working with Skills

```typescript
const skillRegistry = pica.skillRegistry;

// Register a custom skill
skillRegistry.registerSkill({
  id: 'custom-parser',
  name: 'Custom Parser Skill',
  description: 'Parse custom DSL files',
  category: 'analyzer',
  agents: ['critic', 'architect'],
  prompts: [
    {
      name: 'parse-dsl',
      content: 'Parse the following DSL and identify structure',
      parameters: {
        dsl: 'The DSL content to parse',
        language: 'DSL language name'
      }
    }
  ],
  examples: [],
  version: '1.0.0'
});

// Query skills
const coderSkills = skillRegistry.getSkillsByAgent('coder');
console.log(`Coder has ${coderSkills.length} skills`);

const analyzers = skillRegistry.getSkillsByCategory('analyzer');
console.log(`Available analyzers: ${analyzers.map(s => s.name).join(', ')}`);

// Search skills
const results = skillRegistry.search('parser');
console.log('Parser-related skills:', results);

// Get statistics
const stats = skillRegistry.getStats();
console.log(stats);
// {
//   totalSkills: 10,
//   skillsByCategory: { analyzer: 5, generator: 3, validator: 2 },
//   skillsByAgent: { coder: 7, critic: 5, architect: 8, tester: 4 }
// }
```

### Session Management

```typescript
const sessionManager = pica.sessionManager;

// Create a session
const sessionId = await sessionManager.createSession('/home/user/project');
console.log('Session created:', sessionId);

// Load metadata
const metadata = await sessionManager.loadSessionMetadata(sessionId);
console.log('Session state:', metadata.state);
console.log('Total tokens used:', metadata.totalTokens);
console.log('Total cost:', metadata.totalCost);

// Pause session
await sessionManager.pauseSession(sessionId);
console.log('Session paused');

// Resume session
await sessionManager.resumeSession(sessionId);
console.log('Session resumed');

// Complete session
await sessionManager.completeSession(sessionId);
console.log('Session completed');
```

### Using Orchestration

```typescript
const agentx = pica.agentx;

const result = await agentx.orchestrate({
  sessionId: 'test-session',
  userInput: 'Analyze this code for security issues',
  projectPath: '/home/user/project',
  context: {
    fileContent: `function login(user, pass) {
      if (user === 'admin' && pass === 'password') {
        return true;
      }
    }`,
    fileHash: 'abc123...'
  }
});

console.log('Intent detected:', result.intentDetected);
console.log('Agent selected:', result.selectedAgent.name);
console.log('Analysis complete');
console.log('Issues found:', result.agentResults[0].output);
console.log('Tokens used:', result.totalTokens);
console.log('Cost:', `$${result.totalCost.toFixed(4)}`);
console.log('Time:', `${result.executionTime}ms`);
```

---

## Custom Agent Example

Create `.pica/agents/security-expert.md`:

```markdown
# Security Expert Agent

## System Prompt

You are a Security Expert specializing in finding vulnerabilities in code.
Your role is to:
1. Identify security flaws
2. Assess severity (critical/high/medium/low)
3. Provide fixes
4. Suggest preventive measures

Provide output in JSON format:
{
  "vulnerabilities": [
    {
      "type": "SQL Injection",
      "location": "line 42",
      "severity": "critical",
      "fix": "Use parameterized queries"
    }
  ]
}

## Capabilities

- sql-injection-detection
- xss-detection
- auth-flaw-detection
- dependency-vulnerability-check
- code-injection-detection

## Skills

- vulnerability-analysis
- security-assessment
- fix-recommendation

## Approval Level

2 (Always require approval)
```

Then use it:

```typescript
const agent = await pica.agentLoader.loadCustomAgent('.pica/agents/security-expert.md');
console.log('Loaded:', agent.name);
```

---

## Custom Skill Example

Create `.pica/skills/performance-analyzer.json`:

```json
{
  "id": "performance-analyzer",
  "name": "Performance Analyzer",
  "description": "Analyzes code for performance issues",
  "category": "analyzer",
  "agents": ["critic"],
  "prompts": [
    {
      "name": "analyze-performance",
      "content": "Analyze the following code for performance issues. Look for: nested loops, inefficient algorithms, memory leaks, unnecessary computations.",
      "parameters": {
        "code": "The code to analyze",
        "language": "Programming language"
      }
    },
    {
      "name": "suggest-optimizations",
      "content": "Based on the code analysis, suggest specific performance optimizations with before/after examples.",
      "parameters": {
        "code": "The code to optimize",
        "issues": "List of identified issues"
      }
    }
  ],
  "examples": [
    {
      "input": "for (let i = 0; i < arr.length; i++) { arr.forEach(...) }",
      "output": "Nested iteration detected. Use flat iteration instead of nested forEach.",
      "explanation": "Shows detection of nested loops which is a common performance issue"
    }
  ],
  "version": "1.0.0"
}
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Code Analysis

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install Node
        uses: actions/setup-node@v2
        with:
          node-version: '20'
      
      - name: Install PiCA
        run: npm install @pica/agent
      
      - name: Initialize PiCA
        run: npx pica init
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
      
      - name: Analyze Code
        run: npx pica analyze src/main.ts
      
      - name: Validate Quality
        run: npx pica validate src/main.ts
```

---

## Error Handling Example

```typescript
try {
  const result = await pica.agentx.orchestrate({
    sessionId: 'test',
    userInput: 'analyze code',
    projectPath: '/path/to/project'
  });
} catch (error) {
  if (error.message.includes('API')) {
    console.error('Provider error (will retry with failover)');
  } else if (error.message.includes('Approval')) {
    console.error('Approval required');
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Monitoring & Logging

```typescript
// Get hook statistics
const hookStats = pica.hookManager.getStats();
console.log('Active hooks:', hookStats.totalHooks);
console.log('Hooks with handlers:', hookStats.hooksWithHandlers);

// Get approval statistics
const approvalStats = pica.approvalManager.getStats();
console.log('Pending approvals:', approvalStats.pendingRequests);
console.log('Approval rate:', 
  `${approvalStats.approvedCount}/${approvalStats.totalProcessed}`);

// Get skill statistics
const skillStats = pica.skillRegistry.getStats();
console.log('Total skills:', skillStats.totalSkills);
console.log('Skills by agent:', skillStats.skillsByAgent);
```

---

## Best Practices

1. **Always set API key** before initialization
2. **Use sessions** for multi-step workflows
3. **Register hooks** for monitoring and automation
4. **Handle approvals** appropriately for your use case
5. **Cache results** using the memory manager
6. **Use context** efficiently to save tokens
7. **Monitor costs** via result metrics
8. **Implement error handling** with provider fallback

