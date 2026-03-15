## 我的问题

我想做一个轻量化的让 agent 协同任务管理的工具，我之前是想用 notion 实现，我在 notion 上创建任务后，agent 自动认领任务并且分配其他 agent，然后所有agent 各自执行任务后 去完成后写会对应的结果。但 notion 似乎跑不通  遇到的问题是主要agent能够认领任务  但是分配给其他 agent 后，其他 agent 不会自己去执行并通知我，大概遇到的问题是：

如果我给他们绑定不同的bot 并且拉到一个群里 是不是你们就可以更好的交流了？
小梦
APP
 — 15:07
思路对，但不是核心问题。

现在的问题是：agent 看到任务消息但不执行，不是 agent 之间没法交流。

如果你把 social-growth、lumi 拉到一个群里，orchestrator 往群里发任务——确实会更醒目。但本质还是一样：agent 不会自动监听群里的任务消息然后去执行。

真正要解决的是这两件事：

任务投递层：orchestrator → Gateway job → agent session（这条链路已经验证能跑通，就是还没接上巡检脚本）
agent 执行层：agent 收到 job 后自动执行+回写（目前是断的）

你那个方案更像是给 agent 们造了个"作战室"，适合协作，但任务触发还是得走 job。

要不要我先帮你把这两条悬着的任务做了，然后我们继续修链路？
A梦 — 15:48
或者能否告诉我可以实现的方式 我自己去开发一个任务管理工具 然后你们用api或者cli协同 让那边来给agent推送任务呢？如果做这样的 是否可行？
小梦
APP
 — 15:48
可行。现在这套链路缺的就是orchestrator那层没接上。

当前能用的底层能力：

CLI 投递任务（已验证可跑）：
openclaw cron add --agent social-growth --at +1m --message "任务内容" --announce


Patrol 脚本已经在跑：每10分钟扫一次 Notion，缺的是把"发消息"换成"创建 agent job"

底层是 Gateway：支持 WebSocket 和 REST API

---

你自己开发的话，最简单的路径：
你的任务源 (Notion/你的DB) 
    ↓
巡检脚本 (Python) 调用 openclaw CLI 或 Gateway API
    ↓
创建 agent job → agent 执行 → 回写结果


巡检脚本我已经有现成的 notion_task_patrol.py，你只需要把"发 Discord 消息"那部分，改成调用 openclaw cron add 就行。

---

我要做的这套跟之前做的目标为驱动的产品还不同，这个只要简单的 用户自己设定任务 能够让 agent 通过 api 或者 cli 接入就好，我们可能需要主动推送对应任务信息给 agent。

参考 notion 的任务管理，参考 https://github.com/toeverything/AFFiNE  也可以寻找是否有更合适的开源工具，我们基于此来修改，并且提供详细的方案，帮我研究一下。我们要兼容的 agent 是 openclaw



## ChatGPT 的建议

我先给你一个核心判断：

不要再把这个问题当成 Notion/AFFiNE 这类文档型工具能不能“改一改就跑通”。
你真正缺的不是任务卡片，而是一个能把任务状态变化，稳定地转成 agent 执行动作的执行总线。你现在在 Notion 上卡住，本质不是 UI 不够像任务管理，而是它更偏人类协作界面，不是为 agent 的领取、分派、重试、回写、回调这些执行语义设计的。OpenClaw 这边也很明确：多 agent 可以各自隔离、各自有 workspace 和 channel 账号，但真正让任务自动跑起来的关键是 Gateway、direct agent runs、cron、以及插件/RPC 这种执行链路，而不是把几个 bot 拉到一个群里聊天。 ￼

所以这件事最优的问法，其实不是“找一个像 Notion 的开源工具改一改”，而是：

做一个轻量的 agent task OS，前台像任务管理，后台像任务调度器。

这套东西可以做，而且和 OpenClaw 是兼容的。因为 OpenClaw 本身就有几块你正需要的底层能力：
它有单独的 Gateway，CLI / web UI / automations 都能连到 Gateway；openclaw agent 可以不依赖外部聊天消息直接跑一次 agent turn；cron 是 Gateway 内建调度器，能持久化 job、在指定时间唤醒 agent，并且可把结果投递回聊天；插件还可以注册 Gateway RPC、HTTP route、CLI 命令和后台服务。换句话说，你不需要硬改 OpenClaw 内核，只要在它前面补一层任务编排器就行。 ￼

但有一个很重要的边界你要先记住：
OpenClaw 官方把它定义成单信任边界的 personal assistant 模型，不推荐在一个 gateway 里承载彼此不信任的多方。也就是说，如果你这个工具以后是给“自己和自己的 agent 团队”用，完全合理；但如果你未来想做成多租户 SaaS，让很多用户和很多 agent 混在一个 gateway 里，那就要按租户拆 gateway，最好拆到不同 OS user / 不同 host。 ￼

⸻

我给你的结论先放前面

如果你要的是现在就能落地、又足够轻量，我最推荐的路线是：

Vikunja 做任务壳层 + 你自己写一个 OpenClaw Bridge 服务。

理由很直接。Vikunja 是偏任务管理本体，不像 AFFiNE / AppFlowy 那样把精力大量放在文档、白板、知识库；它有现成 API 文档、OpenAPI/Swagger、API token 认证、Webhook API，而且连 n8n 集成都已经有人走过，拿来做事件源最顺手。 ￼

如果你更在意“更像 Linear / Jira，后面可以扩成更复杂的团队协作”，那第二选择是：

Plane 做任务与项目层 + OpenClaw Bridge。

Plane 的成熟度、社区热度和产品完成度都很强，GitHub 约 4.66 万 stars，而且官方已经在往 AI agent 方向走，甚至有自己的 MCP server。问题是它不轻，产品哲学也更偏团队项目管理，不是你现在要的这种最小 agent orchestration cockpit。 ￼

如果你只是想保留 Notion 那种“文档 + 数据库 + 看板”的使用感，再做少量改造，那：

AppFlowy 比 AFFiNE 更接近可编程数据库壳。

因为 AppFlowy 已经公开了 REST API，能直接对 database row 做创建和 upsert，而且 self-host 部署入口清楚，有 /api 和 /ws。这意味着它比较适合充当一个“任务表前台”。但它本质仍然是 workspace/database 型产品，不是 agent 执行系统。你还是得自己补任务总线。 ￼

至于 AFFiNE，我不建议你把它当这个项目的底座。
AFFiNE 很强，社区也大，主打 docs、whiteboards、databases、local-first，适合当知识工作台；但从公开资料看，它的对外定位和 self-host 文档重点都还是围绕 workspace、AI、存储、OAuth 这些，不像 Vikunja 那样把 API/Webhook 当成一等公民暴露出来。拿它做你的 agent orchestration kernel，会很容易走回你在 Notion 遇到的老路：页面很爽，执行链很虚。 ￼

⸻

为什么你之前那套群聊思路不够

你问到把不同 bot 拉到一个群里，是不是它们就能更好交流。这个思路可以当“作战室”，但不能当执行系统。

因为真正的自动执行至少要有这 6 个能力：
	1.	任务状态变化能触发机器事件
	2.	事件能路由到指定 agent
	3.	agent 执行要有 run id、日志、超时、重试
	4.	子任务要能被显式创建和追踪
	5.	结果要能结构化回写，而不是只发一句聊天消息
	6.	失败后要能升级给人，而不是静默丢掉

群聊只能提供第 2 条的一部分，而且还是弱触发。真正可靠的是任务系统 + bridge service + OpenClaw 执行接口。OpenClaw 文档也表明，direct run、cron、gateway event/API 才是正路。 ￼

⸻

我建议你做成什么样

一句话定义

做一个面向 agent 的轻量任务中枢：

前端像简化版 Notion/Linear。
后端像 Air Traffic Control。

最小可用模型

你的系统里不要只有“任务”，要有 4 层对象：

Task
用户创建的业务任务。比如：整理这周 OpenClaw 相关新闻，输出中文摘要。

Run
某次真实执行实例。因为一个 task 可能被重试、重跑、分给不同 agent。

Assignment
某个 agent 被分配到某个 run 的记录。比如 social-growth、researcher、writer。

Artifact / Result
执行产物。结构化结果、附件、摘要、链接、失败日志都放这里。

这样你的工具才不是“看板”，而是“任务状态机”。

⸻

推荐的状态设计

不要只做 To Do / Doing / Done。
对 agent 系统来说，至少应该是：

draft → ready → dispatched → claimed → running → waiting_input → blocked → review → done / failed / cancelled

再加两个子状态：

retrying 和 escalated

这样一来，你未来做 OpenClaw 接入时，很多动作都能对齐：
	•	用户点发布任务：draft -> ready
	•	Orchestrator 发现 ready：创建 run，ready -> dispatched
	•	指定 agent 收到执行：claimed -> running
	•	agent 需要人补材料：waiting_input
	•	agent 完成写回：review 或 done
	•	超时/错误：failed 或自动进入 retrying
	•	连续失败：escalated

这一步非常关键。你之前在 Notion 里其实只有“卡片存在”，没有“执行状态机”。

⸻

最推荐的总体架构

方案 A：最稳、最适合你当前阶段

Vikunja + Bridge Service + OpenClaw

架构是：

用户界面层：Vikunja
↓
Webhook / Polling
↓
Bridge Service（Python/Node）
↓
OpenClaw CLI / Gateway
↓
结果回写 Vikunja + 通知你

Vikunja 这层负责：
	•	项目 / 列表 / 看板 / 任务字段
	•	API token
	•	webhook 触发
	•	人类查看和编辑

Bridge Service 负责：
	•	监听 task create / update
	•	按标签或规则路由到 agent
	•	调 OpenClaw 执行
	•	建立 run / assignment / log
	•	收集结果并回写
	•	失败重试和超时升级

OpenClaw 负责：
	•	真正执行
	•	多 agent 隔离
	•	使用各 agent 的 workspace / tools / creds
	•	通过 agent、cron 或插件能力完成动作

Vikunja 之所以特别适合，是因为它的 API 和 webhook 是公开一等公民，token 和 Swagger 都很清楚，适合作你的“任务事件源”。 ￼

方案 B：你想兼顾未来扩展

Plane + Bridge Service + OpenClaw

优点是未来你要引入 roadmap、issue、spec、文档、复杂协作，会更顺；而且 Plane 已经明显在对接 AI/MCP。缺点是它对于你当前这个“一人公司 + agent 团队”的问题来说偏重。你现在最缺的不是更完整的 PM，而是更可靠的 dispatch loop。 ￼

方案 C：你特别想保留 Notion 手感

AppFlowy + Bridge Service + OpenClaw

AppFlowy 有 database row API，这让你用“数据库表作为任务池”是可行的。适合你如果非常想保留 block/database 的操作心智。问题是后面一旦你要做 run log、重试、子任务追踪，很快就会发现它还是更像 workspace，而不是 orchestration core。 ￼

不推荐

AFFiNE 直接做底座。

它适合做知识中枢、文档层、白板层，不适合做第一个版本的 agent task engine。 ￼

⸻

一个更像产品而不是脚本的设计方式

你这个项目最好不要直接写成“从任务库推送一句 message 给 OpenClaw”。

应该设计成 3 个明确模块：

1) Task Inbox

用户创建任务的地方。

字段我建议至少有：
	•	title
	•	description
	•	goal
	•	assignee_mode：manual / auto
	•	target_agents
	•	priority
	•	due_at
	•	requires_approval
	•	parent_task_id
	•	input_context
	•	expected_output_type
	•	notify_channel
	•	status

2) Dispatcher

决定谁来做、怎么做。

它做的不是“发消息”，而是：
	•	读取任务
	•	匹配 agent 能力
	•	生成 run
	•	选择执行策略

执行策略分三种：

immediate
直接调 openclaw agent 跑一次

scheduled
用 cron 创建未来任务

delegated
先给 orchestrator agent，再由它拆子任务给其他 agent

OpenClaw 官方已经给了 immediate 和 scheduled 的底层能力。 ￼

3) Result Bus

负责回写、归档、通知。

不要只存一段最终结果文本。
至少要存：
	•	run status
	•	started_at / ended_at
	•	agent_id
	•	summary
	•	raw_output
	•	artifact links
	•	error
	•	retry_count
	•	next_action

这样未来你才能做：
	•	agent 成功率统计
	•	哪类任务最容易失败
	•	哪个 agent 最适合什么任务
	•	是否需要人工 review

⸻

跟 OpenClaw 的接法，我建议分两阶段

第一阶段：先别碰复杂 Gateway RPC

直接用 CLI 跑通。

因为 openclaw agent 本来就是为“无需 inbound chat message 的直接 agent run”准备的，而 cron 也是现成的。你先用最小外壳验证产品逻辑，比一上来就做深度插件稳很多。 ￼

你第一阶段就做这两种调用：

即时任务

openclaw agent --agent social-growth "请完成任务 #123：..."

定时任务

openclaw cron add --agent social-growth --at +10m --message "请执行任务 #123" --announce

然后 bridge service 负责：
	•	发起命令
	•	记录 run
	•	监听输出
	•	回写 task

第二阶段：再做 OpenClaw 插件 / Gateway RPC

等你任务产品本身的状态机跑顺了，再把 bridge 内收成 OpenClaw plugin。

因为插件可以注册 Gateway RPC、HTTP route、CLI command、background service。到那时你可以让 OpenClaw 直接认识你的任务系统，比如：
	•	task.claim
	•	task.update
	•	task.create_subtask
	•	task.complete

但官方也明确说了：插件是 in-process、非 sandbox、等于信任代码执行。所以这一步要在你的架构已经稳定之后再做，不然会把调试复杂度抬得很高。 ￼

⸻

你该不该基于开源工具改，而不是完全自研

我的判断是：

前台借壳，后台自研。

也就是：
	•	UI、任务列表、项目、权限、基础字段：借现成开源工具
	•	agent dispatch、run log、result bus、OpenClaw adapter：自己写

原因很现实：

如果你完全自研，从 0 写任务管理前端、筛选、看板、编辑器、权限、移动端适配，很快会把精力耗死。
但如果你全押某个 Notion-like 工具，又会再次陷入“表面能记录、实际不能执行”的困境。

所以最优解不是二选一，而是借壳 + 自己做大脑。

⸻

我给你的具体选型建议

最适合你现在的版本 1

Vikunja 作为任务面板
Node/Python bridge 作为执行大脑
OpenClaw 作为 agent runtime

这版适合你，因为它：
	•	足够轻
	•	self-host 简单
	•	API/webhook 清楚
	•	不会把你拖进大而全的 workspace 改造
	•	很容易先做出 usable MVP  ￼

如果你非常强调“好看、像现代产品、适合未来团队化”

可以考虑 Plane，但我建议作为 version 2，不是 version 1。
因为它会让你忍不住做很多你现在不需要的功能。 ￼

如果你强烈依赖 block/doc/database 心智

可以选 AppFlowy，但你要明确：
它是任务前台，不是执行引擎。 ￼

AFFiNE 的位置

我更建议你把 AFFiNE 放在这套系统的知识层，比如：
	•	agent handbook
	•	SOP
	•	任务模板说明
	•	结果沉淀
	•	project wiki

而不是任务分发核心。 ￼

⸻

你这个产品真正应该有的差异化

不是“又一个任务管理工具”。

而是这三点：

1. 任务不是分给人，而是分给能力

比如：
	•	research
	•	content
	•	dev
	•	ops
	•	seo
	•	growth

然后能力再映射到某个具体 agent。

2. 每个任务都天然带执行记录

不是做完就 done，而是保留 run history、失败原因、重试链路。

3. 人只在必要时介入

agent 能自动做的自动做；卡住了才进入 waiting_input 或 review。

这三点一旦成立，你的产品就不是 Notion 替代品，而是一个真正的 agent 协同控制台。

⸻

我替你收一下方向

如果我是你，我会这么推进：

第一步，不再纠结 Notion/AFFiNE 改不改得动，直接把问题重定义为 task orchestration。
第二步，拿 Vikunja 做前台，先把 task / run / assignment / result 四层模型建起来。 ￼
第三步，bridge 先只接 OpenClaw CLI：agent 和 cron 两条链先跑通。 ￼
第四步，等链路稳定，再考虑把 bridge 下沉成 OpenClaw plugin / Gateway RPC。 ￼
第五步，再考虑是否需要更漂亮的壳，或者迁移到 Plane / 自研前端。

这样做，你最快两周内就能有一个真 MVP，而不是继续在 Notion 式表格里打转。

如果你愿意，我下一步可以直接给你出一版详细的系统方案文档，包括数据表设计、状态机、OpenClaw 调用方式、Webhook 事件流，以及 MVP 的页面结构。

## Claude 的建议

我来帮你研究一下这个方向。先看看 AFFiNE 和其他可能的开源方案，然后给你一个完整的技术建议。Now I have enough信息来给你一个完整的方案了。让我先把研究结果整理清楚。研究结果出来了，让我给你一个完整的分析和推荐方案。

先说关键发现：**AFFiNE 目前没有 API 支持**（GitHub Issue #13262 是社区在呼吁的功能请求），所以不适合你的 agent 集成场景。

在所有开源方案中，**Vikunja** 是最匹配你需求的选择。原因很明确：它有完整的 REST API、webhook 事件系统、已有 MCP Server 和 n8n 官方节点，而且足够轻量。

先看整体架构设计：下面给你详细的方案分析。

## 为什么选 Vikunja 而不是其他

**AFFiNE 排除**：社区一直在呼吁 API 支持，但项目方一直没有回应，目前连自托管版本都感觉比竞品更封闭。没有 API 意味着 agent 无法程序化读写任务，直接不可行。

**Vikunja 的核心优势**：

它提供完整的 RESTful API 用于程序化访问任务、项目和用户，支持 JWT 和 OAuth2 认证。而且已经有三个关键的生态组件：

1. 已有 MCP Server（vikunja-mcp），支持 API Token 认证，可以完整操作任务、项目、标签、团队和 webhooks
2. 官方 n8n 集成节点，支持 webhook trigger，可以直接在 n8n 中响应 Vikunja 事件
3. 从 v0.22.0 起内置 webhook 系统，可以在项目设置中配置 webhook 通知外部服务

**部署极其简单**：前后端打包成一个 binary 或 Docker 容器，单个 Docker 命令就能跑起来，默认用 SQLite。

其他考虑过的方案（Kanboard 太简陋没前端交互体验、PLANKA API 不够完善、WeKan 生态弱）都不如 Vikunja 适合。

## 具体实现方案

你的技术栈是 n8n + openclaw，核心链路这样走：

**第一步：部署 Vikunja（10 分钟）**

一条 Docker Compose 搞定，SQLite 够用。你在 Web UI 上创建项目和任务，体验跟 Notion 类似但更轻量。

**第二步：配置 Webhook → n8n**

在 Vikunja 项目设置里创建 webhook，监听 `task.created`、`task.updated` 等事件，目标指向你的 n8n webhook URL。当你创建任务时，Vikunja 自动通知 n8n。

**第三步：n8n 做任务分发（orchestrator 层）**

n8n 收到 webhook 后：解析任务内容（标题、描述、标签）→ 根据标签决定分配给哪个 agent → 调用 `openclaw cron add --agent <agent-name> --message "任务内容"` → 任务下发完成。

**第四步：Agent 执行 + 回写**

Agent 完成任务后，通过 Vikunja REST API 回写：更新任务状态为 done，在 comment 中写入执行结果。API 调用很简单，一个 `PUT /api/v1/tasks/{id}` 加一个 `PUT /api/v1/tasks/{id}/comments` 就行。

**第五步：通知你**

n8n 监听任务状态变更的 webhook，当 `task.updated` 且状态变为 done 时，推送通知给你（Discord / 微信 / iOS push 都行）。

## 跟你现有系统的兼容性

这套方案完美嵌入你的 openclaw 体系：

- n8n 你已经在用，加一个 Vikunja 节点就行（官方维护的 n8n 节点，支持 Label、Project、Task、Team、Webhook 的完整 CRUD 操作）
- openclaw CLI 已经验证能跑，只需要把 n8n 的输出接到 `openclaw cron add` 命令
- 你之前的 `notion_task_patrol.py` 巡检脚本逻辑可以直接复用，把 Notion API 调用换成 Vikunja API

## 下一步行动建议

最快的路径：先用 Docker 把 Vikunja 跑起来，创建一个测试项目，用 API Token 手动测一遍"创建任务 → webhook 触发 → n8n 接收"这条链路。跑通之后再接 openclaw agent 层。整个搭建过程不需要写太多代码，你的 vibe coding 方式完全可以 hold 住。

要不要我帮你生成 Docker Compose 配置和 n8n workflow 的 JSON 模板，直接可以导入用的那种？