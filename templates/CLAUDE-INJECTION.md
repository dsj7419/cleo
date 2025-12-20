<!-- CLAUDE-TODO:START v0.23.2 -->
## Task Management (claude-todo)

Use `ct` (alias for `claude-todo`) for all task operations. Full docs: `~/.claude-todo/docs/TODO_Task_Management.md`

### Essential Commands
```bash
ct list                    # View tasks (JSON when piped)
ct find "query"            # Fuzzy search (99% less context than list)
ct show <id>               # View single task details (use this first!)
ct add "Task"              # Create task
ct update <id> [OPTIONS]   # Update task fields
ct done <id>               # Complete task
ct focus set <id>          # Set active task
ct focus show              # Show current focus
ct session start|end       # Session lifecycle
ct exists <id>             # Verify task exists
ct dash                    # Project overview
ct analyze                 # Task triage (JSON default)
ct analyze --auto-focus    # Auto-set focus to top task
ct commands                # List all commands (JSON)
ct commands -r critical    # Critical commands for agents
```

### Update Options
```bash
ct update <id> --priority high       # Change priority
ct update <id> --status blocked      # Change status
ct update <id> --labels bug,urgent   # Append labels
ct update <id> --notes "Progress"    # Add timestamped note
ct update <id> --depends T001,T002   # Add dependencies
```

### Research (v0.23.0+)
```bash
ct research "query"                  # Multi-source web research
ct research --library svelte -t X    # Library docs via Context7
ct research --reddit "topic" -s sub  # Reddit discussions via Tavily
ct research --url URL [URL...]       # Extract from specific URLs
ct research -d deep                  # Deep research (15-25 sources)
ct research --link-task T001         # Link research to task
```
Output: `.claude/research/research_[id].json` + `.md` with citations

### Phase Tracking
```bash
ct phases                  # List phases with progress
ct phase set <slug>        # Set current project phase
ct phase show              # Show current phase
ct list --phase core       # Filter tasks by phase
```

### LLM-Agent-First Design
- **JSON auto-detection**: Piped output → JSON (no `--format` needed)
- **Native filters**: Use `--status`, `--label`, `--phase` instead of jq
- **Context-efficient**: Prefer `find` over `list`, `show` over complex queries
- **Command discovery**: `ct commands -r critical` (no jq needed)

### Data Integrity
- **CLI only** - Never edit `.claude/*.json` directly
- **Verify state** - Use `ct show <id>` or `ct list` before assuming
- **Session discipline** - Start/end sessions properly
<!-- CLAUDE-TODO:END -->
