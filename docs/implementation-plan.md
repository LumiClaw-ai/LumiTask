# ClawTask — 轻量级 Agent 任务协同中枢

## 核心定位

**一句话**：开源的本地优先 agent 任务管理工具，用户在聊天中说"记录到任务"时才创建任务，OpenClaw agent 定期巡检认领并执行，结果通过聊天渠道回传给用户。

**关键原则**：
- **开源项目**，无登录、无多租户，本地直接使用
- **聊天驱动**：大部分对话是即时完成的，只有用户明确说"记录到任务"时才写入 ClawTask
- **Agent 自治**：agent 定期巡检任务池，根据自身能力理解自动认领未分配的任务
- **单层任务**：不做子任务，agent 领到任务后自行规划执行，卡住则改状态通知用户决策
- **CLI 优先**：提供 CLI 工具让 agent 高效操作任务（创建/查询/认领/回写）

**不做什么**：不做登录认证、不做多租户、不做子任务拆分、不做文档/白板/知识库。

---

## 技术栈

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | **Next.js 15 (App Router)** | 全栈、SSR/API Routes |
| 数据库 | **SQLite + Drizzle ORM** | 轻量、零依赖、本地优先 |
| 实时 | **Server-Sent Events (SSE)** | 简单，Next.js 原生支持 |
| UI | **Tailwind CSS + Radix UI** | 成熟组合 |
| 状态管理 | **TanStack Query** | 服务端状态缓存 + 乐观更新 |
| Agent 通信 | **OpenClaw Gateway WebSocket RPC + CLI** | 官方协议 |
| CLI | **commander.js** | agent 和用户都可通过 CLI 操作 |
| 包管理 | **pnpm** | 一致性 |

---

## 两种使用模式

### 模式 1：聊天驱动（主要模式）

```
用户跟 OpenClaw agent 对话
     ↓
大部分任务即时完成，不经过 ClawTask
     ↓
用户说："把这个记录到任务管理" / "这个任务记一下"
     ↓
Agent 调用 CLI: clawtask create --title "..." --description "..."
     ↓
任务进入 ClawTask 任务池 (status: open)
```

### 模式 2：面板创建（辅助模式）

```
用户打开 Web 面板
     ↓
手动创建任务（可指定 agent，也可不指定）
     ↓
任务进入任务池 (status: open)
```

### Agent 巡检认领

```
OpenClaw agent 定期（cron）执行巡检
     ↓
clawtask list --status open --unassigned
     ↓
Agent 根据任务内容 + 自身对各 agent 的理解，决定分配
     ↓
clawtask assign <task-id> --agent <agent-name>
     ↓
被分配的 agent 收到任务，开始执行
     ↓
执行过程中通过 CLI 写入活动日志：
  clawtask log <task-id> "正在抓取数据..."
  clawtask log <task-id> "数据处理完成，生成报告中..."
     ↓
完成后回写结果：
  clawtask complete <task-id> --summary "结果摘要" --result "详细内容"
     ↓
系统通过聊天渠道通知用户：任务 #12 已完成
     ↓
卡住时：
  clawtask block <task-id> --reason "需要用户提供 API key"
     ↓
系统通知用户，用户决策后手动解除或在聊天中指示
```

---

## 数据模型

```
┌──────────────────────────────────────────────┐
│  tasks (任务)                                 │
│  ├── activity_log (任务活动日志，含执行过程)    │
│  └── artifacts (执行产物)                     │
│                                               │
│  agents (已注册的 agent)                      │
└──────────────────────────────────────────────┘
```

### 核心表设计

```typescript
// schema.ts (Drizzle ORM)

// 任务表 — 单层，不做子任务
tasks = {
  id:                text().primaryKey(),  // nanoid
  number:            integer().notNull(),  // 自增编号，方便 CLI 引用 (#12)
  title:             text().notNull(),
  description:       text(),

  status:            text().notNull(),     // open|assigned|running|blocked|done|failed|cancelled
  priority:          text().default('medium'), // urgent|high|medium|low

  // 分配
  assigneeAgentId:   text().references(agents.id), // null = 未认领
  assignedBy:        text(),               // 谁分配的（agent name 或 "user"）

  // 执行结果
  summary:           text(),               // 完成摘要
  result:            text(),               // 详细结果内容
  blockReason:       text(),               // blocked 时的原因
  failReason:        text(),               // failed 时的原因

  // 时间
  dueAt:             integer(),            // unix timestamp
  startedAt:         integer(),
  completedAt:       integer(),
  createdAt:         integer().notNull(),
  updatedAt:         integer().notNull(),

  // Token 消耗
  totalInputTokens:  integer().default(0),  // 累计输入 token
  totalOutputTokens: integer().default(0),  // 累计输出 token
  totalCostCents:    integer().default(0),  // 累计费用（美分）

  // 来源
  source:            text().default('web'), // web|chat|cli
  notifyChannel:     text(),               // 结果通知渠道: discord|telegram|wechat|slack
  notifyTarget:      text(),               // 通知目标 (channel id / chat id)

  // 排序
  sortOrder:         real().default(0),
}

// Agent 注册表
agents = {
  id:                text().primaryKey(),
  name:              text().notNull().unique(), // CLI 引用名 e.g. "social-growth"
  displayName:       text(),
  description:       text(),               // agent 自述：擅长什么
  capabilities:      text(),               // JSON: ["research","content","dev","seo","growth"]
  status:            text().default('idle'), // idle|busy|offline
  openclawAgentId:   text(),               // OpenClaw 侧的 agentId
  lastSeenAt:        integer(),            // 最近一次巡检时间
  createdAt:         integer().notNull(),
}

// 活动日志 — 不可变，记录任务的完整生命周期
// 任务详情页直接展示这个时间线
activityLog = {
  id:                text().primaryKey(),
  taskId:            text().notNull().references(tasks.id),
  action:            text().notNull(),
  // 可能的 action 值：
  //   task.created        任务创建
  //   task.assigned       任务被分配
  //   task.started        开始执行
  //   task.progress       执行进展（agent 主动汇报）
  //   task.blocked        执行卡住
  //   task.unblocked      解除阻塞
  //   task.completed      执行完成
  //   task.failed         执行失败
  //   task.cancelled      任务取消
  //   task.reassigned     重新分配
  //   comment             用户或 agent 的评论
  actorType:         text().notNull(),     // user|agent|system
  actorId:           text(),               // agent name 或 "user"
  message:           text(),               // 日志内容（markdown）
  details:           text(),               // JSON: 额外结构化信息

  // Token 消耗（agent 每次操作可附带 token 用量）
  inputTokens:       integer(),
  outputTokens:      integer(),
  model:             text(),               // 使用的模型 e.g. "claude-sonnet-4-20250514"
  provider:          text(),               // 提供商 e.g. "anthropic"
  createdAt:         integer().notNull(),
}

// 执行产物
artifacts = {
  id:                text().primaryKey(),
  taskId:            text().notNull().references(tasks.id),
  type:              text().notNull(),     // file|url|text|json|image
  name:              text(),
  content:           text(),               // 内容或文件路径
  mimeType:          text(),
  createdAt:         integer().notNull(),
}
```

### 任务状态机（简化）

```
open ──────→ assigned ──→ running ──→ done
  │              │           │
  │              │           ├──→ blocked ──→ running (unblock)
  │              │           │                  └──→ cancelled
  │              │           └──→ failed
  │              │                  └──→ open (retry/reassign)
  └──────────────┴───────────────────────→ cancelled
```

**关键简化**：去掉了 draft/ready/dispatched/review/waiting_input 等中间状态。

- `open`：待认领（用户创建或 agent 巡检发现）
- `assigned`：已分配给某个 agent，等待开始
- `running`：agent 正在执行
- `blocked`：卡住了，需要用户介入
- `done`：完成
- `failed`：失败（可以重新变为 open 重试）
- `cancelled`：取消

---

## CLI 设计（核心交互方式）

Agent 通过 CLI 操作 ClawTask，比 API 更直观高效。CLI 调用 ClawTask 的 REST API。

```bash
# === 任务管理 ===

# 创建任务
clawtask create --title "整理本周AI新闻" --description "..." --priority high
# → Task #12 created (status: open)

# 创建任务并指定 agent
clawtask create --title "写推文" --assign social-growth --priority medium
# → Task #13 created, assigned to social-growth

# 列出任务
clawtask list                              # 所有非终态任务
clawtask list --status open                # 待认领
clawtask list --status open --unassigned   # 未分配的
clawtask list --agent social-growth        # 某 agent 的任务
clawtask list --status running             # 执行中的

# 查看任务详情（含活动日志）
clawtask show 12
# → Task #12: 整理本周AI新闻
#   Status: running | Agent: researcher | Priority: high
#   Tokens: 12,450 in / 3,280 out (~$0.08)
#   Created: 2026-03-15 10:00 | Started: 2026-03-15 10:05
#
#   Activity:
#   [10:00] 🆕 task.created by user
#   [10:02] 📋 task.assigned to researcher by orchestrator
#   [10:05] ▶️  task.started by researcher
#   [10:08] 📝 task.progress by researcher: "已找到15篇相关文章，正在筛选..."
#   [10:15] 📝 task.progress by researcher: "筛选完成，开始撰写摘要..."

# === Agent 执行操作 ===

# 认领任务
clawtask assign 12 --agent researcher

# 开始执行
clawtask start 12

# 汇报进展（写入活动日志，任务详情页实时可见）
clawtask log 12 "已找到15篇相关文章，正在筛选..." \
  --tokens-in 1200 --tokens-out 350 --model claude-sonnet-4-20250514
clawtask log 12 "筛选完成，开始撰写摘要..."

# 完成任务
clawtask complete 12 --summary "整理了10篇AI新闻摘要" --result "1. OpenAI发布..."
# → Task #12 completed. Notifying user via telegram.

# 标记卡住
clawtask block 12 --reason "需要用户提供 Perplexity API key"
# → Task #12 blocked. Notifying user via telegram.

# 解除阻塞
clawtask unblock 12

# 标记失败
clawtask fail 12 --reason "API 超时无法访问"

# 重新打开（重试）
clawtask reopen 12

# === Agent 注册 ===

# 注册 agent
clawtask agent register --name social-growth --display "社媒增长" \
  --capabilities research,content,seo \
  --description "负责社交媒体内容创作和增长策略"

# 列出 agent
clawtask agent list

# Agent 签到（巡检时调用，更新 lastSeenAt）
clawtask agent checkin --name orchestrator

# === 添加产物 ===

clawtask artifact 12 --type file --name "report.md" --content ./output/report.md
clawtask artifact 12 --type url --name "推文链接" --content "https://x.com/..."
```

---

## 系统架构

```
┌───────────────────────────────────────────────────────────────────┐
│                           ClawTask                                 │
│                                                                    │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Web UI   │  │ REST API   │  │   CLI    │  │ OpenClaw      │  │
│  │  (Next.js)│  │ /api/*     │  │ clawtask │  │ Plugin/Skill  │  │
│  │           │  │            │  │          │  │               │  │
│  │  - 看板   ←SSE┤            │←HTTP─┘          │  agent 调用   │  │
│  │  - 任务   │  │            │                  │  CLI 操作任务 │  │
│  │  - Agent  │  │            │                  │               │  │
│  │  - 活动流 │  │            │                  │               │  │
│  └──────────┘  └─────┬──────┘                  └───────┬───────┘  │
│                      │                                  │          │
│                ┌─────▼─────┐              ┌─────────────▼────┐    │
│                │  SQLite   │              │  OpenClaw Gateway │    │
│                │  (Drizzle)│              │  - agent run      │    │
│                └───────────┘              │  - cron 巡检      │    │
│                                           │  - deliver 通知   │    │
│                                           └──────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

### 核心流程

```
                    ┌─────── 用户聊天 ───────┐
                    │                         │
                    ▼                         ▼
            即时完成（大部分）         "记到任务管理"
            不经过 ClawTask               │
                                          ▼
                                 Agent 调 CLI 创建任务
                                    clawtask create
                                          │
                    ┌─────── 或 ──────────┤
                    ▼                      ▼
            用户 Web 面板创建        任务进入 open 池
                    │                      │
                    └──────────┬───────────┘
                               ▼
                    Orchestrator Agent (cron 定期巡检)
                    clawtask list --status open --unassigned
                               │
                     根据任务内容 + agent 能力理解
                               │
                     clawtask assign <id> --agent <name>
                               │
                               ▼
                     被分配 Agent 开始执行
                     clawtask start <id>
                     clawtask log <id> "进展..."
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                  完成       卡住       失败
              clawtask    clawtask    clawtask
              complete    block       fail
                  │          │          │
                  ▼          ▼          ▼
              通知用户    通知用户    通知用户
            (聊天渠道)  (需要决策)  (可重试)
```

---

## 与 OpenClaw 的集成方式

### 方式 1：注册为 OpenClaw Skill（推荐）

把 ClawTask CLI 命令注册为 OpenClaw 的 skill，这样 agent 在对话中可以直接使用：

```markdown
# skills/clawtask.md
---
name: clawtask
description: 管理任务的技能，可以创建、查询、认领、完成任务
tools:
  - shell: clawtask create --title "$title" --description "$description"
  - shell: clawtask list $filters
  - shell: clawtask show $taskNumber
  - shell: clawtask assign $taskNumber --agent $agentName
  - shell: clawtask complete $taskNumber --summary "$summary"
  - shell: clawtask log $taskNumber "$message"
  - shell: clawtask block $taskNumber --reason "$reason"
---

当用户说"记到任务"、"这个任务记一下"、"帮我创建个任务"时，
使用 clawtask create 创建任务。

当被分配任务时，先 clawtask start，然后执行，
过程中用 clawtask log 汇报进展，
完成后用 clawtask complete 回写结果。

卡住时用 clawtask block 通知用户。
```

### 方式 2：Cron 巡检任务

配置 orchestrator agent 的 cron job，定期巡检：

```json
{
  "cron": {
    "jobs": [{
      "id": "clawtask-patrol",
      "name": "巡检 ClawTask 任务池",
      "schedule": "*/10 * * * *",
      "agentId": "orchestrator",
      "payload": {
        "kind": "agentTurn",
        "message": "请检查 ClawTask 中未分配的任务：运行 clawtask list --status open --unassigned，根据你对各 agent 能力的了解，分配合适的 agent。"
      }
    }]
  }
}
```

### 方式 3：完成后通过聊天通知用户

Agent 完成任务后，ClawTask 通过 OpenClaw 的 `deliver` 机制把结果发到用户的聊天渠道：

```typescript
// 任务完成时，调用 OpenClaw Gateway 发送通知
await openclawConnector.createAgentRun({
  message: `任务 #${task.number} 已完成：${task.title}\n\n摘要：${task.summary}`,
  agentId: 'orchestrator',
  deliver: true,            // 投递到聊天渠道
  channel: task.notifyChannel,
  to: task.notifyTarget,
})
```

---

## 项目结构

```
clawtask/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 根布局（侧边栏 + 主内容）
│   │   ├── page.tsx                  # 看板主页
│   │   ├── tasks/
│   │   │   └── [id]/
│   │   │       └── page.tsx          # 任务详情（含活动日志时间线）
│   │   ├── agents/
│   │   │   └── page.tsx              # Agent 列表与注册
│   │   └── api/                      # REST API
│   │       ├── tasks/
│   │       │   ├── route.ts          # GET list, POST create
│   │       │   └── [id]/
│   │       │       ├── route.ts      # GET detail, PATCH update
│   │       │       ├── assign/route.ts
│   │       │       ├── start/route.ts
│   │       │       ├── complete/route.ts
│   │       │       ├── block/route.ts
│   │       │       ├── fail/route.ts
│   │       │       ├── reopen/route.ts
│   │       │       ├── log/route.ts       # POST 写入活动日志
│   │       │       └── artifacts/route.ts
│   │       ├── agents/
│   │       │   ├── route.ts          # GET list, POST register
│   │       │   └── [id]/
│   │       │       └── checkin/route.ts
│   │       └── events/
│   │           └── route.ts          # SSE 实时事件流
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts            # Drizzle schema
│   │   │   ├── index.ts             # DB connection
│   │   │   └── seed.ts              # 默认看板列种子数据
│   │   ├── openclaw/
│   │   │   ├── connector.ts         # Gateway WebSocket RPC client
│   │   │   └── notify.ts            # 任务状态变更 → 聊天通知
│   │   ├── events.ts                # SSE event emitter
│   │   └── utils.ts
│   │
│   └── components/
│       ├── board/
│       │   ├── kanban-board.tsx      # 看板主组件
│       │   ├── task-card.tsx         # 任务卡片
│       │   └── column.tsx            # 看板列
│       ├── task/
│       │   ├── task-detail.tsx       # 任务详情
│       │   ├── task-form.tsx         # 创建/编辑表单
│       │   └── activity-timeline.tsx # 活动日志时间线（核心组件）
│       ├── agent/
│       │   ├── agent-list.tsx
│       │   ├── agent-card.tsx
│       │   └── agent-register-form.tsx
│       └── ui/                       # 基础 UI 组件
│
├── cli/                              # CLI 工具（独立入口）
│   ├── index.ts                      # commander.js 入口
│   ├── commands/
│   │   ├── create.ts
│   │   ├── list.ts
│   │   ├── show.ts
│   │   ├── assign.ts
│   │   ├── start.ts
│   │   ├── complete.ts
│   │   ├── block.ts
│   │   ├── fail.ts
│   │   ├── reopen.ts
│   │   ├── log.ts
│   │   ├── artifact.ts
│   │   └── agent.ts                  # agent register/list/checkin
│   └── api-client.ts                 # HTTP client 调 REST API
│
├── drizzle/
├── public/
├── docs/
│   ├── about.md
│   └── implementation-plan.md
├── next.config.ts
├── drizzle.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .env.example
```

---

## REST API

| 方法 | 路径 | 说明 | 调用方 |
|------|------|------|--------|
| GET | `/api/tasks` | 任务列表（?status=&agent=&unassigned=true） | Web + CLI |
| POST | `/api/tasks` | 创建任务 | Web + CLI |
| GET | `/api/tasks/:id` | 任务详情 + 活动日志 + 产物 | Web + CLI |
| PATCH | `/api/tasks/:id` | 更新任务字段 | Web + CLI |
| POST | `/api/tasks/:id/assign` | 分配 agent | CLI (orchestrator) |
| POST | `/api/tasks/:id/start` | 开始执行 | CLI (agent) |
| POST | `/api/tasks/:id/complete` | 完成任务（含 summary/result） | CLI (agent) |
| POST | `/api/tasks/:id/block` | 标记阻塞（含 reason） | CLI (agent) |
| POST | `/api/tasks/:id/fail` | 标记失败（含 reason） | CLI (agent) |
| POST | `/api/tasks/:id/reopen` | 重新打开 | Web + CLI |
| POST | `/api/tasks/:id/log` | 写入活动日志 | CLI (agent) |
| POST | `/api/tasks/:id/artifacts` | 添加产物 | CLI (agent) |
| GET | `/api/agents` | Agent 列表 | Web + CLI |
| POST | `/api/agents` | 注册 Agent | CLI |
| POST | `/api/agents/:id/checkin` | Agent 签到 | CLI (cron) |
| GET | `/api/events` | SSE 实时事件流 | Web |

---

## 前端页面

### 1. 看板主页 (`/`)

- 列 = 任务状态：Open | Assigned | Running | Blocked | Done
- 任务卡片：编号、标题、优先级色标、分配的 agent 头像/名称
- 点击卡片 → 右侧滑出任务详情面板
- 顶部：快速创建任务、按 agent 筛选

### 2. 任务详情 (`/tasks/[id]`)

核心是 **活动日志时间线**，展示任务完整生命周期：

```
┌──────────────────────────────────────────┐
│  Task #12: 整理本周AI新闻                  │
│  Status: running  Priority: 🔴 high       │
│  Agent: researcher                        │
│  Tokens: 12,450 in / 3,280 out  ~$0.08   │
│  Created: 2026-03-15 10:00                │
│                                           │
│  ── Activity Timeline ──────────────────  │
│                                           │
│  10:00  🆕 Task created                   │
│         by user via chat                  │
│                                           │
│  10:02  📋 Assigned to researcher         │
│         by orchestrator                   │
│         "researcher 擅长信息检索和整理"      │
│                                           │
│  10:05  ▶️  Execution started              │
│         by researcher                     │
│                                           │
│  10:08  📝 Progress update                │
│         by researcher (1.2k/350 tokens)   │
│         "已找到15篇相关文章，正在筛选..."     │
│                                           │
│  10:15  📝 Progress update                │
│         by researcher                     │
│         "筛选完成8篇高质量文章，撰写摘要中"   │
│                                           │
│  10:22  ✅ Completed                      │
│         by researcher                     │
│         Summary: "整理了8篇AI新闻摘要"      │
│         [查看完整结果]                      │
│                                           │
│  ── Artifacts ──────────────────────────  │
│  📄 report.md                             │
│  🔗 https://x.com/post/123               │
│                                           │
│  ── Add Comment ────────────────────────  │
│  [输入框]                        [发送]    │
└──────────────────────────────────────────┘
```

**活动日志实时更新**：通过 SSE 订阅，agent 每次 `clawtask log` 都即时显示在时间线上。

### 3. Agent 管理 (`/agents`)

- 已注册 agent 列表
- 每个 agent 卡片：名称、描述、能力标签、状态、最近签到时间
- 注册新 agent 的表单
- 点击 agent → 查看其任务列表

---

## Agent 能力匹配

两种模式并存：

### 手动指定

用户创建任务时选择 agent，或在聊天中 @ agent：

```
用户: "帮我写一篇推文 @social-growth，记到任务"
→ clawtask create --title "写推文" --assign social-growth
```

### 自动分配（Orchestrator Agent）

未指定 agent 的任务，由 orchestrator cron 巡检时自动分配：

```
Orchestrator 的决策逻辑（在 agent prompt 中定义）：
1. clawtask list --status open --unassigned
2. clawtask agent list  （查看所有 agent 及其能力描述）
3. 根据任务内容理解 + agent 能力描述，做出分配决策
4. clawtask assign <id> --agent <name>

这里不写死匹配规则，而是让 orchestrator agent 用自然语言理解来匹配。
好处：不需要维护能力矩阵，agent 的 description 写清楚就行。
```

---

## 环境变量

```env
# .env.example

# ClawTask Server
CLAWTASK_PORT=3000
CLAWTASK_HOST=127.0.0.1

# Database
DATABASE_URL=file:./data/clawtask.db

# OpenClaw Gateway（用于通知用户）
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token

# CLI 配置（agent 使用时需要知道 server 地址）
CLAWTASK_API_URL=http://127.0.0.1:3000/api
```

---

## 实施路径

### Phase 1：核心骨架

1. **项目初始化**：Next.js + Drizzle + SQLite + Tailwind
2. **数据库 schema**：tasks、agents、activity_log、artifacts
3. **REST API**：任务 CRUD + 状态变更端点 + 活动日志
4. **CLI 工具**：create、list、show、assign、start、complete、block、fail、log
5. **看板 UI**：基础看板 + 任务详情面板 + 活动日志时间线
6. **SSE**：任务状态变更和活动日志实时推送

**Phase 1 验证目标**：CLI 创建任务 → 看板可见 → CLI 写入进展 → 详情页实时显示活动日志 → CLI 完成任务 → 看板状态更新

### Phase 2：OpenClaw 集成

7. **OpenClaw Skill**：注册 clawtask CLI 为 skill，agent 在对话中可用
8. **Cron 巡检**：orchestrator agent 定期检查未分配任务
9. **完成通知**：任务完成/卡住时通过 OpenClaw deliver 发送聊天通知
10. **Agent 注册**：agent 首次巡检时自动注册到 ClawTask

**Phase 2 验证目标**：用户聊天说"记到任务" → agent 自动调 CLI 创建 → orchestrator 巡检分配 → agent 执行回写 → 用户在聊天收到结果通知

### Phase 3：体验优化

11. **看板拖拽**：拖拽改变任务状态和排序
12. **Agent 统计**：完成数、成功率
13. **批量操作**：看板上多选操作
14. **通知渠道扩展**：Discord/Telegram/WeChat webhook

---

## 与参考项目的借鉴点

| 来源 | 借鉴内容 |
|------|----------|
| **Paperclip** | activity_log 不可变审计设计、issues 表核心字段、REST API 端点设计风格、adapter 抽象思路 |
| **vibe-kanban** | 看板 UI 交互模式、`sortOrder` float 排序、任务卡片设计、CSS 变量设计系统 |
| **OpenClaw** | Gateway WebSocket RPC 协议 v3、Skill 注册机制、Cron 定期巡检、deliver 聊天投递 |
