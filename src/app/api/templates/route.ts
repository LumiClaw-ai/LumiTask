import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db, getNextTaskNumber } from "@/lib/db";
import { tasks, activityLog } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";
import { sanitizeTitle } from "@/lib/task-validation";

const TEMPLATES = [
  {
    id: "code-review",
    name: "代码审查",
    icon: "🔍",
    titleTemplate: "审查 {{repo}} 代码",
    descriptionTemplate: "请审查 {{repo}} 的代码质量，包括：代码规范、潜在 bug、性能问题、安全风险。给出改进建议。",
    params: [
      { key: "repo", label: "仓库/项目名", type: "text", required: true },
    ],
    estimatedMinutes: 15,
  },
  {
    id: "research",
    name: "资料搜索",
    icon: "🔎",
    titleTemplate: "搜索 {{topic}} 相关资料",
    descriptionTemplate: "搜索并整理 {{topic}} 的最新资料，包括：关键信息、来源链接、简要总结。用中文回复。",
    params: [
      { key: "topic", label: "搜索主题", type: "text", required: true },
    ],
    estimatedMinutes: 10,
  },
  {
    id: "write-doc",
    name: "撰写文档",
    icon: "📝",
    titleTemplate: "撰写 {{title}}",
    descriptionTemplate: "请撰写一份关于 {{title}} 的文档。要求：结构清晰、内容完整、语言简洁。{{requirements}}",
    params: [
      { key: "title", label: "文档标题", type: "text", required: true },
      { key: "requirements", label: "额外要求", type: "text", required: false },
    ],
    estimatedMinutes: 20,
  },
  {
    id: "data-analysis",
    name: "数据分析",
    icon: "📊",
    titleTemplate: "分析 {{subject}}",
    descriptionTemplate: "请分析 {{subject}} 的数据，找出关键趋势、异常点和可行动的洞察。给出数据支撑的结论和建议。",
    params: [
      { key: "subject", label: "分析对象", type: "text", required: true },
    ],
    estimatedMinutes: 15,
  },
  {
    id: "competitor-analysis",
    name: "竞品分析",
    icon: "🏆",
    titleTemplate: "竞品分析：{{competitor}}",
    descriptionTemplate: "请对 {{competitor}} 进行竞品分析，包括：产品功能对比、定价策略、目标用户、优劣势分析、我们可以借鉴的点。",
    params: [
      { key: "competitor", label: "竞品名称", type: "text", required: true },
    ],
    estimatedMinutes: 20,
  },
  {
    id: "bug-fix",
    name: "修复 Bug",
    icon: "🐛",
    titleTemplate: "修复：{{issue}}",
    descriptionTemplate: "请修复以下问题：{{issue}}\n\n复现步骤：{{steps}}\n\n期望行为：问题修复后不再出现。",
    params: [
      { key: "issue", label: "问题描述", type: "text", required: true },
      { key: "steps", label: "复现步骤", type: "text", required: false },
    ],
    estimatedMinutes: 30,
  },
];

function fillTemplate(template: string, params: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || "");
  }
  // Clean up unfilled params
  result = result.replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
  return result;
}

export async function GET() {
  return NextResponse.json(TEMPLATES);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, params = {}, assigneeAgentId, scheduleType = "immediate" } = body;

    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const title = sanitizeTitle(fillTemplate(template.titleTemplate, params));
    const description = fillTemplate(template.descriptionTemplate, params);

    const now = Date.now();
    const id = nanoid();
    const number = getNextTaskNumber();

    const task = {
      id,
      number,
      title,
      description,
      status: "open" as const,
      assigneeAgentId: assigneeAgentId ?? null,
      scheduleType: scheduleType as any,
      source: "web" as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tasks).values(task);
    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.created",
      actorType: "system",
      message: `从模板「${template.name}」创建`,
      createdAt: now,
    });

    eventBus.broadcast("task.created", task);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create from template" }, { status: 500 });
  }
}
