import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, activityLog, agents } from "@/lib/db/schema";
import { adapterManager } from "@/lib/agents/adapter-manager";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const now = Date.now();

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (task.assigneeAgentId) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, task.assigneeAgentId));
      if (agent) {
        const adapter = adapterManager.get(agent.adapterType);
        if (adapter) {
          await adapter.cancel(id);
        }
      }
    }

    // If was running, stop and go back to open; otherwise mark cancelled
    const newStatus = task.status === "running" ? "open" : "cancelled";
    const actionMsg = task.status === "running" ? "Execution stopped" : "Task cancelled";

    await db
      .update(tasks)
      .set({
        status: newStatus,
        startedAt: newStatus === "open" ? null : task.startedAt,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: task.status === "running" ? "task.stopped" : "task.cancelled",
      actorType: "user",
      message: actionMsg,
      createdAt: now,
    });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to cancel task" }, { status: 500 });
  }
}
