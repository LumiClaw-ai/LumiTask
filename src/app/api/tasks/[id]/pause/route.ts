import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, activityLog } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";
import { adapterManager } from "@/lib/agents/adapter-manager";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const now = Date.now();

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (task.status !== "running") {
      return NextResponse.json({ error: "Only running tasks can be paused" }, { status: 422 });
    }

    // Kill the running process
    if (task.assigneeAgentId) {
      const { agents: agentsTable } = await import("@/lib/db/schema");
      const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, task.assigneeAgentId));
      if (agent) {
        const adapter = adapterManager.get(agent.adapterType);
        if (adapter) await adapter.cancel(id);
      }
    }

    await db.update(tasks).set({
      status: "blocked",
      blockReason: body.reason || "用户暂停",
      updatedAt: now,
    }).where(eq(tasks.id, id));

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.paused",
      actorType: "user",
      message: body.reason || "用户暂停任务",
      createdAt: now,
    });

    eventBus.broadcast("task.blocked", { taskId: id, number: task.number });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to pause task" }, { status: 500 });
  }
}
