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
    const body = await request.json();
    const now = Date.now();

    await db
      .update(tasks)
      .set({ status: "failed", failReason: body.reason, updatedAt: now })
      .where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.failed",
      actorType: "system",
      message: body.reason,
      createdAt: now,
    });

    eventBus.broadcast("task.failed", updated);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fail task" }, { status: 500 });
  }
}
