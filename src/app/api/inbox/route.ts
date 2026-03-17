import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq, desc } from "drizzle-orm";
import { db, getNextTaskNumber } from "@/lib/db";
import { tasks, agents } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export async function GET() {
  try {
    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "inbox"))
      .orderBy(desc(tasks.createdAt));

    const agentsList = await db.select().from(agents);
    const agentMap = new Map(agentsList.map(a => [a.id, a.displayName || a.name]));

    const enriched = result.map(t => ({
      ...t,
      agentName: t.assigneeAgentId ? agentMap.get(t.assigneeAgentId) || null : null,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: "Failed to list inbox" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = Date.now();
    const id = nanoid();
    const number = getNextTaskNumber();

    // Auto-assign logic
    let assigneeAgentId = body.assigneeAgentId ?? null;
    if (!assigneeAgentId) {
      const { getSetting } = await import("@/lib/db");
      const defaultAgentId = getSetting("defaultAgentId");
      if (defaultAgentId) {
        const [defaultAgent] = await db.select().from(agents).where(eq(agents.id, defaultAgentId));
        if (defaultAgent) assigneeAgentId = defaultAgentId;
      }
    }
    if (!assigneeAgentId) {
      const onlineAgents = await db.select().from(agents).where(eq(agents.status, "online"));
      if (onlineAgents.length > 0) assigneeAgentId = onlineAgents[0].id;
    }

    const task = {
      id,
      number,
      title: body.title,
      description: body.description ?? null,
      status: "inbox" as const,
      assigneeAgentId,
      scheduleType: "manual" as const,
      source: "web" as const,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(tasks).values(task);
    eventBus.broadcast("task.created", task);

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create inbox item" }, { status: 500 });
  }
}
