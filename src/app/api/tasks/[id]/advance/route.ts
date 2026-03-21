import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, activityLog } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

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
    if (task.status === "done" || task.status === "cancelled") {
      return NextResponse.json({ error: "Task already completed" }, { status: 422 });
    }

    await db.update(tasks).set({
      status: "done",
      summary: body.summary || "手动推进完成",
      completedAt: now,
      updatedAt: now,
    }).where(eq(tasks.id, id));

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.advanced",
      actorType: "user",
      message: body.summary || "用户手动推进任务完成",
      createdAt: now,
    });

    eventBus.broadcast("task.completed", { taskId: id, number: task.number });

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to advance task" }, { status: 500 });
  }
}
