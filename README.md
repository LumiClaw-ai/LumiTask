# LumiTask

轻量级、开源的 AI Agent 任务管理平台。

让你的 AI 小龙虾（[OpenClaw](https://openclaw.ai) Agent）帮你管理和执行任务——创建待办、拆解步骤、自动执行、完成后通知你。

**[LumiClaw](https://lumiclaw.ai) 开源项目**

---

## 它能做什么？

- **任务看板** — 一眼看到所有任务的状态（待办、执行中、已完成、失败）
- **自动执行** — 分配给 Agent 的任务会自动运行，你只需等结果
- **任务依赖** — A 做完了再做 B，支持任务链自动串联
- **子任务拆解** — 大任务自动拆成小步骤，逐步执行
- **需要你决定时会问你** — Agent 遇到需要人拿主意的事，会暂停并通知你
- **多渠道通知** — 任务完成或失败时，通过飞书/Discord/Telegram 通知你
- **远程连接** — Agent 在服务器上也能管，粘贴一段连接码就行
- **桌面应用** — 双击打开，不用命令行（macOS）

---

## 快速开始

### 1. 安装并启动

```bash
git clone https://github.com/LumiClaw-ai/LumiTask.git
cd LumiTask
pnpm install
pnpm dev
```

启动后打开浏览器访问 **http://localhost:3179**

### 2. 让你的小龙虾接入

把下面这段话发给你的 OpenClaw Agent（飞书、Telegram、Discord 都行）：

> 请阅读这份说明书并安装对应的 Skill：
> https://github.com/LumiClaw-ai/LumiTask/blob/main/guide/openclaw-guide.md
>
> 这是一个任务管理工具 LumiTask，安装 Skill 后你就可以帮我创建、管理和执行任务了。

小龙虾会自动阅读说明、安装 Skill，之后你就可以直接对它说：

- "帮我创建一个任务：重构登录模块"
- "把这个大任务拆成几个步骤"
- "看看现在有哪些任务在跑"

所有任务都会出现在 LumiTask 的看板上。

### 3. 桌面应用（可选）

如果你不想用命令行启动，可以打包成桌面应用：

```bash
pnpm add -D electron electron-builder @electron/rebuild
pnpm electron:dev
```

---

## 截图

> 看板视图、任务详情、决策卡片等截图（待补充）

---

## 配置

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 端口 | `3179` | 网页和 API 的访问端口 |
| 数据库 | `data/lumitask.db` | 本地 SQLite，数据都在你自己电脑上 |

端口会自动写入 `~/.lumitask/port`，Agent 会自动发现，不需要手动配置。

---

## 远程 Agent

如果你的小龙虾跑在远程服务器上：

1. 在服务器上运行 `openclaw qr --setup-code-only`，得到一段连接码
2. 打开 LumiTask 设置页 → Agent 连接 → 远程模式 → 粘贴连接码
3. 点击连接，完成

或者直接问你的小龙虾："给我 LumiTask 连接码"，它会告诉你。

---

## 技术栈

Next.js 16 · React 19 · Tailwind CSS v4 · SQLite · Drizzle ORM · Electron

---

## License

MIT
