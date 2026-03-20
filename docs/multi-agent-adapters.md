# LumiTask 多 Agent Adapter 方案 + 子任务设计

## 调研结论

通过分析 Paperclip 的 6 个 adapter 实现，所有本地 agent 的调用模式高度统一：

```
spawn CLI进程 → stdin 传入 prompt → stdout 流式读取 JSONL → 解析 token/结果
```

| Agent | CLI 命令 | 输出格式 | Session 恢复 | 子任务支持 |
|-------|---------|---------|-------------|----------|
| **Claude Code** | `claude --print --output-format stream-json` | stream-json (逐行JSON) | `--resume <id>` | ✅ task_started/progress/notification |
| **Codex** | `codex exec --json` | JSONL | `resume <id> -` | ❌ 无子任务事件 |
| **Cursor** | `agent -p --output-format stream-json` | stream-json | `--resume <id>` | ❌ 无子任务事件 |
| **OpenCode** | `opencode run --format json` | JSON | 无 | ❌ |
| **Pi** | `pi` | JSONL | 文件存储 | ❌ |
| **OpenClaw** | `openclaw agent --json` | JSON（一次性） | `--session-id` | ✅ sessions_spawn |

### 核心发现

1. **所有 agent 的 CLI 调用模式一样**：spawn → stdin → stdout → parse
2. **只有 Claude Code 有 stream-json 子任务事件**（task_started/progress/notification）
3. **Paperclip 不自动创建子任务** — DB 有 parentId 字段，但 adapter 不自动写入
4. **Session 恢复是通用模式** — 大部分 agent 支持 `--resume` 继续上一次的上下文
5. **Prompt 注入** — 所有 adapter 都支持通过文件注入额外指令（skills 目录）

---

## LumiTask Adapter 扩展方案

### 现有 Adapter

| Adapter | 状态 | 实时日志 |
|---------|------|---------|
| **Claude Code** | ✅ 已实现 | ✅ stream-json 实时 |
| **OpenClaw** | ✅ 已实现 | ⚠️ session tail 读取（5s延迟） |

### 可扩展的 Adapter

#### Codex Adapter

```typescript
class CodexAdapter implements AgentAdapter {
  type = 'codex'

  async execute(context, onEvent) {
    // codex exec --json --dangerously-bypass-approvals-and-sandbox -p "prompt"
    const proc = spawn('codex', [
      'exec', '--json',
      '--dangerously-bypass-approvals-and-sandbox',
      ...(context.model ? ['--model', context.model] : []),
      '-', // read from stdin
    ], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })

    proc.stdin.write(prompt)
    proc.stdin.end()

    // Parse JSONL output (similar to Claude, different format)
    // Codex has rollout noise that needs filtering
  }
}
```

#### Cursor Adapter

```typescript
class CursorAdapter implements AgentAdapter {
  type = 'cursor'

  async execute(context, onEvent) {
    // agent -p --output-format stream-json --workspace /path --yolo
    const proc = spawn('agent', [
      '-p',
      '--output-format', 'stream-json',
      '--workspace', cwd,
      '--yolo', // auto-approve
    ], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })

    proc.stdin.write(prompt)
    proc.stdin.end()

    // Parse stream-json (same format as Claude Code)
  }
}
```

### Adapter 通用化

所有 CLI agent 的核心逻辑一样，可以抽象为一个基类：

```typescript
abstract class CLIAgentAdapter implements AgentAdapter {
  abstract buildCommand(context: TaskContext): { cmd: string; args: string[]; cwd: string }
  abstract parseOutput(line: string): ExecutionEvent | null

  async execute(context, onEvent) {
    const { cmd, args, cwd } = this.buildCommand(context)
    const proc = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })

    // 通用的 stdout 逐行读取 + 解析
    proc.stdout.on('data', chunk => {
      for (const line of chunk.toString().split('\n')) {
        const event = this.parseOutput(line)
        if (event) onEvent(event)
      }
    })

    // 通用的超时、取消、进程管理
  }
}

class ClaudeCodeAdapter extends CLIAgentAdapter {
  buildCommand(ctx) {
    return {
      cmd: 'claude',
      args: ['--print', '--output-format', 'stream-json', '--verbose', '-p', ctx.title],
      cwd: ctx.workingDirectory || process.env.HOME
    }
  }
  parseOutput(line) {
    const event = JSON.parse(line)
    // Claude-specific parsing...
  }
}

class CodexAdapter extends CLIAgentAdapter {
  buildCommand(ctx) {
    return {
      cmd: 'codex',
      args: ['exec', '--json', '-'],
      cwd: ctx.workingDirectory || process.env.HOME
    }
  }
  parseOutput(line) {
    // Codex-specific JSONL parsing...
  }
}
```

### 自动检测扩展

```typescript
// detect.ts 扩展
async function detectLocalAgents() {
  // 现有: Claude Code, OpenClaw
  // 新增:
  if (await which('codex')) agents.push({ type: 'codex', name: 'codex', ... })
  if (await which('agent')) agents.push({ type: 'cursor', name: 'cursor', ... }) // Cursor Agent CLI
  if (await which('opencode')) agents.push({ type: 'opencode', name: 'opencode', ... })
}
```

---

## 子任务设计

### Claude Code 的子任务事件

Claude Code 的 `Agent` 工具会产生三种事件：

```
task_started     → 子 agent 启动（含 task_id, description, task_type, prompt）
task_progress    → 子 agent 调用工具（含 last_tool_name, token 用量, 耗时）
task_notification → 子 agent 完成/失败（含 status, summary, 总 token, 总耗时）
```

### 是否自动创建子任务？

**建议：不自动创建 DB 记录，而是在日志中展示**

原因：
1. Claude Code 的 sub-agent 是短暂的（通常几秒到几十秒），不需要独立跟踪
2. 一个复杂任务可能 spawn 5-10 个 sub-agent，自动创建会导致任务列表膨胀
3. Paperclip 也没有自动创建子任务，只在 DB 层支持 parentId

### 日志展示方案

在任务详情的 Logs tab 中，子任务以缩进 + 分组方式展示：

```
13:08:39  ▶️  Claude Code 开始执行
13:08:42  📝  我来分析一下项目结构
13:08:43  🤖  ┌ 子任务启动: Explore 项目文件结构
13:08:44  🤖  │ 📖 Read src/app/page.tsx
13:08:44  🤖  │ 🔍 Glob src/**/*.tsx (12 files)
13:08:46  🤖  └ 子任务完成 (3.2s, 2 tools, 21.6k tokens)
13:08:47  📝  找到 12 个组件文件，开始修改...
13:08:48  🤖  ┌ 子任务启动: 修改导航组件
13:08:49  🤖  │ ✏️ Edit src/components/Nav.tsx
13:08:50  🤖  │ 📝 Write src/components/NavMenu.tsx
13:08:52  🤖  └ 子任务完成 (4.1s, 2 tools)
13:08:53  ✅  任务完成 | 3 turns | 14s | $0.08
```

### 实现

```typescript
// claude-code-adapter.ts handleStreamEvent 增加:

if (event.type === 'system') {
  switch (event.subtype) {
    case 'task_started':
      onEvent({
        type: 'tool_use',
        message: `🤖 子任务启动: ${event.description}`,
        toolName: 'SubAgent',
        toolInput: `type=${event.task_type} id=${event.task_id}`,
        timestamp: Date.now(),
      })
      break

    case 'task_progress':
      onEvent({
        type: 'tool_use',
        message: `🤖 │ ${event.last_tool_name}: ${event.description}`,
        toolName: event.last_tool_name,
        toolInput: `subtask=${event.task_id} tokens=${event.usage?.total_tokens}`,
        timestamp: Date.now(),
      })
      break

    case 'task_notification':
      const dur = event.usage?.duration_ms
        ? `${(event.usage.duration_ms / 1000).toFixed(1)}s`
        : ''
      const tools = event.usage?.tool_uses || 0
      onEvent({
        type: 'progress',
        message: `🤖 子任务${event.status === 'completed' ? '完成' : '失败'}: ${event.summary} (${dur}, ${tools} tools)`,
        inputTokens: event.usage?.total_tokens,
        timestamp: Date.now(),
      })
      break
  }
}
```

### 如果用户确实需要独立的子任务

提供一个**可选的手动拆分机制**：

```
用户在任务详情中，可以手动拆分子任务：
  任务 #12: 整理社交媒体内容
    [+ 添加子任务]

子任务：
  #12-1: 整理小红书内容    → 分配给 lumi-xhs
  #12-2: 整理公众号内容    → 分配给 lumi-wechat-mp

子任务有独立的 agent、独立的执行日志
完成后归入父任务
```

数据模型：tasks 表已有 `parentTaskId` 概念（Phase 1 schema 里定义过但后来去掉了），需要时加回来：

```typescript
// tasks 表加字段
parentTaskId: text("parent_task_id").references(() => tasks.id)
```

**但这是后续功能**，当前优先用日志展示子任务事件。

---

## OpenClaw 子 Agent (sessions_spawn)

OpenClaw 的子 agent 机制不同于 Claude Code：

```
旺财 (main agent) 调用 sessions_spawn
  → 创建新的 session（独立的 session key）
  → 子 agent (如 lumi-xhs) 在新 session 中执行
  → 结果通过 sessions_send 返回父 session
```

### 在 LumiTask 中追踪

```
Session Observer 检测到新的 session 出现
  → 如果 session key 包含父 session 的引用
  → 在 Now 面板显示:
    📋 旺财: 整理社交媒体内容
      └─ 🧵 lumi-xhs: 处理小红书内容 (running 30s)
      └─ 🧵 lumi-wechat-mp: 处理公众号内容 (idle)
```

这部分依赖 session observer 的能力，不需要 adapter 层面的改动。

---

## 总结：实施路线

### 立即做
1. Claude Code adapter 增加 `task_started/task_progress/task_notification` 事件解析
2. OpenClaw adapter 时间戳过滤（只显示当前任务的消息）

### 下一步
3. Adapter 基类抽象（CLIAgentAdapter）
4. Codex adapter（如果检测到 codex CLI）
5. Cursor adapter（如果检测到 agent CLI）
6. 自动检测扩展

### 后续
7. 项目概念（session 分组）
8. 手动子任务拆分
9. OpenClaw sessions_spawn 追踪
