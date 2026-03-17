import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, activityLog, agents } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const now = Date.now();

    await db
      .update(tasks)
      .set({
        assigneeAgentId: body.agentId,
        status: "assigned",
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let agentName = body.agentId;
    const [agent] = await db.select().from(agents).where(eq(agents.id, body.agentId));
    if (agent) agentName = agent.displayName || agent.name;

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.assigned",
      actorType: "system" as const,
      message: `Assigned to ${agentName}`,
      createdAt: now,
    });

    eventBus.broadcast("task.assigned", updated);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to assign task" }, { status: 500 });
  }
}
