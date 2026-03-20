# OpenClaw + LumiTask Integration Guide

This guide shows how to connect your OpenClaw agents to LumiTask for task management.

## Overview

```
You (Feishu/Telegram/Discord)
  ↓ "帮我创建一个任务"
OpenClaw Agent
  ↓ calls LumiTask API
LumiTask (http://localhost:3179)
  ↓ assigns & executes
Agent runs the task → results back to LumiTask
  ↓ notifies
You (via Feishu/Telegram/Discord)
```

## Step 1: Start LumiTask

```bash
git clone https://github.com/LumiClaw-ai/LumiTask.git
cd LumiTask
pnpm install
pnpm dev
```

LumiTask runs at `http://localhost:3179`.

## Step 2: Give Your Agent the LumiTask Skill

Create a global skill file that teaches your OpenClaw agent how to use LumiTask:

```bash
mkdir -p ~/.openclaw/skills/lumitask
```

Create `~/.openclaw/skills/lumitask/SKILL.md`:

```markdown
---
name: lumitask
description: LumiTask 任务管理 — 创建、查询、更新、执行任务
---

# LumiTask API

LumiTask 是你的任务管理中心，运行在 http://localhost:3179。
你可以通过 REST API 管理任务。

## 创建任务

```bash
curl -X POST http://localhost:3179/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "任务标题",
    "description": "任务描述",
    "scheduleType": "manual"
  }'
```

参数：
- `title` (必填) — 任务标题
- `description` — 任务描述
- `assigneeAgentId` — 指定执行的 Agent ID
- `scheduleType` — `manual`(默认) | `immediate`(立即执行) | `scheduled` | `recurring`
- `dependsOn` — 前置任务 ID 数组，如 `["task-id-1", "task-id-2"]`
- `inputContext` — 传给 Agent 的结构化输入（JSON 对象）
- `concurrencyKey` — 并发控制 key（相同 key 的任务互斥执行）
- `maxRetries` — 最大重试次数
- `parentTaskId` — 父任务 ID（用于子任务）
- `workingDirectory` — 工作目录
- `source` — `web` | `chat` | `cli`

## 查询任务

```bash
# 所有任务
curl http://localhost:3179/api/tasks

# 按状态
curl http://localhost:3179/api/tasks?status=running

# 单个任务详情（含日志、依赖、子任务）
curl http://localhost:3179/api/tasks/{id}
```

## 更新任务

```bash
curl -X PATCH http://localhost:3179/api/tasks/{id} \
  -H "Content-Type: application/json" \
  -d '{"title": "新标题", "description": "新描述"}'
```

## 执行任务

```bash
curl -X POST http://localhost:3179/api/tasks/{id}/execute
```

## 完成/失败/阻塞任务

```bash
# 完成
curl -X POST http://localhost:3179/api/tasks/{id}/complete

# 失败
curl -X POST http://localhost:3179/api/tasks/{id}/fail \
  -H "Content-Type: application/json" \
  -d '{"reason": "失败原因"}'

# 阻塞（请求人类决策）
curl -X POST http://localhost:3179/api/tasks/{id}/block \
  -H "Content-Type: application/json" \
  -d '{
    "decision": {
      "type": "choose",
      "question": "选择部署环境",
      "options": [
        {"id": "staging", "label": "测试环境"},
        {"id": "prod", "label": "生产环境"}
      ]
    }
  }'
```

## 创建子任务

```bash
curl -X POST http://localhost:3179/api/tasks/{id}/subtasks \
  -H "Content-Type: application/json" \
  -d '[
    {"title": "步骤1: 分析需求", "sequential": true},
    {"title": "步骤2: 编写代码", "sequential": true},
    {"title": "步骤3: 运行测试", "sequential": true}
  ]'
```

`sequential: true` 会自动设置依赖链，前一个完成后下一个才执行。

## 回复阻塞的任务

```bash
curl -X POST http://localhost:3179/api/tasks/{id}/reply \
  -H "Content-Type: application/json" \
  -d '{"body": "选择测试环境"}'
```

## 添加评论/日志

```bash
curl -X POST http://localhost:3179/api/tasks/{id}/comments \
  -H "Content-Type: application/json" \
  -d '{"body": "进度更新：已完成 50%", "actorType": "agent"}'
```

## 查看 Agent 列表

```bash
curl http://localhost:3179/api/agents
```

## 使用建议

- 当用户说"创建任务"、"记下来"、"帮我做"时，调用创建任务 API
- 复杂任务先创建父任务，再用子任务 API 拆解
- 需要用户决定时，用 block API 的 decision 字段
- 任务完成后，把结果写入 complete 或 log 中
```

## Step 3: Register the Skill

The skill will be auto-discovered if placed in `~/.openclaw/skills/lumitask/`.

To verify:

```bash
openclaw agents list --json
# Your agent should now have lumitask in its available skills
```

## Step 4: Test It

In Feishu / Telegram / Discord, talk to your agent:

```
你：帮我创建一个任务，标题是"重构用户登录模块"

Agent：已创建任务 #12: 重构用户登录模块
       状态: open
       查看详情: http://localhost:3179/tasks/xxx
```

Open `http://localhost:3179` in your browser to see the task on the Kanban board.

## Remote Connection

If your OpenClaw runs on a remote server:

### Option A: Connection Code (Recommended)

On the remote server:
```bash
openclaw qr --setup-code-only
# Outputs: eyJ1cmwiOiJ3czovLy4uLiIs...
```

In LumiTask Settings → Agent Connection → Remote Mode → paste the code → Connect.

### Option B: Ask Your Agent

```
你：给我 LumiTask 连接码

Agent：这是你的连接码：eyJ1cmwiOi...
       把它粘贴到 LumiTask 设置页面即可
```

## Notification Setup

LumiTask can send task notifications through your agent's existing channels (Feishu, Discord, etc).

1. Go to Settings → Agent Channel Notifications
2. Select an agent with a bound channel
3. Choose which events to notify (completed, failed, blocked)
4. Click "Test Send" to verify

## CLI Reference

If your agent prefers CLI over API:

```bash
# Set API URL (auto-discovered from ~/.lumitask/port if running)
export LUMITASK_API_URL=http://localhost:3179/api

# Task management
lumitask create --title "Task name" --description "Details"
lumitask create --title "Urgent fix" --schedule immediate --assign "claude-code"
lumitask list
lumitask show <task-id>
lumitask start <task-id>
lumitask complete <task-id>
lumitask fail <task-id> --reason "Error message"
lumitask block <task-id> --reason "Need human input"
lumitask reopen <task-id>
lumitask log <task-id> --message "Progress update"

# Agent management
lumitask agent list
lumitask agent detect
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  LumiTask (http://localhost:3179)               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Web UI  │  │ REST API │  │   CLI    │      │
│  │ (Kanban) │  │ /api/*   │  │ lumitask │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
│       │              │              │             │
│  ┌────┴──────────────┴──────────────┴────┐      │
│  │         Task Engine                    │      │
│  │  Scheduler → Executor → Concurrency   │      │
│  │  Dependencies → Retry → Notifications │      │
│  └────┬─────────────────────────┬────────┘      │
│       │                         │                │
│  ┌────┴─────┐            ┌─────┴──────┐        │
│  │ Claude   │            │  OpenClaw  │        │
│  │ Code     │            │  Adapter   │        │
│  │ Adapter  │            │ (local/    │        │
│  │          │            │  remote)   │        │
│  └──────────┘            └────────────┘        │
└─────────────────────────────────────────────────┘
```
