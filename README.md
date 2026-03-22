# LumiTask

轻量级、开源的 AI Agent 任务管理平台。

让你的 AI Agent（[OpenClaw](https://openclaw.ai) / Claude Code）帮你管理和执行任务——创建待办、拆解步骤、自动执行、完成后通知你。

**[LumiClaw](https://lumiclaw.ai) 开源项目**

---

## 截图

![任务看板](https://ameng-image-upload.oss-cn-shanghai.aliyuncs.com/img/CleanShot%202026-03-22%20at%2017.36.50%402x.png)

![任务详情](https://ameng-image-upload.oss-cn-shanghai.aliyuncs.com/img/CleanShot%202026-03-22%20at%2017.37.00%402x.png)

---

## 它能做什么？

- **任务看板** — 一眼看到所有任务的状态（待办、执行中、已完成、失败）
- **自动执行** — 分配给 Agent 的任务会自动排队运行，每个 Agent 同时只跑一个
- **任务依赖** — A 做完了再做 B，支持任务链自动串联
- **子任务拆解** — 大任务自动拆成小步骤，带进度条显示完成度
- **Session 上下文** — 子任务自动继承父任务的对话记忆，Agent 不会忘记之前做了什么
- **需要你决定时会问你** — Agent 遇到需要人拿主意的事，会暂停并通知你
- **飞书卡片通知** — 任务完成或失败时，自动通过飞书发送富文本卡片 + 可复制全文
- **从哪来回哪去** — 飞书创建的任务完成后通知回飞书，Discord 的回 Discord
- **干预操作** — 暂停、恢复、手动完成正在运行的任务
- **任务模板** — 预置常用模板（代码审查、资料搜索、竞品分析等），一键创建
- **桌面应用** — Electron 客户端，双击打开（macOS）

---

## 快速开始

### 1. 安装并运行

```bash
git clone https://github.com/LumiClaw-ai/LumiTask.git
cd LumiTask
pnpm install
pnpm dev
```

打开浏览器访问 **http://localhost:3179**

> 局域网内其他设备（手机/平板）也可以通过 `http://你的电脑IP:3179` 访问

### 2. 让你的 Agent 接入

把下面这段话发给你的 OpenClaw Agent（飞书、Telegram、Discord 都行）：

> 请阅读这份说明书并安装对应的 Skill：
> https://github.com/LumiClaw-ai/LumiTask/blob/main/guide/openclaw-guide.md
>
> 这是一个任务管理工具 LumiTask，安装 Skill 后你就可以帮我创建、管理和执行任务了。

Agent 会自动阅读说明、安装 Skill，之后你就可以直接对它说：

- "帮我创建一个任务：重构登录模块"
- "把这个大任务拆成几个步骤"
- "看看现在有哪些任务在跑"

所有任务都会出现在 LumiTask 的看板上。

### 3. 桌面客户端（可选）

前往 [Releases](https://github.com/LumiClaw-ai/LumiTask/releases) 下载客户端，双击打开即可。

---

## 核心机制

### 任务调度

- 每个 Agent 同时最多执行 1 个任务（防止 session 文件锁冲突）
- 多个任务自动排队，前一个完成后**立即**派发下一个（事件驱动，零延迟）
- 即使 Agent 批量调用 execute API，系统也会自动入队保护

### Session 上下文

- 子任务自动继承父任务的 session，Agent 记得之前做了什么
- 依赖链后续任务继承前置任务的 session
- 用户 reply 追加指令时继续同一个 session
- 独立新任务创建新 session
- 用户不需要理解 session 概念，全自动

### 通知路由

- Agent 创建任务时带上来源渠道（`sourceChannel: "feishu"`）
- 任务完成后自动通知回来源渠道，无需手动配置
- 飞书通知使用富文本卡片（彩色标题 + 完整结果 + 查看详情按钮）
- 完成后追发纯文本消息，方便手机长按复制

---

## 技术栈

Next.js 16 · React 19 · Tailwind CSS v4 · SQLite · Drizzle ORM · Electron

---

## API

LumiTask 提供完整的 REST API，详见 [OpenClaw 集成指南](guide/openclaw-guide.md)。

```bash
# 创建任务
curl -X POST http://localhost:3179/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "我的任务", "scheduleType": "immediate"}'

# 查看任务
curl http://localhost:3179/api/tasks

# 从模板创建
curl -X POST http://localhost:3179/api/templates \
  -H "Content-Type: application/json" \
  -d '{"templateId": "research", "params": {"topic": "AI Agent"}}'
```

---

## 配置

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 端口 | `3179` | 网页和 API 的访问端口 |
| 数据库 | `data/lumitask.db` | 本地 SQLite，数据都在你电脑上 |

端口自动写入 `~/.lumitask/port`，Agent 会自动发现。

---

## 远程 Agent

如果你的 Agent 跑在远程服务器上：

1. 在服务器上运行 `openclaw qr --setup-code-only`，得到连接码
2. 打开 LumiTask 设置 → Agent 连接 → 远程模式 → 粘贴连接码
3. 完成

---

## License

MIT
