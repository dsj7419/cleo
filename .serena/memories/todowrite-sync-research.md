# TodoWrite ↔ claude-todo Bidirectional Sync Research

**Task**: T227 | **Date**: 2025-12-15 | **Status**: Complete

## Executive Summary

Research completed for seamless integration between durable claude-todo persistence and ephemeral TodoWrite session tracking. The design accepts **intentionally lossy transformation** since full metadata lives in claude-todo.

## Key Findings

### 1. Schema Mismatch (T228)
- TodoWrite: 3 fields (content, status, activeForm)
- claude-todo: 10+ fields (id, title, description, status, priority, labels, phase, deps, notes, timestamps)
- **Only ID and status are round-trippable**

### 2. Injection Mechanism (T229)
- **Tiered selection**: Focused task + deps + same-phase high-priority (max 8)
- **Trigger**: SessionStart hook → `ct sync --inject-todowrite`
- **Format**: `[T227] [!] Task title` (ID prefix, optional priority marker)

### 3. Extraction Strategy (T230)
- Parse `[T###]` prefix to recover task IDs
- Diff detection: completed, progressed, new_tasks, removed, unchanged
- Session state file tracks injected tasks for comparison

### 4. Lossy Transformation (T231)
```
Preserved:  id (via prefix), status
Lost:       description, priority*, labels, phase, deps, notes, timestamps
* priority optionally encoded as [!] prefix
```

### 5. Conflict Resolution (T232)
- claude-todo authoritative for existence/metadata
- TodoWrite authoritative for session progress
- Warn-don't-fail strategy with conflict logging

### 6. Hook Architecture (T233)
- **Critical insight**: Hooks cannot call TodoWrite directly
- Hybrid approach: command hooks prepare data, prompt hooks instruct Claude
- SessionStart: prepare → prompt → TodoWrite call
- SessionEnd: prompt → Claude outputs state → command merges

## Implementation Roadmap

### Phase 1: Core Scripts
```
scripts/sync-todowrite.sh       # Orchestrator
scripts/inject-todowrite.sh     # Prepare injection JSON
scripts/extract-todowrite.sh    # Parse and merge
```

### Phase 2: Hook Integration
```
.claude/hooks/todowrite-session-start.md  # Prompt hook
.claude/hooks/todowrite-session-end.md    # Prompt hook
```

### Phase 3: CLI Commands
```bash
ct sync --inject-todowrite      # Prepare injection
ct sync --extract-todowrite     # Merge from TodoWrite
ct sync --status                # Show sync state
```

## Data Flow

```
SESSION START
─────────────
claude-todo → inject-todowrite.sh → todowrite-inject.json
                                          ↓
                              prompt-hook reads file
                                          ↓
                              Claude calls TodoWrite

DURING SESSION
─────────────
Claude uses TodoWrite normally (ephemeral tracking)

SESSION END
─────────────
prompt-hook → Claude outputs TodoWrite state → todowrite-state.json
                                                      ↓
                                          extract-todowrite.sh
                                                      ↓
                                          claude-todo (merge)
```

## Open Questions for Implementation

1. **State persistence**: Where to store todowrite-inject.json? (.claude/sync/ directory?)
2. **Multi-session**: Handle overlapping/interrupted sessions?
3. **User override**: Allow manual sync trigger vs automatic only?
4. **Verbose mode**: Show sync details to user or silent?

## Version Target

Planned for **v0.14.0** based on labels.
