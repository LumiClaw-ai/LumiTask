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

    // Support structured decision requests
    // body.reason can be a plain string (backward compatible)
    // body.decision can be a structured DecisionRequest:
    //   { type: 'confirm'|'choose'|'input'|'approve', question, options?, defaultOption?, context? }
    let blockReason: string;
    if (body.decision) {
      // Store structured decision as JSON in blockReason
      blockReason = JSON.stringify(body.decision);
    } else {
      blockReason = body.reason || "Needs human input";
    }

    await db
      .update(tasks)
      .set({ status: "blocked", blockReason, updatedAt: now })
      .where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.blocked",
      actorType: "system",
      message: body.decision?.question || body.reason,
      createdAt: now,
    });

    eventBus.broadcast("task.blocked", updated);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to block task" }, { status: 500 });
  }
}
