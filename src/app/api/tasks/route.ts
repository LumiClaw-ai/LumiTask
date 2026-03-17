import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq, and, desc, isNull, ne, gte, lte } from "drizzle-orm";
import { db, getNextTaskNumber } from "@/lib/db";
import { tasks, activityLog, agents } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";
import { sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const status = url.searchParams.get("status");
    const agentId = url.searchParams.get("agent");
    const unassigned = url.searchParams.get("unassigned");

    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");

    const conditions = [];
    // Exclude inbox items from regular task list
    if (!status) conditions.push(ne(tasks.status, "inbox"));
    if (status) conditions.push(eq(tasks.status, status as any));
    if (agentId) conditions.push(eq(tasks.assigneeAgentId, agentId));
    if (unassigned === "true") conditions.push(isNull(tasks.assigneeAgentId));
    if (dateFrom) conditions.push(gte(tasks.createdAt, parseInt(dateFrom)));
    if (dateTo) conditions.push(lte(tasks.createdAt, parseInt(dateTo)));

    const query = db
      .select()
      .from(tasks)
      .orderBy(tasks.sortOrder, desc(tasks.createdAt));

    const result = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    // Resolve agent names + counts
    const agentsList = await db.select().from(agents);
    const agentMap = new Map(agentsList.map(a => [a.id, { name: a.name, displayName: a.displayName }]));

    // Get comment/log counts per task
    const allLogs = await db.select({
      taskId: activityLog.taskId,
      action: activityLog.action,
    }).from(activityLog);

    const countsMap = new Map<string, { comments: number; logs: number }>();
    for (const log of allLogs) {
      if (!countsMap.has(log.taskId)) countsMap.set(log.taskId, { comments: 0, logs: 0 });
      const c = countsMap.get(log.taskId)!;
      if (log.action.startsWith('comment.') || log.action === 'task.blocked') c.comments++;
      else c.logs++;
    }

    const enriched = result.map(t => {
      const agent = t.assigneeAgentId ? agentMap.get(t.assigneeAgentId) : null;
      const counts = countsMap.get(t.id) || { comments: 0, logs: 0 };
      return {
        ...t,
        agentName: agent?.displayName || agent?.name || null,
        commentCount: counts.comments,
        logCount: counts.logs,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: "Failed to list tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = Date.now();
    const id = nanoid();
    const number = getNextTaskNumber();

    const scheduleType = body.scheduleType ?? "manual";

    let scheduleNextAt: number | null = null;
    if (scheduleType === "scheduled" && body.scheduleAt) {
      scheduleNextAt = body.scheduleAt;
    } else if (scheduleType === "recurring" && body.scheduleCron) {
      const { getNextCronTime } = await import("@/lib/agents/task-executor");
      scheduleNextAt = getNextCronTime(body.scheduleCron);
    }

    // Auto-assign: if no agent specified, use default from settings, then first online
    let assigneeAgentId = body.assigneeAgentId ?? null;
    if (!assigneeAgentId) {
      const { getSetting } = await import("@/lib/db");
      const defaultAgentId = getSetting("defaultAgentId");
      if (defaultAgentId) {
        // Verify the default agent exists
        const [defaultAgent] = await db.select().from(agents).where(eq(agents.id, defaultAgentId));
        if (defaultAgent) assigneeAgentId = defaultAgentId;
      }
    }
    if (!assigneeAgentId) {
      // Fallback: first online agent
      const onlineAgents = await db.select().from(agents).where(eq(agents.status, "online"));
      if (onlineAgents.length > 0) {
        assigneeAgentId = onlineAgents[0].id;
      }
    }

    const task = {
      id,
      number,
      title: body.title,
      description: body.description ?? null,
      status: "open" as const,
      assigneeAgentId,
      workingDirectory: body.workingDirectory ?? null,
      scheduleType: scheduleType as any,
      scheduleCron: body.scheduleCron ?? null,
      scheduleAt: body.scheduleAt ?? null,
      scheduleNextAt,
      source: body.source ?? "web",
      dueAt: body.dueAt ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tasks).values(task);

    const logEntry = {
      id: nanoid(),
      taskId: id,
      action: "task.created",
      actorType: "system" as const,
      message: `Task #${number} created: ${body.title}`,
      createdAt: now,
    };
    await db.insert(activityLog).values(logEntry);

    eventBus.broadcast("task.created", task);

    // For immediate schedule, fire-and-forget execution
    if (scheduleType === "immediate" && task.assigneeAgentId) {
      const { executeTask } = await import("@/lib/agents/task-executor");
      executeTask(id).catch(err => console.error("Execution error:", err));
    }

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
