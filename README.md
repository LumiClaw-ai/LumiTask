# LumiTask

轻量级、自托管的 AI Agent 任务管理与执行平台。

LumiTask 是一个为 AI 编程 Agent（如 Claude Code、OpenClaw）设计的任务调度中心，让你可以创建、分配、执行和监控 AI Agent 的工作任务，并通过实时流式输出观察执行过程。

## 核心能力

- **任务全生命周期管理** — 从收集想法（Inbox）到创建任务、分配 Agent、执行、完成，支持 `inbox → open → assigned → running → done/failed/blocked` 完整状态流转
- **多 Agent 支持** — 可插拔的 Agent 适配器架构，内置 Claude Code 和 OpenClaw 适配器，支持自动检测已安装的 Agent
- **定时与周期任务** — 支持一次性任务、立即执行、定时执行和 Cron 周期性自动执行
- **实时流式执行** — 通过 SSE 实时推送 Agent 执行进度，包括工具调用、Token 消耗、输出内容
- **看板视图** — Kanban 风格的任务面板，按状态分列展示，支持按 Agent 和日期筛选
- **成本追踪** — 自动记录每个任务的 Token 用量和费用
- **完整审计日志** — 不可变的活动日志，记录所有操作、工具调用和执行结果
- **CLI 工具** — 命令行创建和管理任务，适合在终端工作流中使用
- **浏览器通知** — 任务完成或失败时推送桌面通知

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + Tailwind CSS v4 + Radix UI |
| 后端 | Next.js API Routes + SSE |
| 数据库 | SQLite + Drizzle ORM |
| 状态管理 | TanStack React Query v5 |
| CLI | Commander.js + tsx |
| 测试 | Vitest + Testing Library |

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 访问 http://localhost:3000
```

### CLI 使用

```bash
# 创建任务
pnpm cli:dev create "重构登录模块" --desc "将登录逻辑迁移到新的 auth 中间件"

# 查看任务列表
pnpm cli:dev list

# 启动任务执行
pnpm cli:dev start <task-id>

# 查看任务详情
pnpm cli:dev show <task-id>
```

## 项目结构

```
src/
├── app/                # Next.js 页面和 API 路由
│   ├── api/            # RESTful API（tasks, agents, cron, events, inbox）
│   ├── tasks/          # 任务看板和详情页
│   ├── inbox/          # 快速收集想法
│   ├── cron/           # 定时任务管理
│   └── settings/       # 系统设置
├── lib/
│   ├── db/             # 数据库 Schema 和初始化
│   ├── agents/         # Agent 适配器、执行引擎、调度器
│   └── events.ts       # SSE 事件总线
├── components/         # UI 组件（看板、任务表单、侧边栏等）
└── hooks/              # React Hooks（SSE 集成）
cli/                    # 命令行工具
```

## 许可证

MIT
