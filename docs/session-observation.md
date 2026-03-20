# LumiTask Session 观察机制分析

## 回答核心问题

### Q1：长任务触发后，能通过 session 观察到并记录吗？

**能。** Session JSONL 文件实时写入，每条消息都是一行 JSON。

数据位置：`~/.openclaw/agents/{agentId}/sessions/{sessionId}.jsonl`

Session index：`~/.openclaw/agents/{agentId}/sessions/sessions.json`
- 包含每个 session 的 `sessionId`、`updatedAt`、`chatType`

**观察方式**：
1. 监控 session 文件的 `updatedAt` 时间戳（每次对话都更新）
2. tail 读取 JSONL 文件最后 N 行
3. 解析每行 JSON 获取消息内容

### Q2：长任务的过程是否都会在 session 中出现？

**是的，全部都有。** 经验证，session JSONL 包含：

| 类型 | role | content.type | 示例 |
|------|------|-------------|------|
| 用户消息 | `user` | `text` | "帮我查天气" |
| AI 思考 | `assistant` | `thinking` | 内部推理过程 |
| AI 文本回复 | `assistant` | `text` | "杭州今天小雨..." |
| 工具调用 | `assistant` | `toolCall` | 调用 exec/read/write/web_search 等 |
| 工具结果 | `toolResult` | `text` | 工具返回的数据 |
| 子 agent 派遣 | `assistant` | `toolCall` (sessions_spawn) | 派遣子任务 |

**实际数据示例**：
```
[18:33:29] user: 立即执行：写一篇md输出到 ~/Downloads
[18:33:36] assistant: [thinking + text + toolCall(write)]
           "我现在就执行这条任务，把文件写到 ~/Downloads"
[18:33:36] toolResult: write → Successfully wrote 7 bytes to ~/Downloads/成功创建了.md
[18:33:40] assistant: [text] "已执行。文件位置：~/Downloads/成功创建了.md"
```

### Q3：子 agent 的任务呢？

**OpenClaw 支持子 agent（通过 `sessions_spawn` 工具）。**

当前环境有 3 个 agent：
- `main`（🐶 旺财）— 主 agent
- `lumi-xhs`（✨）— 小红书
- `lumi-wechat-mp` — 微信公众号

子 agent 通过 `sessions_spawn` 工具调用，会创建新的 session。
子 session 同样写入独立的 JSONL 文件，可以用同样的方式监控。

**父子关系**：
- 父 session 中有 `sessions_spawn` 的 toolCall 记录
- 子 session 的 key 包含父 session 信息
- Control Center 通过 "Execution Chain Inference" 追踪父子关系

---

## LumiTask 的 Session 观察方案

### 方案：轮询 + Tail 读取

```
每 5 秒:
  1. 读取 sessions.json → 获取所有活跃 session
  2. 对比上次快照 → 找出 updatedAt 变化的 session
  3. 对变化的 session → tail 读取 JSONL 最后 N 行
  4. 解析新消息 → 写入 LumiTask activityLog
  5. 推送 SSE → 前端实时显示
```

### 数据映射

```typescript
// Session JSONL 行 → LumiTask ActivityLogEntry

{
  // OpenClaw session message
  type: "message",
  timestamp: "2026-03-17T18:33:36.454Z",
  message: {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "..." },
      { type: "text", text: "我来查一下天气" },
      { type: "toolCall", toolCallId: "...", toolName: "exec", input: {...} }
    ]
  }
}

↓ 映射为 ↓

// LumiTask activity log entries
[
  { action: "task.progress", message: "我来查一下天气", actorId: "旺财" },
  { action: "tool.use", toolName: "exec", toolInput: "curl wttr.in/...", actorId: "旺财" },
]
```

### 需要的 API

```
GET /api/openclaw/sessions
  → 读取 sessions.json，返回活跃 session 列表

GET /api/openclaw/sessions/:sessionId/tail?lines=20
  → 读取 JSONL 文件最后 20 行，解析返回消息列表
```

### 长任务无进度时的处理

```
如果 session updatedAt 在 30 秒内没有变化，但任务仍是 running：
  → 说明 agent 可能在等待（API 调用、长时间思考）
  → LumiTask 显示: "Agent 正在处理中... (45s)"

如果超过 5 分钟没有变化：
  → 可能卡住了
  → LumiTask 通过 Toast 通知用户: "任务 #12 已运行 5 分钟无进展"
  → 如果配置了提醒，通过 OpenClaw 发消息给用户
```

### 子 Agent 任务追踪

```
主 agent (旺财) 执行任务
  ↓
调用 sessions_spawn 派遣子 agent
  ↓
LumiTask 检测到新的子 session
  ↓
在任务详情中显示:
  "📋 主任务: 整理社交媒体内容"
  "  └─ 🧵 子任务: lumi-xhs 在处理小红书内容"
  "  └─ 🧵 子任务: lumi-wechat-mp 在处理公众号内容"
```

---

## 总结

| 问题 | 答案 |
|------|------|
| 能观察到长任务进度吗？ | ✅ 能，session JSONL 实时写入 |
| 工具调用会记录吗？ | ✅ 会，toolCall + toolResult 都在 |
| AI 思考过程有吗？ | ✅ 有 thinking 类型 |
| 子 agent 能追踪吗？ | ✅ 能，通过 sessions_spawn + 子 session 文件 |
| 能实时推送吗？ | ✅ 能，轮询 + tail + SSE |
| 卡住了能通知吗？ | ✅ 能，检测 updatedAt 停滞 → 通知用户 |
