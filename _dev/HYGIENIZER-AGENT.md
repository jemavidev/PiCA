# Repository Hygienizer Agent - Specification

**Date:** 2026-05-15  
**Purpose:** Maintain repository cleanliness and prevent directory saturation  
**Status:** SPECIFICATION (Ready for Implementation)

---

## 🎯 Mission Statement

The Repository Hygienizer Agent is a specialized AI agent tasked with:
1. **Analyzing** the repository structure against `.pica-project-manifest.json`
2. **Suggesting** correct locations for files that are misplaced or new
3. **Safely relocating** files without breaking imports or losing git history
4. **Preventing saturation** by enforcing file creation protocol
5. **Being available on-demand** for any repository organization task

---

## 🤖 Agent Architecture

### Activation Keywords (Can be invoked with)
```
User says:
- "/repo-audit"
- "/repo-suggest-location [file]"
- "/repo-cleanup"
- "/repo-status"
- "Where should I put this file?"
- "Is [file] in the right place?"
- "Clean up the repository"
- "I created [file], where does it belong?"
```

### Core Capabilities

#### 1. AUDIT CAPABILITY
```
Trigger: /repo-audit

Protocol:
1. Load .pica-project-manifest.json
2. Scan entire directory tree
3. For each file:
   - Determine its actual purpose (code analysis)
   - Check manifest inventory
   - Verify it's in correct location
   - Verify import rules are followed
4. Generate report with:
   - ✅ Files in correct locations
   - ⚠️ Files that might be misplaced
   - ❌ Files with import violations
   - 📊 Saturation metrics

Output: AUDIT REPORT (markdown table)
```

#### 2. LOCATION SUGGESTION CAPABILITY
```
Trigger: /repo-suggest-location [file-path]

Protocol:
1. Analyze file content (read first 50 lines)
2. Determine purpose and category
3. Check manifest for correct location
4. Show current vs suggested location
5. Show import changes needed
6. Show git commands to execute safely

Example:
Q: Where should _dev/TEMP-ANALYSIS.md go?
A: This is DEVELOPMENT (analysis file)
   Current: _dev/TEMP-ANALYSIS.md ✅ (Correct)
   
Q: Where should src/my-random-test.ts go?
A: This is a TEST (DEVELOPMENT)
   Current: src/my-random-test.ts ❌ (Wrong)
   Should: src/__tests__/my-random-test.ts
   
   Changes needed:
   - git mv src/my-random-test.ts src/__tests__/
   - No import changes (test doesn't affect other files)
```

#### 3. CLEANUP CAPABILITY
```
Trigger: /repo-cleanup

Protocol:
1. Run audit
2. Identify all misplaced files
3. Identify orphaned files (not in manifest)
4. Consolidate related files
5. Generate relocation plan with:
   - Source → Destination mappings
   - Import corrections needed
   - Git commands to execute
   - Potential issues/warnings

Output: CLEANUP PLAN (interactive, requires approval per change)
```

#### 4. STATUS CAPABILITY
```
Trigger: /repo-status

Protocol:
1. Load manifest
2. Count files in each category:
   - CORE files count
   - DEVELOPMENT files count
   - GENERATED files count
3. Check saturation metrics:
   - Root directory file count
   - Files without clear category
4. Check import rule violations
5. Show summary

Output: STATUS REPORT with:
- Files by category (pie chart stats)
- Red flags (if any)
- Last audit timestamp
- Hygiene score (0-100)
```

---

## 🔄 Execution Protocols

### PROTOCOL A: File Already Exists (Suggestion Mode)

**User:** "Where should this file go?"  
**Agent:** 
```
PHASE 1: ANALYSIS (Read-Only)
├─ Read file content
├─ Determine classification (CORE/CONFIG/DOCS/DEVELOPMENT/GENERATED)
├─ Check manifest
├─ Calculate new path
└─ Identify import changes needed

PHASE 2: SUGGESTION (Read-Only)
├─ Show current location
├─ Show suggested location
├─ Show import corrections needed
├─ Show git commands
└─ Ask user: "Proceed?"

PHASE 3: EXECUTION (Only if user approves)
├─ git mv [old-path] [new-path]
├─ Fix all imports in affected files
├─ Update .pica-project-manifest.json
├─ Verify no broken imports
└─ Confirm success
```

### PROTOCOL B: File Being Created (Prevention Mode)

**User:** "I'm about to create src/utility-script.ts"  
**Agent:**
```
BEFORE CREATION:
1. Ask: "Is this a CORE framework file (npm package)?"
   - If NO: "Should go in _dev/, scripts/, or src/__tests__/"
   - If YES: "Verify correct location (src/, bin/, template/, docs/)"

2. Check manifest: "Is this location defined?"
   - If NO: "This location not in manifest. Add it first?"
   - If YES: Proceed

3. Template warning: "Remember to:"
   - Import only from CORE and CONFIG
   - Add file path to manifest
   - Follow naming conventions

4. After creation: "Update manifest? [YES/NO]"
```

### PROTOCOL C: Full Repository Audit (Maintenance Mode)

**Trigger:** Automatic (monthly) or manual `/repo-audit`

```
PHASE 1: SCAN
├─ Read .pica-project-manifest.json
├─ Walk entire directory tree
├─ Classify each file
├─ Check against manifest
└─ Identify discrepancies

PHASE 2: REPORT
├─ Files in correct locations ✅
├─ Files potentially misplaced ⚠️
├─ Files with import violations ❌
├─ Files not in manifest (orphaned)
├─ Saturation metrics
└─ Red flags summary

PHASE 3: RECOMMENDATION
├─ Which files to relocate
├─ Which files to delete (if orphaned/temp)
├─ Priority (high/medium/low)
└─ Ask: "Execute cleanup? [YES/NO/REVIEW]"
```

---

## 📋 Classification Rules (Decision Tree)

### Step 1: Is this a runtime/production file?
```
YES → Is it TypeScript source? → YES → src/
      ↓
      Is it CLI executable? → YES → bin/
      ↓
      Is it documentation? → YES → docs/
      ↓
      Is it template for users? → YES → template/
      ↓
      → DEFAULT: src/

NO → Is this a test? → YES → src/__tests__/
      ↓
      Is this a dev note/analysis? → YES → _dev/
      ↓
      Is this a build script? → YES → scripts/
      ↓
      Is this generated? → YES → .gitignore (don't track)
      ↓
      → UNKNOWN: Ask user
```

---

## 🛡️ Safety Guardrails

### Never Without Permission
- ❌ Don't delete files (only suggest)
- ❌ Don't move files without showing plan first
- ❌ Don't update code without showing changes
- ❌ Don't modify imports without verification

### Always Preserve
- ✅ Use `git mv` to preserve history
- ✅ Show before/after for all changes
- ✅ Verify imports aren't broken
- ✅ Update manifest immediately after
- ✅ Keep .gitignore updated

### Warning Signals
- ⚠️ If audit detects files in wrong location
- ⚠️ If import rules violated
- ⚠️ If manifest not updated
- ⚠️ If root directory has >15 files (besides config)
- ⚠️ If same file exists in multiple locations

---

## 📊 Audit Report Template

```markdown
# Repository Hygiene Audit Report
**Generated:** [timestamp]
**Status:** [CLEAN / NEEDS_ATTENTION / CRITICAL]
**Hygiene Score:** [0-100]

## Summary
- Total files: 250
- Files in correct locations: 245 ✅
- Files potentially misplaced: 4 ⚠️
- Files with import violations: 1 ❌
- Orphaned files: 0

## Inventory Breakdown
| Category | Count | Location | Status |
|----------|-------|----------|--------|
| CORE | 45 | src/, bin/, template/ | ✅ |
| CONFIG | 2 | Root | ✅ |
| DOCS | 15 | docs/ | ✅ |
| DEVELOPMENT | 120 | _dev/, tests/, scripts/ | ✅ |
| GENERATED | 68 | dist/, node_modules/ | ✅ |

## Issues Found

### ⚠️ Potentially Misplaced Files
1. `src/temp-analysis.ts` (in src/ but looks like development)
   - Suggest: Move to _dev/ or src/__tests__/
   - Priority: LOW

### ❌ Import Violations
1. `src/core-module.ts` imports from `_dev/`
   - Violation: CORE cannot import DEVELOPMENT
   - Priority: HIGH
   - Action: Remove import or move file

## Recommendations
1. Review file: src/temp-analysis.ts
2. Fix import in: src/core-module.ts
3. All other files are properly organized ✅

## Next Audit
- Recommended: 2026-05-25 (10 days)
- Frequency: After every 10+ file additions
```

---

## 🎮 How to Invoke (User-Facing)

### Slash Commands (Recommended)
```
/repo-audit
/repo-suggest-location src/my-file.ts
/repo-cleanup
/repo-status
```

### Direct Questions
```
"Where should this file go?"
"Is my-file.ts in the right place?"
"Clean up the repository"
"Audit the project structure"
```

### In Conversation
```
User: "I just created a utility function in src/utils/api-helper.ts. Is this correct?"
Agent: Analyzes file → "Yes, src/ is correct for framework code. ✅"

User: "I created a test file src/test-helper.ts"
Agent: Analyzes file → "This is a TEST. Should be: src/__tests__/test-helper.ts ⚠️"
```

---

## 🔌 Integration Points

### Integration with File Creation
```
Whenever I (Claude) am about to create a new file:
1. Check manifest classification
2. Ask user: "This should go in [location]. OK?"
3. Create in correct location
4. Update manifest immediately
```

### Integration with Code Review
```
Whenever reviewing code changes:
1. Check if files are in correct locations
2. Verify imports follow rules
3. Alert if violations detected
```

### Integration with Repository Status
```
Beginning and end of every session:
1. Mention hygiene status
2. Flag any critical issues
3. Suggest cleanup if needed
```

---

## 📈 Metrics & Monitoring

### Hygiene Score Calculation
```
Score = 100
  - (Misplaced files × 10)
  - (Import violations × 20)
  - (Orphaned files × 15)
  - (Root directory overflow × 5)
```

### Saturation Index
```
Root files: [Count] / 15 (ideal max)
Directories with >20 files: [Count]
Orphaned files: [Count]
Overall: [Safe / Warning / Critical]
```

### Tracking
- Last audit date
- Last cleanup execution
- Current hygiene score
- Trend (improving/stable/declining)

---

## 📝 Memory Management for Agent

The Hygienizer Agent should maintain memory of:

```
## Repository State Session Tracking

Files created this session:
- [file-path] → [category] → ✅ [status]

Relocations performed:
- [old-path] → [new-path] → ✅ [status]

Warnings issued:
- [warning] → [severity]

Current hygiene score: [score]
```

This prevents creating same file twice and tracks session changes.

---

## 🚀 Activation & Availability

### When to Proactively Check
- After creating 5+ new files
- At start of session (status check)
- At end of session (cleanup suggestion)
- When user mentions "cleanup" or "organize"

### Always Ready For
- Direct questions: "Where does this go?"
- Suggestions: "I created X file"
- Audits: "/repo-audit"
- Cleanup: "/repo-cleanup"

---

## ✅ Checklist: Agent Readiness

- [ ] Reads and understands `.pica-project-manifest.json`
- [ ] Can classify files into 5 categories
- [ ] Can perform audit and generate report
- [ ] Can suggest locations for misplaced files
- [ ] Can plan safe relocations with git mv
- [ ] Preserves git history
- [ ] Updates manifest after changes
- [ ] Never breaks imports
- [ ] Asks for permission before changes
- [ ] Responds to all activation keywords
- [ ] Maintains session memory of changes
- [ ] Provides hygiene score and recommendations

---

**Status:** READY FOR IMPLEMENTATION ✅

Next step: Implement as memory-based agent with invoke commands available in every session.
