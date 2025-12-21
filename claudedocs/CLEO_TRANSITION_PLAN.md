# C.L.E.O. Transition & Multi-Agent Support Plan

**Goal:** Decouple `claude-todo` from Claude-specific branding, rebrand to **CLEO (Comprehensive Logistics & Execution Orchestrator)**, and introduce multi-agent support for Gemini, Kimi, and Codex.

**Target Version:** v1.0.0
**Current Status:** PAUSED (Completing v0.24.x pre-requisites on `main`)

---

## 0. Phase 0: Pre-Requisites (Main Branch)
**Objective:** Ensure the core system is stable and feature-complete before the rebranding refactor.

*   **Hierarchy System**: Ensure `maxSiblings` and `maxDepth` logic is solid (T328 series).
*   **Archive Enhancements**: Complete the smart archive system (T429 series).
*   **Analysis Engine**: Finish "Smart Analyze" (T542).
*   **Compliance**: Ensure "LLM-Agent-First" spec v3.0 compliance (T481 series).

---

## 1. Executive Summary

C.L.E.O. acts as the persistent memory and logistics layer for any CLI-based AI agent. The transition involves:
1.  **Rebranding**: `claude-todo` → `cleo`.
2.  **Generalization**: Abstracting `.claude/` directories to `.cleo/`.
3.  **Multi-Agent Ecosystem**: Native support for **concurrent** agents (Claude, Gemini, Kimi) interacting with the same project.
4.  **Sync R&D**: Research and design a universal `sync` command for each agent's native task API.

---

## 2. Architectural Changes

### A. Configuration Schema Expansion (`schemas/config.schema.json`)

We will add an `agents` section to support multiple active agents.

```json
"agents": {
  "type": "object",
  "properties": {
    "active": {
      "type": "array",
      "items": { "type": "string", "enum": ["claude", "gemini", "kimi"] },
      "default": ["claude"],
      "description": "List of active agents enabled for this project."
    },
    "configs": {
      "type": "object",
      "properties": {
        "claude": { "type": "object", "properties": { "docsFile": { "const": "CLAUDE.md" } } },
        "gemini": { "type": "object", "properties": { "docsFile": { "const": "AGENTS.md" } } }
      }
    }
  }
}
```

### B. Directory Structure & Naming

*   **Global Home**: `~/.claude-todo` → `~/.cleo`
*   **Project Directory**: `.claude/` → `.cleo/`
*   **Legacy Fallback**: A migration script will be provided. Post-migration, the system will look for `.cleo/` only, to maintain clean logic.

---

## 3. Implementation Steps

### Phase 1: Templating & Branding
1.  **Create `templates/AGENT-INJECTION.md`**: Generic CLEO instructions.
2.  **Create Agent-Specific Headers**:
    *   `templates/agents/GEMINI-HEADER.md`
    *   `templates/agents/KIMI-HEADER.md`

### Phase 2: Core Library Updates (Config & Logging)
*   Refactor `config.sh` and `logging.sh` to support `CLEO_*` env vars and remove hardcoded "claude" references.

### Phase 3: Initialization & Installation (`install.sh`, `init.sh`)

1.  **Update `scripts/install.sh`**:
    *   **Interactive Selection**: Prompt user to select agents to install support for.
2.  **Update `scripts/init.sh`**:
    *   **Loop Processing**: Iterate through enabled agents in the config (`agents.active`).
    *   **Gemini Logic**:
        *   Check/Create `.gemini/settings.json`.
        *   Update `contextFileName` to include `AGENTS.md`.
        *   Inject/Append instructions to `AGENTS.md`.
    *   **Claude Logic**:
        *   Inject/Append instructions to `CLAUDE.md`.

---

## 4. Sync System - Research & Design Phase

**Objective**: Create a universal `cleo sync` command that correctly uses the native todo system of the active agent.

### 4.A: Agent API Investigation (R&D Tasks)

*   **Gemini**:
    *   **Tool**: `write_todos`
    *   **Interface**: `todos: [{description: string, status: string}]`
    *   **Research**: Investigate API call parameters, limitations, and how to format the task list. Confirm if `cancelled` status is applicable or should be mapped to `done`.
*   **Kimi**:
    *   **Tool**: `SetTodoList`
    *   **Interface**: `todos: [{"content": string, "status": string}]`
    *   **Research**: Investigate the exact behavior. Does it replace or update? What are the valid `status` values?
*   **Claude**:
    *   **Tool**: TodoWrite (Internal Mechanism)
    *   **Interface**: `content`, `activeForm`, `status`.
    *   **Action**: Document the existing implementation as the "Claude Adapter".

### 4.B: Active Agent Detection

The system needs to know which agent is running to use the correct sync adapter.

**Proposed Solution**:
1.  The agent will start a session with an identity flag: `cleo session start --agent gemini`
2.  This command writes the active agent's identity to a state file: `.cleo/session.json`.
    ```json
    { "sessionId": "...", "startTime": "...", "activeAgent": "gemini" }
    ```
3.  When `cleo sync` is called, it reads `activeAgent` from `session.json` and loads the corresponding adapter (e.g., `lib/sync/gemini_adapter.sh`).

---

## 5. Verification Plan

*   **Mock Project**: `/mnt/projects/cleo-testing`
*   **Test Cases**:
    1.  **Multi-Agent Init**: Run `cleo init` with Claude + Gemini enabled. Verify `CLAUDE.md` and `AGENTS.md` are updated.
    2.  **Gemini Config**: Verify `.gemini/settings.json` is correctly patched using `jq`.
    3.  **Agent Detection**: Verify `cleo session start --agent gemini` correctly creates `.cleo/session.json` with the right `activeAgent`.

---

## 6. Q&A Clarifications

### Q1: How does `install.sh` work?
**Answer**: It will ask you once (globally): "Select the agents you use: [ ] Claude [ ] Gemini [ ] Kimi". This sets your global default. `cleo init` will use this default unless you provide override flags.

### Q2: What's the plan for `sync` now?
**Answer**: It's a **research phase**. We will investigate each agent's API to understand how to build a reliable adapter. The goal is a universal `cleo sync` command, but the implementation depends on the R&D outcome.