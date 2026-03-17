import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";
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

    const logEntry = {
      id: nanoid(),
      taskId: id,
      action: "task.progress",
      actorType: (body.actorType ?? "system") as "user" | "agent" | "system",
      actorId: body.actorId ?? null,
      message: body.message,
      toolName: body.toolName ?? null,
      toolInput: body.toolInput ?? null,
      inputTokens: body.inputTokens ?? null,
      outputTokens: body.outputTokens ?? null,
      model: body.model ?? null,
      provider: body.provider ?? null,
      createdAt: now,
    };

    await db.insert(activityLog).values(logEntry);

    if (body.inputTokens || body.outputTokens) {
      await db
        .update(tasks)
        .set({
          totalInputTokens: sql`COALESCE(${tasks.totalInputTokens}, 0) + ${body.inputTokens ?? 0}`,
          totalOutputTokens: sql`COALESCE(${tasks.totalOutputTokens}, 0) + ${body.outputTokens ?? 0}`,
          updatedAt: now,
        })
        .where(eq(tasks.id, id));
    }

    eventBus.broadcast("task.progress", { ...logEntry, taskId: id });

    return NextResponse.json(logEntry, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to log progress" }, { status: 500 });
  }
}
