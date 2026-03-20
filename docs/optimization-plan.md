# LumiTask 优化方案 — 对标 Paperclip 实现

## 问题根因

### SSE 实时推送不工作
`eventBus.broadcast` 发送命名事件 `event: task.progress\ndata: ...`，但前端 `es.onmessage` 只接收无名事件。所以运行中前端收不到推送。

### 活动日志不动态更新
SSE 不工作 + 没有 fallback 轮询 + 没有自动滚动。

### 缺少评论交互
没有评论系统，agent 无法向用户提问，用户无法回复。

### 文件夹选择不可用
文本输入框，用户不知道路径。

---

## 实现方案（对标 Paperclip）

### 一、SSE 修复 + 实时日志

**参考 Paperclip 的 `LiveUpdatesProvider`**：
- WebSocket + 指数退避重连（1s→15s cap）
- 重连后 suppress toast 防噪
- 按 event.type 做精确的 React Query invalidation

**LumiTask 简化方案**（用 SSE 代替 WebSocket）：

```typescript
// src/lib/events.ts — 修改 broadcast 为无名事件
broadcast(event: string, data: unknown) {
  const payload = `data: ${JSON.stringify({
    event,
    ...(typeof data === 'object' && data !== null ? data : { value: data })
  })}\n\n`
  for (const client of this.clients) {
    try { client.write(payload) } catch { this.clients.delete(client) }
  }
}
```

**前端 SSE 监听**（参考 Paperclip 的 `handleLiveEvent` 精确 invalidation）：

```typescript
// 全局 SSE hook — 放在 layout 级别，所有页面共享一个连接
function useSSE() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    const connect = () => {
      es = new EventSource('/api/events')

      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          const { event, taskId, number } = data

          // 精确 invalidation（参考 Paperclip cascading invalidation）
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          if (taskId) {
            queryClient.invalidateQueries({ queryKey: ['task', taskId] })
          }

          // Toast 通知（参考 Paperclip gated toast）
          if (event === 'task.completed') {
            addToast({ type: 'success', title: `Task #${number} 完成`,
              message: data.summary,
              action: { label: '查看', onClick: () => /* open drawer */ }
            })
          } else if (event === 'task.failed') {
            addToast({ type: 'error', title: `Task #${number} 失败`, message: data.error })
          } else if (event === 'task.blocked') {
            addToast({ type: 'warning', title: `Task #${number} 需要介入` })
          }

          reconnectAttempt = 0
        } catch {}
      }

      es.onerror = () => {
        es?.close()
        scheduleReconnect()
      }
    }

    // 指数退避重连（照搬 Paperclip）
    const scheduleReconnect = () => {
      reconnectAttempt++
      const delay = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 4))
      reconnectTimer = window.setTimeout(connect, delay)
    }

    connect()
    return () => {
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [queryClient, addToast])
}
```

### 二、任务详情 — Tabs 布局（对标 Paperclip IssueDetail）

**Paperclip 的 IssueDetail 结构**：
- Header：状态/优先级/标识/Live 徽标
- Inline editor：标题、描述
- Tabs：💬 Comments & Runs | 📋 Sub-issues | 📊 Activity
- Comments tab 内嵌 `LiveRunWidget`（实时执行日志）
- 可折叠区域：Linked Approvals、Cost Summary

**LumiTask 的对标实现**：

```
┌──────────────────────────────────────┐
│ #5 整理本周AI新闻              [✕]   │ ← 固定头部
│ 🟢 running  ⚡ Immediate             │
│ Agent: Claude Code                    │
│ 📁 /Users/cheche/workspace/news      │
│ [■ Stop]                             │
├──────────────────────────────────────┤
│ [💬 Comments (2)] [📋 Logs (15)]     │ ← Tab 切换
├──────────────────────────────────────┤
│                                      │ ← 可滚动区域
│ (Tab 内容)                           │
│                                      │
└──────────────────────────────────────┘
```

#### Comments Tab（对标 Paperclip CommentThread）

**参考 Paperclip 的关键模式**：
- 评论 + 执行记录合并时间线（`TimelineItem` discriminated union）
- 输入框支持草稿持久化（800ms debounce → localStorage）
- 可选 reassign（发评论同时改 agent）
- 如果 issue 已关闭，可选 "Re-open" checkbox

**LumiTask 的 Comments Tab**：

```
Timeline:
┌──────────────────────────────────────┐
│ 🤖 claude-code · 2 min ago          │ ← agent 评论
│ 任务开始执行，预计 30 秒完成          │
│                                      │
│ ── 执行记录 Run #abc123 ──           │ ← 内嵌执行卡片
│ ✅ 完成 | 1 turn | 2.1s | $0.04    │
│                                      │
│ 🤖 claude-code · 1 min ago          │
│ ⚠️ 需要你提供 Perplexity API key     │ ← 请求输入
│                                      │
│ 👤 you · just now                    │ ← 用户回复
│ pplx-xxx-yyy                         │
└──────────────────────────────────────┘

输入区:
┌──────────────────────────────────────┐
│ [输入评论...]                         │
│                           [发送]     │
│          [发送并继续执行] ← blocked时  │
└──────────────────────────────────────┘
```

#### Logs Tab（对标 Paperclip LiveRunWidget）

**参考 Paperclip 的关键模式**：
- 单色调终端风格（font-mono, text-[11px]）
- 不同 tone 用不同颜色：error=红色, warn=琥珀色, assistant=绿色, tool=青色
- 时间戳 + agent 名 + 运行 ID + 消息
- 流式合并相邻 assistant 消息块
- 去重（dedupeKey）
- 自动滚动到底部（`useEffect` on feed.length）
- 最新条目有 `animate-in fade-in slide-in-from-bottom` 动画
- Max 80 条，FIFO
- Fallback 轮询：每 2s 读取一次持久化日志

**LumiTask 的 Logs Tab**：

```typescript
// 紧凑终端风格
<div ref={logsRef} className="font-mono text-[11px] space-y-0.5 max-h-full overflow-y-auto p-3">
  {logs.map((log, i) => (
    <div key={log.id} className={cn(
      "grid grid-cols-[auto_1fr] gap-2",
      i === logs.length - 1 && "animate-in fade-in slide-in-from-bottom-1 duration-300",
    )}>
      <span className="text-[10px] text-zinc-600 whitespace-nowrap">
        {formatTime(log.createdAt)}
      </span>
      <div className={cn("min-w-0 break-words",
        log.action === 'task.started' && "text-purple-400",
        log.action === 'task.completed' && "text-green-400",
        log.action === 'task.failed' && "text-red-400",
        log.action === 'tool.use' && "text-cyan-400/70",
        log.action === 'task.progress' && "text-zinc-300",
      )}>
        {logIcon(log)} {log.message}
        {log.inputTokens && (
          <span className="text-zinc-600"> ({log.inputTokens}/{log.outputTokens})</span>
        )}
      </div>
    </div>
  ))}

  {/* Running 时显示脉冲 */}
  {isRunning && (
    <div className="flex items-center gap-2 py-2 text-purple-400">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute h-full w-full rounded-full bg-purple-400 opacity-75" />
        <span className="relative h-2 w-2 rounded-full bg-purple-400" />
      </span>
      <span className="text-[11px]">Agent is working...</span>
    </div>
  )}
</div>
```

**自动滚动（照搬 Paperclip）**：
```typescript
useEffect(() => {
  const el = logsRef.current
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}, [logs.length])
```

**Fallback 轮询（参考 Paperclip 的 2s polling）**：
```typescript
const { data: task } = useQuery({
  queryKey: ['task', taskId],
  queryFn: () => fetchTask(taskId),
  refetchInterval: task?.status === 'running' ? 2000 : false, // running 时 2s 轮询
})
```

### 三、评论系统

#### 数据模型

```typescript
// activityLog 表已有 action='comment' 的支持
// 用 activityLog 存评论（不新建表），action 值区分：
//   'comment.user'   — 用户评论
//   'comment.agent'  — agent 评论/提问
//   'comment.system' — 系统消息
```

#### API

```
POST /api/tasks/:id/comments
  Body: { body: string, authorType: 'user'|'agent', authorId?: string }
  → 插入 activityLog（action='comment.user'）
  → 如果任务是 blocked 且 body 包含内容 → 可选自动 unblock

GET /api/tasks/:id — 已有，返回 activityLog（过滤区分 comments vs logs）
```

#### 前端区分 comments vs logs

```typescript
const comments = activityLog.filter(a =>
  a.action.startsWith('comment.') ||
  a.action === 'task.blocked'  // blocked 原因也显示在评论区
)

const logs = activityLog.filter(a =>
  !a.action.startsWith('comment.') &&
  a.action !== 'task.blocked'
)
```

### 四、Agent-用户交互（MVP）

**流程**：
1. Agent 在执行中遇到 `AskUserQuestion` tool_use
2. Adapter 检测到 → 设置任务 blocked + 自动创建 comment.agent
3. 用户在 Comments tab 看到提问 + Toast 通知
4. 用户输入回复 + 点击 "发送并继续"
5. 后端：添加 comment.user + 修改 description 追加用户回复 + reopen + re-execute

**"发送并继续" — stdin 直接交互**：

Claude Code 的 `--output-format stream-json` 模式下，进程的 stdin 保持开放。当 agent 调用 `AskUserQuestion` 时，进程会暂停等待 stdin 输入。

```
用户在评论区输入回复 → POST /api/tasks/:id/reply { body }
  → 后端找到该任务的运行中 ChildProcess
  → proc.stdin.write(JSON.stringify({ type: 'user_response', text: body }) + '\n')
  → agent 收到输入继续执行
  → 任务从 blocked 恢复为 running
```

**Adapter 端实现**：

```typescript
// claude-code-adapter.ts
class ClaudeCodeAdapter {
  private runningProcesses = new Map<string, ChildProcess>()

  // stdin 保持为 'pipe' 而非 'ignore'
  spawn('bash', ['-c', cmd], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],  // stdin 开放
  })

  // 当检测到 AskUserQuestion tool_use：
  // 1. 任务标记 blocked
  // 2. 创建 comment.agent（agent 的提问）
  // 3. 等待用户通过 reply API 回复

  // 用户回复时：
  async reply(taskId: string, text: string): Promise<void> {
    const proc = this.runningProcesses.get(taskId)
    if (!proc?.stdin?.writable) throw new Error('Process not available')
    proc.stdin.write(text + '\n')
    // 任务恢复 running
  }
}
```

**API 端点**：

```
POST /api/tasks/:id/reply
  Body: { body: string }
  → 找到 adapter，调用 adapter.reply(taskId, body)
  → 添加 comment.user
  → 更新状态 blocked → running
  → 返回 200
```

**前端交互**：

```
blocked 状态时，评论输入框变为高亮：
┌──────────────────────────────────────┐
│ 🤖 claude-code · just now           │
│ ⚠️ 需要你提供 Perplexity API key     │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 输入回复...                       │ │ ← 高亮边框，自动聚焦
│ └──────────────────────────────────┘ │
│              [发送并继续执行 ▶]       │ ← 发送 reply + 恢复执行
└──────────────────────────────────────┘
```

**Fallback**：如果 stdin 不可用（进程已退出），则走 "重新执行" 路径：
- 追加用户回复到 description
- reopenTask + executeTask

### 五、文件夹选择优化

**现状**：文本输入框。
**改为**：点击触发 FolderPicker 的大按钮区域。

```
未选择状态:
┌──────────────────────────────────────┐
│ 📁 点击选择工作目录                    │ ← 整个区域可点击
│    默认使用 ~/Downloads               │
└──────────────────────────────────────┘

已选择状态:
┌──────────────────────────────────────┐
│ 📁 /Users/cheche/workspace/lumitask  │ ← 点击重新选择
│    ✕ 清除                            │
└──────────────────────────────────────┘
```

**FolderPicker 优化**：
- 单击文件夹 = 进入该目录
- 显示完整路径面包屑
- 底部 "选择此目录" 确认按钮
- 默认打开 settings.defaultWorkingDirectory

---

## 实施步骤

### 第 1 步：修复 SSE + 实时日志（核心问题）
1. 修改 `events.ts` broadcast 为无名事件格式
2. 创建全局 `useSSE` hook（指数退避重连 + 精确 invalidation + toast）
3. 抽屉 running 状态加 `refetchInterval: 2000`
4. Logs 列表自动滚动 + 最新条目动画

### 第 2 步：抽屉改 Tabs（Comments + Logs）
5. 抽屉内容区改为 Tabs 组件
6. Logs tab：终端风格 + 颜色分级 + running 脉冲动画
7. Comments tab：评论列表 + 输入框
8. POST /api/tasks/:id/comments 端点

### 第 3 步：文件夹选择优化
9. 创建任务表单：工作目录改为点击区域触发 FolderPicker
10. FolderPicker 改为单击进入、底部确认
11. Settings 同步优化

### 第 4 步：Agent-用户交互（stdin 直接通信）
12. Adapter spawn 改为 `stdio: ['pipe', 'pipe', 'pipe']`，保持 stdin 开放
13. Adapter 检测 `AskUserQuestion` tool_use → blocked + auto comment.agent
14. Adapter 新增 `reply(taskId, text)` 方法 → 向 proc.stdin 写入用户回复
15. `POST /api/tasks/:id/reply` 端点
16. Comments tab：blocked 时输入框高亮 + 自动聚焦 + "发送并继续执行" 按钮
17. Fallback：stdin 不可用时走 reopen + re-execute 路径
