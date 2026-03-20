# LumiTask × OpenClaw 完整集成方案

## 现状盘点

### CLI 已完成 ✅
LumiTask CLI 功能完整，可以通过 `npx tsx cli/index.ts` 操作所有任务：
- `create` / `list` / `show` / `assign` / `start` / `complete` / `block` / `fail` / `reopen` / `log` / `artifact`
- `agent register` / `agent list` / `agent checkin`

### OpenClaw Adapter 基础版 ✅
- 自动检测 OpenClaw binary + Gateway
- 通过 `openclaw agent --message "..." --print` 执行任务
- 但没有 stream-json 解析（OpenClaw 没有这个输出格式）
- 没有 token/cost 追踪

### 未完成 ❌
1. **CLI 未打包发布** — 不能直接 `lumitask create`，要用 `npx tsx cli/index.ts`
2. **OpenClaw Skill 未创建** — agent 不知道 lumitask 存在
3. **Cron 巡检未配置** — 没有定时检查未分配任务
4. **OpenClaw 执行没有实时日志** — 只有最终 stdout
5. **CLI 没有 npm 全局安装** — 需要打包

---

## 集成计划

### Phase A：CLI 打包 + 全局安装

**目标**：让 `lumitask` 命令在终端全局可用。

```bash
# 用户安装
npm install -g lumitask
# 或开发时
pnpm link --global
```

**实现**：

1. 把 `cli/index.ts` 编译为 JS（用 tsup 或 tsx）
2. `package.json` 的 `bin` 字段指向编译后的入口
3. 添加 `#!/usr/bin/env node` shebang
4. 添加 npm script：`"build:cli": "tsup cli/index.ts --outDir cli/dist --format esm"`

**或者更简单**：直接用 tsx 运行，创建一个 shell wrapper：

```bash
# ~/.local/bin/lumitask
#!/bin/bash
LUMITASK_DIR="/Users/cheche/workspace/lumitask"
exec npx --prefix "$LUMITASK_DIR" tsx "$LUMITASK_DIR/cli/index.ts" "$@"
```

### Phase B：创建 OpenClaw Skill

**目标**：OpenClaw agent 在对话中可以直接使用 lumitask 命令。

**文件**：`~/.openclaw/skills/lumitask/SKILL.md`（或发布到 clawhub）

```markdown
---
name: lumitask
description: >
  Manage tasks on LumiTask board. Create tasks, list pending tasks,
  check task status, log progress, and complete tasks.
  Use when the user asks to "record a task", "check tasks",
  "create a todo", or when you need to track work items.
metadata:
  openclaw:
    emoji: "📋"
    requires:
      bins: ["lumitask"]
    install:
      - id: npm
        kind: node
        package: lumitask
        bins: ["lumitask"]
        label: "Install LumiTask CLI (npm)"
---

# LumiTask — Agent 任务管理

## 何时使用

- 用户说"记到任务"、"创建任务"、"帮我记一下"时 → 创建任务
- 用户说"看看任务"、"任务列表"时 → 列出任务
- 用户说"这个任务怎么样了"时 → 查看任务详情
- 当你完成了一个较长的工作后 → 记录结果到任务
- 当你需要跟踪进度时 → 记录进展日志

## 命令

### 查看任务
```bash
lumitask list                          # 所有任务
lumitask list --status open            # 待处理
lumitask list --status running         # 执行中
lumitask show <number>                 # 任务详情
```

### 创建任务
```bash
lumitask create --title "任务标题" --description "详细描述"
lumitask create --title "写周报" --assign claude-code --schedule immediate
```

### 执行任务
```bash
lumitask start <number>                # 开始执行
lumitask log <number> "进展消息"       # 记录进展
lumitask complete <number> --summary "完成摘要"  # 完成
lumitask fail <number> --reason "原因"  # 标记失败
lumitask block <number> --reason "需要用户提供信息"  # 标记阻塞
```

### 管理 Agent
```bash
lumitask agent list                    # 列出 agent
lumitask agent checkin --name openclaw # 签到
```

## 规则

1. 不要主动创建任务，除非用户明确要求"记录"或"创建"
2. 大部分对话任务是即时完成的，不需要通过 LumiTask
3. 只有需要跟踪的、较长时间的任务才记录到 LumiTask
4. 创建任务时，title 要简洁明确，description 包含完整上下文
5. 执行过程中用 `lumitask log` 记录关键进展
6. 完成后用 `lumitask complete --summary` 写清楚结果
```

**安装方式**：

```bash
# 方式 1：直接复制到 skills 目录
mkdir -p ~/.openclaw/skills/lumitask
cp /path/to/SKILL.md ~/.openclaw/skills/lumitask/SKILL.md

# 方式 2：发布到 clawhub 后
clawhub install lumitask
```

### Phase C：Cron 巡检（Orchestrator 模式）

**目标**：OpenClaw agent 定期检查 LumiTask 中未分配的任务并自动认领执行。

**配置 cron job**：

```bash
openclaw cron add \
  --cron "*/10 * * * *" \
  --agent main \
  --message "请检查 LumiTask 任务列表：
运行 lumitask list --status open 查看待处理任务。
如果有未分配的任务，根据你的能力判断是否认领：
- 如果任务适合你，运行 lumitask assign <number> --agent openclaw 然后 lumitask start <number> 开始执行
- 执行过程中用 lumitask log <number> 记录进展
- 完成后用 lumitask complete <number> --summary '结果摘要'
- 如果遇到问题，用 lumitask block <number> --reason '原因' 通知用户"
```

**巡检流程**：
```
每 10 分钟:
  OpenClaw agent 收到 cron 消息
    ↓
  运行 lumitask list --status open
    ↓
  如果有未分配任务 → 分析任务内容
    ↓
  适合的 → lumitask assign + start + 执行 + log + complete
  不适合的 → 跳过（等用户手动处理或分配给其他 agent）
    ↓
  结果自动写回 LumiTask
  用户在 Web 看板实时看到进展
```

### Phase D：改进 OpenClaw Adapter

**目标**：让 Web 面板也能调用 OpenClaw 执行任务，并获取实时日志。

**当前问题**：
- `openclaw agent --message "..." --print` 没有 stream-json 格式
- 无法获取 token/cost 数据

**改进方案**：

```typescript
// openclaw-adapter.ts 改进版
async execute(context, onEvent) {
  // 使用 openclaw agent 的 --print 模式
  // 逐行读取 stdout 作为 progress
  // 在 message 中注入 lumitask CLI 指令，让 agent 自己记录日志：
  //   "执行过程中请用 lumitask log {taskNumber} 记录进展"

  const prompt = `
任务 #${context.taskNumber}: ${context.title}

${context.description || ''}

${context.workingDirectory ? `工作目录: ${context.workingDirectory}` : ''}

请执行此任务。执行过程中使用以下命令记录进展：
- lumitask log ${context.taskNumber} "你的进展消息"
- 完成后运行: lumitask complete ${context.taskNumber} --summary "结果摘要"
- 如果遇到问题: lumitask block ${context.taskNumber} --reason "问题描述"
`
}
```

这样 OpenClaw agent 在执行时会自己调用 lumitask CLI 写日志，Web 面板通过 SSE 实时显示。

### Phase E：双向通知

**目标**：任务状态变更时通知用户（通过 OpenClaw 的聊天渠道）。

**方案**：任务完成/失败/阻塞时，调用 `openclaw cron add --at +0m --announce --message "..."` 发送一次性通知：

```typescript
// 在 task-executor.ts 完成后
if (result.success) {
  // 通过 OpenClaw 通知用户
  exec(`openclaw cron add --at +0m --announce --delete-after-run --message "✅ 任务 #${task.number} 完成: ${result.summary}"`)
}
if (task.status === 'blocked') {
  exec(`openclaw cron add --at +0m --announce --delete-after-run --message "🚫 任务 #${task.number} 需要你的帮助: ${task.blockReason}"`)
}
```

---

## 实施顺序

| 步骤 | 内容 | 预计工作量 |
|------|------|-----------|
| **A1** | CLI shell wrapper（全局可用） | 10 min |
| **A2** | 验证 `lumitask` 命令在终端可用 | 5 min |
| **B1** | 创建 SKILL.md | 10 min |
| **B2** | 复制到 ~/.openclaw/skills/lumitask/ | 2 min |
| **B3** | 验证 OpenClaw agent 可以使用 lumitask 命令 | 5 min |
| **C1** | 配置 cron 巡检 job | 5 min |
| **C2** | 测试巡检流程 | 10 min |
| **D1** | 改进 OpenClaw adapter 的 prompt 模板 | 15 min |
| **D2** | 添加 OpenClaw 通知（完成/阻塞时） | 15 min |
| **E1** | 端到端测试：创建任务 → OpenClaw 巡检认领 → 执行 → 通知 | 10 min |

---

## 最终用户体验

```
用户跟 OpenClaw 聊天:
  "帮我调研一下最新的 AI agent 框架，写一份 md 文档"

OpenClaw agent (因为安装了 lumitask skill):
  → lumitask create --title "调研 AI agent 框架" --description "..." --assign openclaw --schedule immediate
  → "已创建任务 #5，开始执行"

用户打开 Web 看板 (http://localhost:3000):
  → 看到 #5 在 Running 列
  → 点击打开详情
  → Logs tab 实时显示进展:
    12:30:00 ▶️ Started
    12:30:05 📝 搜索最新 AI agent 框架...
    12:30:15 🔧 WebSearch "AI agent framework 2026"
    12:30:30 📝 找到 5 个主流框架，整理中...
    12:31:00 📝 Write ~/Downloads/ai-agent-frameworks.md
    12:31:05 ✅ Done | 8 turns | 65s | $0.12

  → Comments tab:
    🤖 "文档已创建: ~/Downloads/ai-agent-frameworks.md"

  → 用户评论: "不错，再加上每个框架的 GitHub star 数"
  → 点击 "评论并继续 ▶"
  → Agent 继续执行...

或者:
  10 分钟后 cron 巡检:
    OpenClaw 自动检查 → 发现 #6 未分配
    → 分析任务内容 → 认领 → 执行 → 完成
    → 用户收到通知 "✅ 任务 #6 完成"
```
