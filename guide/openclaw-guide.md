# LumiTask — OpenClaw Agent 接入指南

这份文档是给 OpenClaw Agent 阅读的。读完后你就知道如何帮用户管理任务了。

## 你是谁，LumiTask 是什么

LumiTask 是用户本地运行的任务管理工具。用户通过 LumiTask 的看板界面查看和管理任务，你通过 API 帮用户创建、更新和执行任务。

LumiTask 已经在用户电脑上运行，API 地址是 `http://localhost:3179`。

## 安装 Skill

请在 `~/.openclaw/skills/lumitask/` 目录下创建 `SKILL.md` 文件，内容如下：

```markdown
---
name: lumitask
description: LumiTask 任务管理 — 创建、查询、更新、执行任务
---

# LumiTask 任务管理

LumiTask 运行在 http://localhost:3179，通过 REST API 管理任务。

## 创建任务

当用户说"创建任务"、"记下来"、"帮我做"、"安排一下"等意图时，调用此 API。

POST http://localhost:3179/api/tasks
Content-Type: application/json

必填：
- title — 任务标题

可选：
- description — 任务描述（重要！见下方说明）
- assigneeAgentId — 执行任务的 Agent ID
- scheduleType — manual(默认) | immediate(立即执行) | scheduled | recurring
- dependsOn — 前置任务 ID 数组，如 ["id-1", "id-2"]，前置任务全部完成后自动执行
- inputContext — JSON 对象，传给执行 Agent 的结构化输入
- parentTaskId — 父任务 ID（用于子任务拆解）
- concurrencyKey — 并发控制 key，相同 key 的任务不会同时执行
- maxRetries — 失败后最大重试次数
- workingDirectory — Agent 执行时的工作目录
- source — 来源标记：web | chat | cli（你创建时请用 "chat"）
- agentName — 你的 agent 名称（配合 source: "chat" 使用，任务会自动分配给你）
- sourceChannel — 你当前所在的消息渠道名称，如 feishu、discord、telegram（任务完成后会自动通知回这个渠道）
- sourceAccountId — 渠道账号 ID（配合 sourceChannel 使用）

### 重要：description 必须包含对话上下文

当用户在对话中让你创建任务时，任务会在独立的环境中执行。执行时的 Agent 看不到当前对话的内容。
因此，你必须把对话中与任务相关的上下文写进 description，包括：
- 用户的具体需求和偏好
- 讨论中确认的方案和决策
- 相关的背景信息和约束条件

这样执行任务时 Agent 才知道该做什么。

### 重要：并发限制

每个 Agent 同一时刻只能执行 1 个任务。如果你一次创建多个任务：
- 不要批量调用 execute，让 LumiTask 自动排队调度
- 将 scheduleType 设为 "immediate"，LumiTask 会按顺序自动执行
- 或者设置 dependsOn 依赖关系，让任务按依赖顺序执行

示例：
curl -X POST http://localhost:3179/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "设计落地页",
    "description": "根据我们的讨论：目标用户是开发者，风格偏简洁科技感，主色调使用深色系...",
    "source": "chat",
    "agentName": "main",
    "sourceChannel": "feishu",
    "sourceAccountId": "default",
    "scheduleType": "immediate"
  }'

任务完成后，结果会自动通知回你指定的 sourceChannel（如飞书），并附带任务详情链接。

## 查询任务

GET http://localhost:3179/api/tasks                      — 所有任务
GET http://localhost:3179/api/tasks?status=running        — 按状态筛选
GET http://localhost:3179/api/tasks?parentTaskId={id}     — 查子任务
GET http://localhost:3179/api/tasks/{id}                  — 单个任务详情（含日志、依赖、子任务）

## 更新任务

PATCH http://localhost:3179/api/tasks/{id}
可更新字段：title, description, dependsOn, inputContext, concurrencyKey, maxRetries

## 执行任务

POST http://localhost:3179/api/tasks/{id}/execute

## 状态操作

POST http://localhost:3179/api/tasks/{id}/complete                          — 标记完成
POST http://localhost:3179/api/tasks/{id}/fail    {"reason": "失败原因"}    — 标记失败
POST http://localhost:3179/api/tasks/{id}/reopen                            — 重新打开
POST http://localhost:3179/api/tasks/{id}/cancel                            — 取消

## 请求用户决策（阻塞任务）

当你需要用户做选择时：

POST http://localhost:3179/api/tasks/{id}/block
{"decision": {"type": "choose", "question": "选择部署环境", "options": [{"id": "staging", "label": "测试环境"}, {"id": "prod", "label": "生产环境"}]}}

decision.type 可以是：
- confirm — 是/否确认
- choose — 从选项中选择
- input — 自由输入
- approve — 审批（批准/驳回）

用户在 LumiTask 界面上做出选择后，任务会自动继续。

## 回复阻塞的任务

POST http://localhost:3179/api/tasks/{id}/reply
{"body": "用户的回复内容"}

## 创建子任务

把大任务拆成小步骤：

POST http://localhost:3179/api/tasks/{id}/subtasks
[
  {"title": "步骤1: 分析需求", "sequential": true},
  {"title": "步骤2: 编写代码", "sequential": true},
  {"title": "步骤3: 测试验证", "sequential": true}
]

sequential: true 会自动设置依赖链——步骤1完成后才执行步骤2，以此类推。

## 添加评论

POST http://localhost:3179/api/tasks/{id}/comments
{"body": "进度更新：已完成 50%", "actorType": "agent"}

## 查看 Agent 列表

GET http://localhost:3179/api/agents

## 使用建议

1. 用户说"创建任务"→ POST /api/tasks
2. 复杂任务 → 先创建父任务，再 POST /api/tasks/{id}/subtasks 拆解
3. 需要用户拿主意 → POST /api/tasks/{id}/block 带 decision
4. 完成工作后 → POST /api/tasks/{id}/complete 或添加评论记录结果
5. 创建任务后告诉用户任务编号和查看链接：http://localhost:3179
```

## 验证安装

Skill 放到 `~/.openclaw/skills/lumitask/SKILL.md` 后会自动生效。

测试一下——用户对你说"帮我创建一个任务"时，你应该调用 `POST http://localhost:3179/api/tasks` 来创建。

## 端口说明

默认端口是 `3179`。如果用户的 LumiTask 运行在其他端口，端口信息会写在 `~/.lumitask/port` 文件中，你可以读取这个文件获得实际端口号。
