# ClawTask 产品重新思考（终版）

## 核心定位

> **ClawTask：你的 AI agent 在做什么，一目了然。**
> 不是让你管理任务，而是让你看到 agent 的工作状态和结果。

## 从"任务看板"到"Agent 活动中心"

看板模式（Open/Running/Done 列拖拽）是项目管理思维，但用户跟 AI agent 的交互是聊天驱动的。

用户最关心的不是"怎么管理任务"，而是：
- **现在有什么在跑？**
- **跑完了吗？结果是什么？**
- **卡住了？需要我做什么？**

---

## 用户场景抽象

| 场景 | 占比 | 在 OpenClaw 中 | ClawTask 做什么 |
|------|------|---------------|----------------|
| **即时对话** | 80% | 直接完成 | 不介入 |
| **长任务** | 10% | agent 执行 1-5 分钟 | **观察 session → 实时显示进度和结果** |
| **定时任务** | 5% | openclaw cron | 展示日程 + 执行记录 |
| **收集想法** | 3% | 用户说"记一下" | Inbox 存储 + 定期提醒 |
| **查历史** | 2% | 翻聊天记录（痛苦） | 搜索 + 筛选 + 日历 |

---

## 任务数据来源：Session 观察（核心方案）

### 不再依赖 agent 手动调 CLI 记录

之前的方案：旺财执行完后调 `clawtask create --status done` 登记结果。
**问题**：依赖 agent 主动配合，不可靠，且无法追踪执行过程。

### 新方案：直接读取 OpenClaw Session 文件

```
OpenClaw 的 session JSONL 文件实时写入每条消息：
~/.openclaw/agents/{agentId}/sessions/{sessionId}.jsonl

每行包含：
- user 消息（用户说了什么）
- assistant 回复（agent 的思考 + 文本 + 工具调用）
- toolResult（工具执行结果）
- sessions_spawn（子 agent 派遣）

ClawTask 轮询 tail 读取 → 解析 → 展示在 Now 面板
```

**优势**：
- 不需要 agent 配合，自动观察
- 工具调用、思考过程、子 agent 全部可见
- 不会重复执行任务（只是观察，不干预）

### Session 观察机制

```
每 5 秒:
  1. 读取 sessions.json → 所有活跃 session 列表
  2. 对比上次快照 → 找出 updatedAt 变化的 session
  3. 变化的 session → tail 读取 JSONL 最后 N 行
  4. 解析新消息 → 判断是否是"长任务"
  5. 长任务 → 写入 ClawTask DB + 推送 SSE 到前端
```

### 长任务自动识别

怎么判断一个 session 里的对话是"长任务"？

```
规则 1: agent 调用了 > 3 个工具 → 可能是长任务
规则 2: 对话持续 > 30 秒还没结束 → 长任务
规则 3: agent 调用了 sessions_spawn → 多 agent 协作任务
规则 4: agent 调用了 clawtask create → 用户主动要求记录

满足任一规则 → 在 Now 面板的 Active 区域显示
```

### 无进度时的处理

```
session updatedAt 30 秒内没变化，但还在执行中：
  → 显示 "Agent 正在处理中... (45s)"

超过 5 分钟无变化：
  → Toast 通知: "任务可能卡住了"
  → 可选: 通过 OpenClaw 发消息提醒用户
```

### 子 Agent 追踪

```
主 agent 调用 sessions_spawn:
  → ClawTask 检测到新的子 session
  → 在 Now 面板显示:
    📋 旺财: 整理社交媒体内容
      └─ 🧵 lumi-xhs: 处理小红书内容
      └─ 🧵 lumi-wechat-mp: 处理公众号内容
```

---

## 调度方式建议：OpenClaw Cron vs ClawTask 内部调度

### 结论：用 OpenClaw Cron 管理，ClawTask 只做展示

| 维度 | OpenClaw Cron | ClawTask 内部调度 |
|------|--------------|------------------|
| 执行引擎 | ✅ Gateway 原生，成熟稳定 | ❌ 要自己造，不可靠 |
| Agent 执行 | ✅ 直接在 session 中执行 | ❌ 要通过 adapter 间接调用 |
| 消息通知 | ✅ 原生支持 --announce 到聊天渠道 | ❌ 需要额外实现 |
| 会话上下文 | ✅ 在同一个 session 中，有历史 | ❌ 每次是独立的，无上下文 |
| 失败重试 | ✅ Gateway 内置 | ❌ 要自己写 |
| 子 agent | ✅ 原生支持 sessions_spawn | ❌ 支持不了 |
| 管理 UI | ❌ 只有 CLI | ✅ ClawTask 提供可视化管理 |

**分工**：
- **OpenClaw Cron** = 执行引擎（创建、调度、执行、通知）
- **ClawTask** = 管理面板（展示、编辑、启停、查看历史）

**具体来说**：
- 用户说"每天帮我检查 PR" → 旺财调 `openclaw cron add` 创建 cron job
- ClawTask 读取 `openclaw cron list --json` 展示任务列表
- 用户在 ClawTask 点"编辑" → 调 `openclaw cron edit` 修改
- Cron 执行时 → session 文件有记录 → ClawTask 观察到执行过程和结果
- 不需要 ClawTask 自己去调度执行

**ClawTask 的 Task Scheduler 保留的场景**：
- Claude Code 任务（只能通过 ClawTask adapter 执行）
- 用户在 Web 面板手动创建的 immediate 任务

---

## 信息架构（终版）

```
侧边栏：
  📍 Now           — 实时面板（首页）
  📋 Tasks         — 任务列表 + 日历 + 搜索
  🔄 Routines      — 定时任务（OpenClaw Cron 管理）
  📥 Inbox (N)     — 收集箱
  🤖 Agents        — Agent 状态详情
  ⚙️ Settings
```

---

## 📍 Now（实时面板 / 首页）

```
┌──────────────────────────────────────────────────┐
│  Now                                     3:25 PM │
│                                                   │
│  ── Active ──────────────────────────────────── │
│                                                   │
│  🟣 调研 AI agent 框架              Claude Code  │
│     Running 2m 35s                               │
│     📝 搜索结果显示有 5 个主流框架...              │
│     🔧 WebSearch "AI agent framework 2026"       │
│     📝 正在整理信息，撰写文档中...                 │
│     [查看详情] [停止]                             │
│                                                   │
│  🟢 检查今日 PR                        🐶 旺财   │
│     Running 15s                                   │
│     执行中... 15s                                 │
│     [查看详情]                                    │
│                                                   │
│  无 active 时: "All quiet ☀️ — 所有 agent 空闲"  │
│                                                   │
│  ── Agents ──────────────────────────────────── │
│                                                   │
│  ● Claude Code  busy → running "调研AI框架"      │
│  ● 🐶 旺财      busy → running "检查今日PR"      │
│  ● ✨ lumi-xhs  idle                             │
│                                                   │
│  ── Just Completed ──────────────────────────── │
│                                                   │
│  ✅ 杭州天气查询          3 min ago   $0.14      │
│     A梦哥，杭州今天小雨转多云，11-13°C...         │
│     [展开结果] [复制]                             │
│                                                   │
│  ✅ 每日新闻整理          1h ago      $0.32      │
│     整理了8篇AI行业新闻...                        │
│     [展开结果] [复制]                             │
│                                                   │
│  ❌ 部署项目              2h ago      $0.05      │
│     失败：权限不足                                │
│     [重试] [查看日志]                             │
│                                                   │
│  ── Upcoming Routines ───────────────────────── │
│                                                   │
│  🔄 每日 PR 检查        明天 09:00               │
│  🔄 每周工作总结        周一 10:00               │
│                                                   │
│  ── Inbox (2) ───────────────────────────────── │
│                                                   │
│  📥 下周整理季度报告                   5 days ago │
│  📥 研究 Rust async 生态               3 days ago │
│     [查看全部 →]                                  │
└──────────────────────────────────────────────────┘
```

### Active 区域数据来源

**方式 1: ClawTask 自有任务**（Claude Code adapter 执行的）
- 从 DB 读取 status=running 的任务
- 活动日志来自 adapter 的 onEvent 回调

**方式 2: OpenClaw Session 观察**（旺财在聊天中执行的长任务）
- 轮询 sessions.json 的 updatedAt
- tail JSONL 文件获取最新消息
- 自动识别长任务并显示在 Active 区域
- 不创建 DB 记录，只做实时展示

**方式 2 是关键创新**：用户在聊天中让旺财做长任务，不需要调 `clawtask`，
ClawTask 自动观察 session 文件就能在 Now 面板显示进度。

### Agent 实时状态

读取 `~/.openclaw/agents/{id}/sessions/sessions.json`：
- 检查每个 session 的 `updatedAt`
- 最近 30 秒内有更新 → agent 状态 = busy
- 否则 → idle
- 配合 OpenClaw session 的 chatType 判断在哪个渠道活跃

---

## 📋 Tasks

从看板改为**列表+筛选+搜索**：

```
┌──────────────────────────────────────────────────┐
│  Tasks                                            │
│                                                   │
│  [All] [Running] [Completed] [Failed]  🔍 搜索   │
│  [📅 日历]  时间: [最近7天 ▼]                      │
│                                                   │
│  ── 任务列表 ────────────────────────────────── │
│                                                   │
│  🟣 #12 调研 AI agent 框架                        │
│     running · Claude Code · 2m ago               │
│                                                   │
│  ✅ #11 杭州天气查询                               │
│     done · Claude Code · 5m ago · $0.14          │
│     A梦哥，杭州今天小雨转多云...                   │
│                                                   │
│  ✅ #10 每日新闻整理                               │
│     done · 🐶 旺财 · 1h ago · $0.32              │
│     整理了8篇AI行业新闻...                        │
│                                                   │
│  [加载更多]                                       │
└──────────────────────────────────────────────────┘
```

完成的任务直接展示结果摘要前两行（Markdown 渲染）。

**日历视图**可切换，在日历上标记有任务的日期。

---

## 🔄 Routines（定时任务）

读取 + 管理 OpenClaw Cron：

```
┌──────────────────────────────────────────────────┐
│  定时任务 (2)                     [+ 新建]        │
│                                                   │
│  🟢 每日 GitHub PR 检查                           │
│     Agent: 🐶 旺财 · 每天 09:00                  │
│     下次: 明天 09:00 · 上次: 今天 09:00 ✅        │
│     [编辑] [暂停] [立即执行] [历史]                │
│                                                   │
│  ⏸ 每周工作总结 (已暂停)                          │
│     Agent: 🐶 旺财 · 每周一 10:00                │
│     [编辑] [启用] [历史]                           │
└──────────────────────────────────────────────────┘
```

后端通过 `openclaw cron` CLI 操作（ClawTask 只是管理 UI）。

**Routines + Now 的结合**：
- Cron 执行时 → 创建新 session → ClawTask 通过 session 观察检测到
- 自动出现在 Now 的 Active 区域（显示执行进度）
- 完成后出现在 Just Completed

---

## 📥 Inbox（收集箱）

- 快速添加 + 关联 agent
- 转为任务或直接执行
- 定期提醒（通过 OpenClaw cron 发消息汇总）

---

## 什么时候创建 ClawTask 任务

| 触发方式 | 谁触发 | 任务状态 | 执行方式 |
|---------|--------|---------|---------|
| 用户说"帮我做X" | 聊天自动 | **不创建 DB 记录** | OpenClaw 直接执行，ClawTask 观察 session |
| 用户说"帮我做X，记到任务" | 旺财调 CLI | open → immediate | ClawTask adapter 执行 |
| 用户说"记一下X" | 旺财调 CLI | inbox | 不执行 |
| 用户 Web 面板创建 | 用户手动 | open/immediate | ClawTask adapter 执行 |
| 定时任务 | OpenClaw Cron | **不创建 DB 记录** | OpenClaw 执行，ClawTask 观察 session |
| 用户说"每天做X" | 旺财调 cron add | **不创建 DB 记录** | OpenClaw Cron 执行 |

**核心区分**：
- **需要 ClawTask 管理的** → 创建 DB 记录（inbox、手动创建、用户明确要求记录的）
- **只需要看到的** → 不创建 DB 记录，通过 session 观察实时展示

---

## 技术架构总结

```
┌──────────────────────────────────┐
│         OpenClaw (Runtime)        │
│  Agent 执行 · Cron 调度 · 聊天    │
│  Session JSONL 实时写入            │
└────────────┬─────────────────────┘
             │
    ┌────────┴────────┐
    │                  │
    ▼                  ▼
Session 文件        Cron CLI
(tail 读取)      (list/add/edit)
    │                  │
    ▼                  ▼
┌──────────────────────────────────┐
│      ClawTask (Activity Center)   │
│                                   │
│  Session Observer (轮询 + tail)   │
│    → Now 面板: Active + Completed │
│    → Agent 实时状态               │
│                                   │
│  Task DB (SQLite)                 │
│    → 用户主动记录的任务            │
│    → Inbox 收集箱                 │
│                                   │
│  Cron Manager (CLI 调用)          │
│    → Routines 展示 + 管理         │
│                                   │
│  Claude Code Adapter              │
│    → Web 面板创建的任务执行        │
└──────────────────────────────────┘
```

---

## 实施优先级

### P0：Now 页面 + Session 观察
1. Session Observer（轮询 + tail + 解析）
2. Now 页面重构（Active + Agents + Completed + Upcoming）
3. Agent 实时状态（从 session 文件获取）
4. 长任务自动识别

### P1：Tasks 列表化 + Routines
5. Tasks 从看板改为列表+筛选+搜索
6. 日历视图保留
7. Routines 页面（OpenClaw Cron 管理）

### P2：Inbox + 提醒
8. Inbox 收集箱
9. 提醒机制（通过 OpenClaw Cron 发消息）
10. Skill 更新（判断逻辑）

### P3：增强
11. 子 agent 追踪
12. 搜索功能
13. 移动端适配
