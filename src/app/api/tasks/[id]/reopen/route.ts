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

    await db
      .update(tasks)
      .set({
        status: "open",
        assigneeAgentId: null,
        blockReason: null,
        failReason: null,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.reopened",
      actorType: "system",
      message: "Task reopened",
      createdAt: now,
    });

    eventBus.broadcast("task.reopened", updated);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to reopen task" }, { status: 500 });
  }
}
