# TASK-DECOMPOSITION-SPEC Implementation Report

**Spec Version**: 1.0.0
**Report Created**: 2025-12-19
**Target Release**: v0.22.0+

---

## Executive Summary

The TASK-DECOMPOSITION-SPEC defines a 4-phase LLM-agent-first decomposition system for transforming high-level user requests into atomic, executable tasks with validated DAG dependencies.

**Status**: DRAFT (ready for implementation planning)

---

## Implementation Tasks

### Phase 1: Core Infrastructure

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-001 | Create `lib/decomposition.sh` library | critical | medium | - | Part 10 |
| TD-002 | Create `lib/llm-invoke.sh` library | critical | medium | - | Part 18 |
| TD-003 | Create `lib/computed-fields.sh` library | high | small | - | Part 23 |
| TD-004 | Create `scripts/decompose.sh` command | critical | large | TD-001, TD-002 | Part 9 |
| TD-005 | Add exit codes to `lib/exit-codes.sh` | high | small | - | Part 9.3 |

### Phase 2: Decomposition Pipeline

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-010 | Implement `analyze_scope()` function | critical | medium | TD-001 | Part 5 |
| TD-011 | Implement `decompose_goals()` function | critical | large | TD-001, TD-002 | Part 6 |
| TD-012 | Implement `build_dependency_graph()` function | critical | medium | TD-001 | Part 7 |
| TD-013 | Implement `specify_tasks()` function | critical | medium | TD-001 | Part 8 |
| TD-014 | Implement atomicity scoring | high | medium | TD-011 | Part 4 |

### Phase 3: Challenge System

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-020 | Implement `challenge_decomposition()` function | high | medium | TD-002 | Part 11.2 |
| TD-021 | Implement rubber-stamp detection | high | small | TD-020 | Part 21.3 |
| TD-022 | Implement challenge quality scoring | medium | small | TD-020 | Part 21.2 |
| TD-023 | Implement challenge-revision loop | high | medium | TD-020 | Part 22.3 |

### Phase 4: Dependency Detection

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-030 | Implement explicit dependency detection | critical | small | TD-012 | Part 19.1 |
| TD-031 | Implement data flow dependency detection | high | medium | TD-012 | Part 19.1 |
| TD-032 | Implement file conflict detection | high | small | TD-012 | Part 19.1 |
| TD-033 | Implement semantic dependency detection | medium | medium | TD-012 | Part 19.1 |
| TD-034 | Implement transitive closure optimization | medium | medium | TD-012 | Part 19.3 |

### Phase 5: HITL Integration

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-040 | Implement HITL gate output format | high | small | TD-010 | Part 12 |
| TD-041 | Integrate HITL with AskUserQuestion pattern | high | medium | TD-040 | Part 12 |
| TD-042 | Add `--hitl-response` flag to decompose | medium | small | TD-041 | Part 9.2 |

### Phase 6: Schema Extensions

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-050 | Add `decompositionId` field to schema | medium | small | - | Part 23.1 |
| TD-051 | Add `atomicityScore` field to schema | medium | small | - | Part 23.1 |
| TD-052 | Add `acceptance` array field to schema | medium | small | - | Part 23.1 |
| TD-053 | Implement computed `children` field | medium | small | TD-003 | Part 23.2 |
| TD-054 | Implement computed `blockedBy` field | medium | small | TD-003 | Part 23.2 |
| TD-055 | Create schema migration v2.3.0 → v2.4.0 | medium | medium | TD-050-052 | Part 23.4 |

### Phase 7: Testing

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-060 | Add unit tests for decomposition | high | medium | TD-010-013 | Part 13.1 |
| TD-061 | Add integration tests for decompose command | high | medium | TD-004 | Part 13.2 |
| TD-062 | Add challenge system tests | medium | small | TD-020-023 | Part 13.3 |
| TD-063 | Add performance benchmarks | low | small | TD-004 | Part 14 |

### Phase 8: Documentation

| ID | Task | Priority | Size | Dependencies | Spec Part |
|----|------|----------|------|--------------|-----------|
| TD-070 | Add decompose to QUICK-REFERENCE.md | medium | small | TD-004 | - |
| TD-071 | Add decompose to TODO_Task_Management.md | medium | small | TD-004 | - |
| TD-072 | Create decomposition user guide | low | medium | TD-004 | - |

---

## Schema Changes Required

### New Fields (v2.4.0)

```json
{
  "decompositionId": "string (pattern: DEC-YYYYMMDD-NNN)",
  "atomicityScore": "integer (0-100)",
  "acceptance": "array of strings"
}
```

### Computed Fields (not stored)

```
children, ancestors, depth, dependents, blockedBy
```

---

## New Exit Codes Required

| Code | Constant | Usage |
|------|----------|-------|
| 30 | `EXIT_HITL_REQUIRED` | Decomposition blocked by ambiguity |
| 31 | `EXIT_CHALLENGE_REJECTED` | Challenge agent rejected decomposition |

---

## New Error Codes Required

| Code | Exit | Description |
|------|------|-------------|
| `E_DECOMPOSE_EMPTY_INPUT` | 2 | No request provided |
| `E_DECOMPOSE_AMBIGUOUS` | 30 | Request has unresolved ambiguities |
| `E_DECOMPOSE_CYCLE` | 14 | Generated DAG has cycles |
| `E_DECOMPOSE_REJECTED` | 31 | Challenge agent rejected |
| `E_DECOMPOSE_DEPTH` | 11 | Exceeded depth limit |
| `E_DECOMPOSE_SIBLINGS` | 12 | Exceeded sibling limit |

---

## Dependencies on Other Specs

| Spec | Required Version | Purpose |
|------|------------------|---------|
| HIERARCHY-ENHANCEMENT-SPEC | v1.0.0+ | type, parentId, size, depth/sibling limits |
| LLM-AGENT-FIRST-SPEC | v1.0.0+ | JSON output, exit codes, error handling |
| CONSENSUS-FRAMEWORK-SPEC | v2.0.0+ | Challenge protocol, evidence standards |
| LLM-TASK-ID-SYSTEM-DESIGN-SPEC | v1.0.0+ | Task ID format |

---

## Implementation Notes

### LLM Invocation Strategy

Per Part 18, the system uses tiered model selection:
- **Haiku**: Scope analysis, DAG construction, task specification
- **Sonnet**: Goal decomposition (complex), all challenge phases

### Challenge System Design

Per Part 21, challenge outputs must:
- Produce minimum 2 findings
- Reference specific tasks/edges
- Include actionable suggestions
- Pass rubber-stamp detection

### Retry Behavior

Per Part 22:
- Max 3 retries per phase
- Max 10 total retries
- Exponential backoff (1s base, 30s max)
- Circuit breaker after 5 consecutive failures

---

## Open Questions

1. **LLM API Integration**: Which provider/SDK to use for Haiku/Sonnet calls?
2. **Prompt Storage**: Where to store prompt templates (lib/prompts/, templates/)?
3. **Caching**: Should decomposition results be cached for similar requests?
4. **Parallel Execution**: How to integrate with existing parallel task runners?

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| LLM API rate limits | Medium | High | Implement backoff, queue system |
| Hallucinated dependencies | High | Medium | Anti-hallucination validation (Part 19.4) |
| Challenge rubber-stamping | Medium | Medium | Rubber-stamp detection (Part 21.3) |
| Schema migration issues | Low | High | Backward compatibility requirements |

---

## Changelog

### 2025-12-19 - Initial Report
- Created implementation report tracking 38 tasks across 8 phases
- Identified schema changes, exit codes, error codes required
- Documented dependencies on other specs
- Listed open questions and risks

---

*End of Implementation Report*
