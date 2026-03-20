# Sub-Agent 读取 + 项目概念设计

## Claude Code Sub-Agent 事件

### 能读取到吗？

**能。** Claude Code 的 `stream-json` 输出包含完整的 sub-agent 生命周期事件：

```json
// 1. 子任务启动
{
  "type": "system",
  "subtype": "task_started",
  "task_id": "aff54ef91c4b9aeb5",
  "description": "List files in /tmp",
  "task_type": "local_agent",      // agent 类型: general-purpose, Explore, Plan 等
  "prompt": "实际发给子 agent 的 prompt",
  "session_id": "3aeef9f1-..."     // 子 agent 独立的 session
}

// 2. 子任务进展（每次子 agent 调用工具时）
{
  "type": "system",
  "subtype": "task_progress",
  "task_id": "aff54ef91c4b9aeb5",
  "description": "Running List all files in /tmp",
  "last_tool_name": "Bash",        // 子 agent 最近用的工具
  "usage": {
    "total_tokens": 21657,
    "tool_uses": 1,
    "duration_ms": 2352
  }
}

// 3. 子任务完成
{
  "type": "system",
  "subtype": "task_notification",
  "task_id": "aff54ef91c4b9aeb5",
  "status": "completed",
  "summary": "List files in /tmp",
  "usage": {
    "total_tokens": 26627,
    "tool_uses": 2,
    "duration_ms": 11508
  }
}
```

### 在 LumiTask adapter 中怎么处理

```typescript
// claude-code-adapter.ts 的 handleStreamEvent 中：

if (event.type === 'system') {
  if (event.subtype === 'task_started') {
    onEvent({
      type: 'tool_use',
      message: `🤖 子任务启动: ${event.description}`,
      toolName: 'Agent',
      toolInput: `type=${event.task_type} task_id=${event.task_id}`,
      timestamp: Date.now(),
    })
  }
  if (event.subtype === 'task_progress') {
    onEvent({
      type: 'progress',
      message: `🤖 子任务进展: ${event.description} (${event.last_tool_name})`,
      inputTokens: event.usage?.total_tokens,
      timestamp: Date.now(),
    })
  }
  if (event.subtype === 'task_notification' && event.status === 'completed') {
    onEvent({
      type: 'progress',
      message: `🤖 子任务完成: ${event.summary} (${(event.usage?.duration_ms/1000).toFixed(1)}s, ${event.usage?.tool_uses} tools)`,
      timestamp: Date.now(),
    })
  }
}
```

---

## OpenClaw Session + 项目概念

### 现状问题

当前所有 OpenClaw 任务共享 `agent:main:main` session：
- 任务 A 和 任务 B 在同一个 session 上下文中
- 旺财能记住之前的对话（有利于"按照之前的规则"这种指令）
- 但不同主题的任务会互相干扰

### 你的想法：项目 → Session 映射

```
同一项目的任务 → 共享一个 session（保持上下文）
不同项目的任务 → 用不同 session（隔离上下文）
未指定项目     → 用默认 session (main)
```

### 我的建议：可以做，但要分步

**第一步（现在）：session-id 参数化**

OpenClaw adapter 支持 `--session-id` 参数：
```bash
openclaw agent --agent main --session-id "project-website" --message "..."
openclaw agent --agent main --session-id "project-data" --message "..."
```

同一个 `session-id` 的对话共享上下文，不同的隔离。

实现：
```typescript
// tasks 表加字段
projectId: text("project_id")  // 可选，关联项目

// OpenClaw adapter 使用 projectId 作为 session-id
const sessionId = context.projectId
  ? `lumitask-project-${context.projectId}`
  : 'main'  // 默认用 main session

const args = ['agent', '--agent', agentId, '--session-id', sessionId, '--message', prompt, '--json']
```

**第二步（后续）：项目管理**

```
项目 = 一组共享上下文的任务

projects 表:
  id, name, description, defaultAgent, sessionId, createdAt

UI:
  创建任务时可选择项目
  同项目的任务共享 OpenClaw session
  项目页面看到该项目下所有任务
```

### 数据模型

```typescript
// 新增 projects 表
projects = {
  id:          text().primaryKey(),
  name:        text().notNull(),
  description: text(),
  agentId:     text().references(agents.id), // 默认 agent
  sessionKey:  text(),                       // OpenClaw session key
  createdAt:   integer().notNull(),
}

// tasks 表加字段
tasks = {
  ...existing,
  projectId: text().references(projects.id),  // 可选
}
```

### 用户体验

```
创建任务时：
  标题: [整理下载文件夹]
  项目: [▼ 日常事务]          ← 选择项目（可选）
  智能体: [🐶 旺财]

如果选了"日常事务"项目：
  → openclaw agent --session-id "lumitask-daily" --message "..."
  → 旺财在 "daily" session 中执行，记得之前的规则

如果没选项目：
  → openclaw agent --session-id "main" --message "..."
  → 用默认 session

在 Skill 中：
  用户说 "在网站项目里，帮我改一下首页"
  → lumitask create --title "改首页" --project website --schedule immediate
```

### 关于项目在产品中的定位

项目不应该是重量级的概念（不是 Jira 那种）。更像是一个**上下文标签**：

- 用户不需要主动"创建项目"
- 可以在创建任务时随手输入一个项目名
- 同名的自动归为同一项目
- 本质是给 OpenClaw session 分组

---

## 实施建议

### 立即做的
1. Claude Code adapter 增加 `task_started/task_progress/task_notification` 事件处理
2. OpenClaw adapter 时间戳过滤（只显示当前任务的消息）

### 下一步做的
3. tasks 表加 `projectId` 字段
4. OpenClaw adapter 支持 `--session-id` 参数化
5. 创建任务表单加项目选择

### 后续做的
6. 项目管理页面
7. 项目下的任务聚合视图
8. 项目级别的 token/cost 统计
