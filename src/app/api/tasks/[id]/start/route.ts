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
      .set({ status: "running", startedAt: now, updatedAt: now })
      .where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.started",
      actorType: "system",
      message: "Task started",
      createdAt: now,
    });

    eventBus.broadcast("task.started", updated);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to start task" }, { status: 500 });
  }
}
