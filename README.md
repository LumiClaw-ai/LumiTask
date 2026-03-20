# LumiTask

Lightweight, self-hosted AI Agent task management platform.

LumiTask is an open-source task orchestration center for AI coding agents (Claude Code, OpenClaw, and more). Create, assign, execute, and monitor agent tasks with real-time streaming, dependency chains, and multi-agent support.

**Part of the [LumiClaw](https://lumiclaw.ai) ecosystem.**

## Features

- **Task lifecycle** — `open → assigned → running → done/failed/blocked`, with Kanban board view
- **Task dependencies** — Chain tasks with `dependsOn`, auto-execute when predecessors complete
- **Subtask decomposition** — Break complex tasks into sequential/parallel subtasks
- **Multi-agent** — Pluggable adapter architecture, built-in support for Claude Code and OpenClaw
- **Real-time streaming** — SSE-based live execution progress, tool calls, token usage
- **Structured I/O** — Pass structured `inputContext` between tasks, collect `outputResult`
- **Decision system** — Agents can request human decisions (confirm/choose/input/approve)
- **Notification channels** — Push to Feishu, Discord, Telegram via OpenClaw agent channels
- **Remote agents** — Connect to OpenClaw Gateway on remote servers via connection code
- **Scheduled & recurring** — One-time, cron-based, and immediate task execution
- **Cost tracking** — Automatic token counting and cost calculation per task
- **CLI tool** — Full task management from terminal
- **Desktop app** — Electron app with system tray (macOS)

## Quick Start

```bash
git clone https://github.com/LumiClaw-ai/LumiTask.git
cd LumiTask
pnpm install
pnpm dev

# Open http://localhost:3179
```

## CLI

```bash
# Create a task
pnpm cli:dev create --title "Refactor auth module" --description "Migrate to new middleware"

# Create with agent assignment
pnpm cli:dev create --title "Fix login bug" --assign "claude-code"

# Create with immediate execution
pnpm cli:dev create --title "Run tests" --schedule immediate

# List tasks
pnpm cli:dev list

# Show task details
pnpm cli:dev show <task-id>

# Start a task
pnpm cli:dev start <task-id>

# Complete / fail / block / reopen
pnpm cli:dev complete <task-id>
pnpm cli:dev fail <task-id> --reason "Build failed"
pnpm cli:dev block <task-id> --reason "Need API key"
pnpm cli:dev reopen <task-id>

# Add log entry
pnpm cli:dev log <task-id> --message "Progress update"

# Manage agents
pnpm cli:dev agent list
pnpm cli:dev agent detect
```

## REST API

LumiTask exposes a full REST API at `http://localhost:3179/api`.

### Tasks

```bash
# Create task
curl -X POST http://localhost:3179/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "My task", "description": "Details here"}'

# Create task with dependencies
curl -X POST http://localhost:3179/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy",
    "dependsOn": ["task-id-1", "task-id-2"],
    "inputContext": {"env": "production"}
  }'

# Create subtasks
curl -X POST http://localhost:3179/api/tasks/{id}/subtasks \
  -H "Content-Type: application/json" \
  -d '[
    {"title": "Step 1", "sequential": true},
    {"title": "Step 2", "sequential": true},
    {"title": "Step 3", "sequential": true}
  ]'

# List tasks
curl http://localhost:3179/api/tasks
curl http://localhost:3179/api/tasks?status=running
curl http://localhost:3179/api/tasks?parentTaskId={id}

# Get task detail (includes dependencies, subtasks, logs)
curl http://localhost:3179/api/tasks/{id}

# Update task
curl -X PATCH http://localhost:3179/api/tasks/{id} \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated title"}'

# Execute task
curl -X POST http://localhost:3179/api/tasks/{id}/execute

# Block with structured decision
curl -X POST http://localhost:3179/api/tasks/{id}/block \
  -H "Content-Type: application/json" \
  -d '{
    "decision": {
      "type": "choose",
      "question": "Which database?",
      "options": [
        {"id": "pg", "label": "PostgreSQL"},
        {"id": "mysql", "label": "MySQL"}
      ]
    }
  }'

# Reply to blocked task
curl -X POST http://localhost:3179/api/tasks/{id}/reply \
  -H "Content-Type: application/json" \
  -d '{"body": "Use PostgreSQL"}'

# Delete task
curl -X DELETE http://localhost:3179/api/tasks/{id}
```

### Agents

```bash
curl http://localhost:3179/api/agents              # List agents
curl -X POST http://localhost:3179/api/agents/detect  # Auto-detect agents
```

### Events (SSE)

```bash
curl http://localhost:3179/api/events   # Server-sent events stream
```

## OpenClaw Integration

See [docs/openclaw-guide.md](docs/openclaw-guide.md) for how to connect your OpenClaw agents to LumiTask.

## Desktop App (Electron)

```bash
pnpm add -D electron electron-builder @electron/rebuild
pnpm electron:dev
```

Build distributable:
```bash
pnpm electron:build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 + React 19 + Tailwind CSS v4 + Radix UI |
| Backend | Next.js API Routes + SSE |
| Database | SQLite + Drizzle ORM |
| State | TanStack React Query v5 |
| CLI | Commander.js |
| Desktop | Electron 41 |
| Testing | Vitest |

## Project Structure

```
src/
├── app/                    # Pages and API routes
│   ├── api/tasks/          # Task CRUD, execute, block, reply, subtasks
│   ├── api/agents/         # Agent detection and management
│   ├── api/cron/           # OpenClaw cron job sync
│   ├── api/notifications/  # Channel discovery and test
│   └── api/events/         # SSE stream
├── lib/
│   ├── agents/             # Adapters, executor, scheduler, concurrency
│   ├── notifications/      # Notification manager + OpenClaw channel sender
│   ├── openclaw-client/    # Local/Remote OpenClaw client abstraction
│   └── db/                 # SQLite schema
├── components/             # UI (kanban, task drawer, decision card)
└── instrumentation.ts      # Port discovery file writer

cli/                        # CLI tool
electron/                   # Desktop app (main, preload, server)
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Port | `3179` | Web server port |
| `LUMITASK_API_URL` | `http://127.0.0.1:3179/api` | Override API URL for CLI |
| `LUMITASK_URL` | `http://localhost:3179` | Base URL for notification links |
| `PORT` | `3179` | Override server port |

Port is auto-discovered: the server writes `~/.lumitask/port` on startup, CLI reads it automatically.

## License

MIT
