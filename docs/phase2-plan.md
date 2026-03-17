# ClawTask Phase 2 — Agent 自动执行 + 调度

## 设计变更总结

基于 LumiClaw、CodePilot、Paperclip、vibe-kanban 的参考，Phase 2 做以下调整：

### 新增能力
- **自动检测本地 Agent Runtime**：启动时扫描本地 Claude Code CLI 和 OpenClaw Gateway，自动注册
- **真正的任务执行**：Agent 通过 Adapter 真正执行任务
- **Tool Use 日志**：活动日志记录 agent 的每次 tool_use（读文件、写文件、执行命令等）
- **工作目录**：每个任务可关联一个文件夹
- **4 种启动模式**：手动、立即开始、定时、重复任务
- **应用内通知 Toast**：右下角弹出通知（参考 Paperclip），同时支持浏览器系统通知
- **全局设置**：默认文件夹等配置项
- **Token 消耗展示**：只展示不控制

### 去掉的
- **优先级**：暂时去掉
- **预算控制**：不做

### 核心约束
- **Claude Code 是唯一 agent**：自动检测，不能重复添加
- **OpenClaw 也是自动检测**：检测 Gateway 是否在跑
- **网页端文件夹选择可行**：Next.js API Routes 跑在本地 Node.js，有完整文件系统权限

---

## Agent 自动检测机制

### 启动时检测

```typescript
// src/lib/agents/detect.ts

interface DetectedAgent {
  type: 'claude-code' | 'openclaw'
  name: string
  displayName: string
  available: boolean
  version?: string
  config: Record<string, any>
}

async function detectAgents(): Promise<DetectedAgent[]> {
  const agents: DetectedAgent[] = []

  // 1. 检测 Claude Code
  const claudePath = await findClaudeCodeBinary()
  if (claudePath) {
    const version = await getClaudeCodeVersion(claudePath)
    agents.push({
      type: 'claude-code',
      name: 'claude-code',
      displayName: 'Claude Code',
      available: true,
      version,
      config: { binaryPath: claudePath }
    })
  }

  // 2. 检测 OpenClaw Gateway
  const openclawAvailable = await checkOpenClawGateway()
  if (openclawAvailable) {
    agents.push({
      type: 'openclaw',
      name: 'openclaw',
      displayName: 'OpenClaw',
      available: true,
      config: {
        gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
        gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN || ''
      }
    })
  }

  return agents
}
```

### Claude Code 检测（参考 CodePilot）

```typescript
// src/lib/agents/claude-code-detect.ts

async function findClaudeCodeBinary(): Promise<string | null> {
  // 搜索顺序：
  // 1. which claude（PATH 里找）
  // 2. ~/.claude/bin/claude
  // 3. /usr/local/bin/claude
  // 4. /opt/homebrew/bin/claude
  // 5. ~/.local/bin/claude
  // 6. ~/.nvm/versions/node/*/bin/claude
}

async function getClaudeCodeVersion(path: string): Promise<string> {
  // 执行 claude --version，解析输出
}
```

### OpenClaw 检测

```typescript
// src/lib/agents/openclaw-detect.ts

async function checkOpenClawGateway(): Promise<boolean> {
  // 1. 检查 which openclaw
  // 2. 检查 ~/.openclaw/ 目录是否存在
  // 3. 尝试连接 ws://127.0.0.1:18789 并发送 health 检查
  // 连上 = 可用，连不上 = 不可用
}
```

### 自动注册流程

```
应用启动 / 用户打开 Agents 页面 / 点击"重新检测"
       ↓
GET /api/agents/detect
       ↓
扫描本地 Claude Code + OpenClaw
       ↓
对比数据库已有 agents
       ↓
新检测到的 → 自动 INSERT（如果 name 不存在）
已存在的 → 更新 status (online/offline) 和 version
不再可用的 → 标记 status=offline
       ↓
返回 agents 列表（含 available 状态）
```

**Claude Code 只能有一个**：检测到就注册一条 `name='claude-code'`，不允许重复。

---

## Agent Adapter 架构

### 接口定义

```typescript
// src/lib/agents/adapter.ts

interface TaskContext {
  taskId: string
  taskNumber: number
  title: string
  description: string | null
  workingDirectory: string | null
}

// 执行事件 — 每个事件写入 activityLog
interface ExecutionEvent {
  type: 'started' | 'progress' | 'tool_use' | 'tool_result' | 'completed' | 'failed' | 'blocked'
  message: string
  // tool_use 相关
  toolName?: string       // e.g. "Read", "Edit", "Bash", "Write"
  toolInput?: string      // 工具参数摘要 e.g. "src/app/page.tsx"
  // token 相关
  inputTokens?: number
  outputTokens?: number
  model?: string
  timestamp: number
}

interface ExecutionResult {
  success: boolean
  summary: string
  result?: string
  error?: string
  totalInputTokens: number
  totalOutputTokens: number
  model?: string
}

interface AgentAdapter {
  type: string
  detect(): Promise<boolean>
  execute(
    context: TaskContext,
    onEvent: (event: ExecutionEvent) => void
  ): Promise<ExecutionResult>
  cancel(taskId: string): Promise<void>
}
```

### Claude Code Adapter

```typescript
// src/lib/agents/claude-code-adapter.ts

class ClaudeCodeAdapter implements AgentAdapter {
  type = 'claude-code'

  async execute(context: TaskContext, onEvent: (e: ExecutionEvent) => void) {
    const cwd = context.workingDirectory || settings.defaultWorkingDirectory || process.env.HOME
    const prompt = `${context.title}\n\n${context.description || ''}`

    onEvent({ type: 'started', message: 'Claude Code 开始执行', timestamp: Date.now() })

    // spawn claude CLI with stream-json output
    const proc = spawn('claude', [
      '--print',
      '--output-format', 'stream-json',
      '--max-turns', '50',
      '-p', prompt
    ], { cwd })

    // 逐行解析 stdout JSON 事件
    for await (const line of proc.stdout) {
      const event = JSON.parse(line)

      if (event.type === 'assistant') {
        // assistant 消息 — 可能包含文本和 tool_use
        for (const block of event.message.content) {
          if (block.type === 'text') {
            onEvent({
              type: 'progress',
              message: block.text,
              inputTokens: event.message.usage?.input_tokens,
              outputTokens: event.message.usage?.output_tokens,
              model: event.message.model,
              timestamp: Date.now()
            })
          }
          if (block.type === 'tool_use') {
            // 记录 tool_use: 读文件、写文件、执行命令等
            onEvent({
              type: 'tool_use',
              message: formatToolUse(block.name, block.input),
              toolName: block.name,
              toolInput: summarizeToolInput(block.name, block.input),
              timestamp: Date.now()
            })
          }
        }
      }

      if (event.type === 'tool_result') {
        // tool 执行结果
        onEvent({
          type: 'tool_result',
          message: summarizeToolResult(event),
          toolName: event.tool_name,
          timestamp: Date.now()
        })
      }

      if (event.type === 'result') {
        // 最终结果
        return {
          success: true,
          summary: extractSummary(event),
          result: extractFullResult(event),
          totalInputTokens: event.usage?.input_tokens || 0,
          totalOutputTokens: event.usage?.output_tokens || 0,
          model: event.model
        }
      }
    }
  }
}

// Tool Use 格式化
function formatToolUse(name: string, input: any): string {
  switch (name) {
    case 'Read':     return `📖 读取 ${input.file_path}`
    case 'Write':    return `📝 写入 ${input.file_path}`
    case 'Edit':     return `✏️ 编辑 ${input.file_path}`
    case 'Bash':     return `💻 执行 ${input.command?.slice(0, 80)}...`
    case 'Glob':     return `🔍 搜索 ${input.pattern}`
    case 'Grep':     return `🔎 查找 "${input.pattern}" in ${input.path || '.'}`
    default:         return `🔧 ${name}`
  }
}
```

### OpenClaw Adapter

```typescript
// src/lib/agents/openclaw-adapter.ts

class OpenClawAdapter implements AgentAdapter {
  type = 'openclaw'

  async execute(context: TaskContext, onEvent: (e: ExecutionEvent) => void) {
    // 1. 连接 Gateway WebSocket RPC v3
    // 2. 发送 agent run:
    //    method: 'agent'
    //    params: { message, idempotencyKey, sessionKey }
    // 3. 监听 stream events (if supported) → onEvent
    // 4. agent.wait → 最终结果
    //
    // workingDirectory：在 message 里附带
  }
}
```

---

## 活动日志中的 Tool Use 展示

### activityLog 表扩展

```diff
 activityLog = {
   ...
   action:            text().notNull(),
+  // 新增 action 值：
+  //   tool.use          agent 调用工具
+  //   tool.result       工具返回结果
   actorType:         text().notNull(),
   actorId:           text(),
   message:           text(),
   details:           text(),           // JSON
+  toolName:          text(),           // e.g. "Read", "Edit", "Bash", "Write", "Glob", "Grep"
+  toolInput:         text(),           // 工具参数摘要 e.g. "src/app/page.tsx"
   inputTokens:       integer(),
   outputTokens:      integer(),
   model:             text(),
   provider:          text(),
   createdAt:         integer().notNull(),
 }
```

### 活动时间线展示效果

```
Activity Timeline (实时更新):

[10:05:00] ▶️  task.started by claude-code
           "Claude Code 开始执行"

[10:05:02] 📝 task.progress by claude-code (1.2k/0.4k tokens)
           "我来分析一下项目结构"

[10:05:03] 🔍 tool.use — Glob
           搜索 "src/**/*.tsx"

[10:05:03] 📖 tool.use — Read
           读取 src/app/page.tsx

[10:05:05] 📝 task.progress by claude-code (0.8k/0.3k tokens)
           "找到入口文件，开始添加导航菜单"

[10:05:06] ✏️  tool.use — Edit
           编辑 src/app/page.tsx

[10:05:07] 📝 tool.use — Write
           写入 src/components/NavMenu.tsx

[10:05:10] 💻 tool.use — Bash
           执行 npm test

[10:05:10] ✅ tool.result — Bash
           "3/3 tests passed"

[10:05:12] 📝 task.progress by claude-code (1.8k/0.6k tokens)
           "测试通过，任务完成"

[10:05:12] ✅ task.completed by claude-code
           "添加了响应式导航菜单，所有测试通过"
           累计: 5.3k in / 1.8k out (~$0.03)
```

### 活动时间线组件更新

Tool use 条目用缩进+浅色背景区分，折叠在 progress 下面：

```
┌──────────────────────────────────────────┐
│ [10:05] 📝 我来分析一下项目结构          │
│         (1.2k/0.4k tokens)               │
│   ┌─ 🔍 Glob src/**/*.tsx               │  ← tool_use 缩进展示
│   ├─ 📖 Read src/app/page.tsx            │
│   └─ 📖 Read src/app/layout.tsx          │
│                                          │
│ [10:05] 📝 找到入口文件，添加导航菜单    │
│   ┌─ ✏️ Edit src/app/page.tsx             │
│   └─ 📝 Write src/components/NavMenu.tsx │
│                                          │
│ [10:06] 📝 运行测试                      │
│   ┌─ 💻 Bash: npm test                   │
│   └─ ✅ 3/3 tests passed                 │
│                                          │
│ [10:06] ✅ 完成 (5.3k/1.8k tokens)       │
│         添加了响应式导航菜单              │
└──────────────────────────────────────────┘
```

默认折叠 tool_use 详情，点击展开看完整参数。

---

## 任务启动模式

### 4 种模式

| 模式 | scheduleType | 行为 | 看板卡片显示 |
|------|-------------|------|-------------|
| **手动** | `manual` | 创建后 status=open，等用户点"开始" | `[▶ 开始]` 快捷按钮 |
| **立即开始** | `immediate` | 创建后立即执行 | 自动进入 running |
| **定时** | `scheduled` | 在指定时间执行一次 | "计划 03-17 09:00" |
| **重复** | `recurring` | 按 cron 表达式重复执行 | "每天 09:00 · 下次 03-17" |

### tasks 表对应字段

```typescript
tasks = {
  ...
  // 调度
  scheduleType:      text().default('manual'),  // manual | immediate | scheduled | recurring
  scheduleCron:      text(),                    // cron 表达式 (recurring 用)
  scheduleAt:        integer(),                 // 定时执行时间 (scheduled 用)
  scheduleNextAt:    integer(),                 // 下次执行时间 (recurring 用)
  scheduleLastAt:    integer(),                 // 上次执行时间
  ...
}
```

### 创建流程

```
用户选择启动模式:

手动 (manual)
  → status = 'open'
  → 看板卡片显示 [▶] 快捷开始按钮
  → 用户点击 [▶] 或进抽屉点 "开始执行"

立即开始 (immediate)
  → status = 'open'，创建后立刻触发执行
  → 相当于创建 + 自动点击开始

定时 (scheduled)
  → status = 'open'
  → scheduleAt = 用户选择的时间
  → Scheduler 到时间自动执行
  → 执行完 status = done

重复 (recurring)
  → status = 'open'
  → scheduleCron = '0 9 * * *'
  → scheduleNextAt = 计算下次时间
  → Scheduler 到时间自动执行
  → 完成后 scheduleNextAt = 下一次时间，status 回到 open
```

### 看板卡片上的快捷操作

手动任务在卡片右上角显示 `[▶]` 按钮，一键开始：

```
┌─────────────────────────────┐
│ #12          manual    [▶]  │  ← 点击直接开始
│ 整理本周AI新闻               │
│ Claude Code · 2 min ago     │
└─────────────────────────────┘

┌─────────────────────────────┐
│ #13          recurring  🔄  │
│ 每日新闻检查                 │
│ Claude Code · 下次 09:00    │
└─────────────────────────────┘

┌─────────────────────────────┐
│ #14          ●  running     │  ← 正在执行，脉冲动画
│ 代码审查                     │
│ Claude Code · 1.2k tokens   │
└─────────────────────────────┘
```

所有任务都显示 `startedAt`（如果已开始）。

---

## 全局设置

### settings 表

```typescript
settings = {
  key:    text().primaryKey(),
  value:  text().notNull(),
}
```

### 设置项

| key | 说明 | 默认值 |
|-----|------|--------|
| `defaultWorkingDirectory` | 默认工作/输出目录 | `~/Downloads` |
| `notificationEnabled` | 是否启用通知 | `true` |
| `browserNotificationEnabled` | 是否启用系统通知 | `true` |

### 设置页面

侧边栏增加 ⚙️ Settings 入口：

```
┌──────────────────────────────────┐
│  Settings                        │
│                                  │
│  默认工作目录                     │
│  [/Users/cheche/Downloads    ] 📂│
│  创建任务时的默认文件夹            │
│                                  │
│  通知                            │
│  [✓] 应用内通知 (右下角 Toast)    │
│  [✓] 浏览器系统通知               │
│                                  │
│                        [保存]    │
└──────────────────────────────────┘
```

### API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取所有设置 |
| PATCH | `/api/settings` | 更新设置 |

---

## 通知系统（双层）

### 1. 应用内 Toast 通知（右下角）

参考 Paperclip 的通知组件，在页面右下角弹出 Toast：

```typescript
// src/components/ui/toast.tsx

interface ToastProps {
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  duration?: number  // 默认 5 秒自动消失
}

// Toast 容器固定在右下角
// 多条通知纵向堆叠，最新在上
// 支持手动关闭
```

展示效果：

```
                              ┌────────────────────────────┐
                              │ ✅ Task #12 完成            │
                              │ 整理了8篇AI新闻摘要         │
                              │ 5.3k tokens · 12s          │
                              │                    [查看]   │
                              └────────────────────────────┘
                              ┌────────────────────────────┐
                              │ 🚫 Task #13 需要介入        │
                              │ 需要用户提供 API key         │
                              │                    [查看]   │
                              └────────────────────────────┘
```

"查看" 按钮点击 → 打开对应任务的抽屉。

### 2. 浏览器系统通知（可选）

```typescript
// src/lib/notifications.ts

// 请求权限（首次访问时）
export async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission()
  }
}

// 发送系统通知
export function sendBrowserNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' })
  }
}
```

### SSE 事件触发通知

```typescript
// 在 KanbanBoard / 全局 layout 中监听 SSE：
es.onmessage = (e) => {
  const { event, data } = JSON.parse(e.data)

  if (event === 'task.completed') {
    addToast({ type: 'success', title: `Task #${data.number} 完成`, message: data.summary })
    sendBrowserNotification(`Task #${data.number} 完成`, data.summary)
  }
  if (event === 'task.blocked') {
    addToast({ type: 'warning', title: `Task #${data.number} 需要介入`, message: data.blockReason })
    sendBrowserNotification(`Task #${data.number} 被阻塞`, data.blockReason)
  }
  if (event === 'task.failed') {
    addToast({ type: 'error', title: `Task #${data.number} 失败`, message: data.failReason })
  }

  queryClient.invalidateQueries({ queryKey: ['tasks'] })
}
```

---

## 数据模型变更

### agents 表

```diff
 agents = {
   id:                text().primaryKey(),
   name:              text().notNull().unique(),
   displayName:       text(),
   description:       text(),
-  capabilities:      text(),
-  status:            text().default('idle'),
-  openclawAgentId:   text(),
-  lastSeenAt:        integer(),
+  adapterType:       text().notNull(),           // 'claude-code' | 'openclaw'
+  adapterConfig:     text(),                     // JSON
+  status:            text().default('offline'),   // online | busy | offline
+  version:           text(),
+  lastDetectedAt:    integer(),
   createdAt:         integer().notNull(),
 }
```

### tasks 表

```diff
 tasks = {
   ...
-  priority:          text().default('medium'),
   assigneeAgentId:   text().references(agents.id),
-  assignedBy:        text(),
+  workingDirectory:  text(),                     // 工作/输出目录
+
+  // 调度
+  scheduleType:      text().default('manual'),   // manual | immediate | scheduled | recurring
+  scheduleCron:      text(),                     // cron 表达式 (recurring)
+  scheduleAt:        integer(),                  // 定时执行时间 (scheduled)
+  scheduleNextAt:    integer(),                  // 下次执行时间
+  scheduleLastAt:    integer(),                  // 上次执行时间
   ...
 }
```

### activityLog 表

```diff
 activityLog = {
   ...
+  toolName:          text(),           // "Read" | "Edit" | "Bash" | "Write" | "Glob" | "Grep" | ...
+  toolInput:         text(),           // 工具参数摘要
   ...
 }
```

### 新增 settings 表

```typescript
settings = {
  key:    text().primaryKey(),
  value:  text().notNull(),
}
```

---

## 工作目录选择

### 为什么网页端可行

Next.js API Routes 运行在本地 Node.js 进程中，有完整的 `fs` 模块权限。
FolderPicker 组件通过 HTTP 调用 `GET /api/files/browse`，服务端用 `fs.readdir` 列目录。
跟 CodePilot（也是 Next.js 本地服务）完全一样的原理。

### API

```typescript
// GET /api/files/browse?dir=/Users/cheche/workspace
// Response:
{
  current: '/Users/cheche/workspace',
  parent: '/Users/cheche',
  directories: [
    { name: 'clawtask', path: '/Users/cheche/workspace/clawtask' },
    { name: 'lumiclaw', path: '/Users/cheche/workspace/lumiclaw' },
    ...
  ]
}
```

### FolderPicker 组件

参考 CodePilot 的 `FolderPicker.tsx`：

```
┌──────────────────────────────────┐
│  选择工作目录                      │
│  ┌──────────────────────────┐    │
│  │ /Users/cheche/workspace/  │ 📂 │
│  └──────────────────────────┘    │
│  ↑ 上级目录                       │
│  ┌──────────────────────────────┐│
│  │ 📁 clawtask                  ││
│  │ 📁 lumiclaw                  ││
│  │ 📁 agent-research            ││
│  │ 📁 test                      ││
│  └──────────────────────────────┘│
│                    [取消] [选择]   │
└──────────────────────────────────┘
```

- 手动输入路径：直接在输入框中打字，回车导航
- 记住最近使用的目录
- 默认打开 settings 里配置的 `defaultWorkingDirectory`

### 工作目录的语义

| Agent | 工作目录含义 |
|-------|-------------|
| Claude Code | `cwd` — Claude Code 在这个目录里执行 |
| OpenClaw | 产物输出目录（在 message 中告知 agent） |
| 未设置 | 使用全局设置的 defaultWorkingDirectory |

---

## 新增 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents/detect` | 扫描本地环境，自动注册/更新 agents |
| POST | `/api/tasks/:id/execute` | 触发执行（调 adapter） |
| POST | `/api/tasks/:id/cancel` | 取消正在执行的任务 |
| GET | `/api/files/browse` | 文件夹浏览 |
| GET | `/api/settings` | 获取设置 |
| PATCH | `/api/settings` | 更新设置 |

---

## 项目结构变更

```diff
 src/
   lib/
+    agents/
+      detect.ts               # 自动检测本地 agents
+      claude-code-detect.ts   # Claude Code 二进制检测
+      openclaw-detect.ts      # OpenClaw Gateway 检测
+      adapter.ts              # AgentAdapter 接口定义
+      claude-code-adapter.ts  # Claude Code 执行 adapter
+      openclaw-adapter.ts     # OpenClaw 执行 adapter
+      adapter-manager.ts      # Adapter 注册管理
+      task-executor.ts        # 任务执行器
+      task-scheduler.ts       # 定时/重复任务调度器
+    notifications.ts          # 通知工具
   app/
     api/
+      agents/detect/route.ts
+      tasks/[id]/execute/route.ts
+      tasks/[id]/cancel/route.ts
+      files/browse/route.ts
+      settings/route.ts
+    settings/
+      page.tsx                # 设置页面
   components/
+    ui/toast.tsx              # Toast 通知组件
+    ui/toast-provider.tsx     # Toast 容器（固定右下角）
+    task/folder-picker.tsx    # 文件夹选择器
     task/task-form.tsx        # 修改：启动模式、文件夹选择
     task/task-card.tsx        # 修改：快捷开始按钮、调度信息
     task/task-drawer.tsx      # 修改：执行/取消按钮、tool_use 展示
     task/activity-timeline.tsx # 修改：tool_use 缩进展示、折叠
     board/kanban-board.tsx    # 修改：SSE 触发 Toast + 系统通知
     agent/agent-list.tsx      # 修改：自动检测展示
   app/
     layout.tsx               # 修改：侧边栏加 Settings、全局 Toast Provider
```

---

## UI 变更

### 任务创建表单

```
┌──────────────────────────────────┐
│  新建任务                         │
│                                   │
│  标题 [__________________________]│
│  描述 [__________________________]│
│       [__________________________]│
│                                   │
│  Agent  [▼ Claude Code        ]  │
│                                   │
│  工作目录 [~/Downloads         ] 📂│
│                                   │
│  启动方式                         │
│  ○ 手动 (创建后手动开始)           │
│  ● 立即开始                       │
│  ○ 定时 (指定时间执行一次)         │
│     日期时间 [2026-03-17 09:00]   │
│  ○ 重复 (按 cron 定期执行)        │
│     Cron [0 9 * * *           ]  │
│     = 每天 09:00                  │
│                                   │
│              [取消] [创建]         │
└──────────────────────────────────┘
```

### 侧边栏

```
┌────────────────┐
│  ClawTask       │
├────────────────┤
│  📋 Tasks       │
│  🤖 Agents      │
│  ⚙️ Settings    │  ← 新增
└────────────────┘
```

---

## 实施步骤

### Phase 2a：基础设施

1. 更新 DB schema（agents、tasks、activityLog、settings 表）
2. Toast 通知组件 + Provider
3. 全局设置 API + 设置页面
4. 文件夹浏览 API + FolderPicker 组件
5. 侧边栏增加 Settings

### Phase 2b：Agent 检测

6. Claude Code 二进制检测
7. OpenClaw Gateway 检测
8. `GET /api/agents/detect` + 自动注册
9. 更新 Agents 页面（检测状态、在线指示、重新检测）

### Phase 2c：任务执行

10. AgentAdapter 接口 + AdapterManager
11. Claude Code Adapter（spawn CLI + stream-json + tool_use 解析）
12. OpenClaw Adapter（WebSocket RPC）
13. Task Executor（调 adapter + 写 activityLog + SSE）
14. `POST /api/tasks/:id/execute` + `/cancel`
15. 更新活动时间线：tool_use 缩进展示
16. 更新任务抽屉：执行/取消按钮
17. SSE → Toast 通知 + 浏览器通知

### Phase 2d：调度 + 交互

18. 更新任务创建表单（4 种启动模式 + 文件夹选择）
19. 更新任务卡片（快捷开始按钮、调度信息）
20. Task Scheduler（轮询 scheduled/recurring 任务）
21. 看板所有任务显示 startedAt

### Phase 2e：测试

22. Agent 检测测试
23. Adapter 执行测试（mock spawn）
24. Task Scheduler 测试
25. Toast 组件测试
26. API 集成测试
27. 端到端：创建 → 执行 → tool_use 日志 → 完成 → Toast 通知

---

## Phase 3（体验优化，不变）

- 看板拖拽排序
- Agent 执行统计
- 任务模板
- 移动端适配
- 远程访问

---

## 与 LumiClaw 的边界

| 功能 | ClawTask (开源) | LumiClaw (商业) |
|------|----------------|----------------|
| 任务层级 | 单层 Task | Goal → Plan → Task |
| Agent 来源 | 自动检测本地 | Team Pack 模板安装 |
| 执行 | Adapter (Claude Code / OpenClaw) | 多 Adapter + Identity |
| 调度 | 手动/立即/定时/cron | 优先级 + 依赖 + 预算控制 |
| 预算 | 只展示 token | 自动暂停/告警/分级 |
| 通知 | Toast + 浏览器 | Feishu/Discord/聊天渠道 |
| 部署 | 本地 SQLite | Cloud + Connector + WS sync |
| 认证 | 无 | OAuth + Email OTP |
