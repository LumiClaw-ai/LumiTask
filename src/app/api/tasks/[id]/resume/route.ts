import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, activityLog } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const now = Date.now();

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (task.status !== "blocked" && task.status !== "failed") {
      return NextResponse.json({ error: "Only blocked or failed tasks can be resumed" }, { status: 422 });
    }

    await db.update(tasks).set({
      status: "open",
      scheduleType: "immediate",
      blockReason: null,
      failReason: null,
      startedAt: null,
      updatedAt: now,
    }).where(eq(tasks.id, id));

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.resumed",
      actorType: "user",
      message: "用户恢复任务，等待重新调度",
      createdAt: now,
    });

    eventBus.broadcast("task.created", { taskId: id, assigneeAgentId: task.assigneeAgentId });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to resume task" }, { status: 500 });
  }
}
