import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db, getNextTaskNumber } from "@/lib/db";
import { tasks, activityLog } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const subtasks = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    return NextResponse.json(subtasks);
  } catch (error) {
    return NextResponse.json({ error: "Failed to get subtasks" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: parentId } = await params;

    // Verify parent exists
    const [parent] = await db.select().from(tasks).where(eq(tasks.id, parentId));
    if (!parent) {
      return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
    }

    const body = await request.json();
    const subtasksInput: any[] = Array.isArray(body) ? body : [body];
    const now = Date.now();
    const created: any[] = [];

    let prevId: string | null = null;

    for (const sub of subtasksInput) {
      const subId = nanoid();
      const number = getNextTaskNumber();

      // Chain dependencies: each subtask depends on the previous one (if sequential)
      let dependsOn: string | null = null;
      if (sub.dependsOn) {
        dependsOn = JSON.stringify(sub.dependsOn);
      } else if (sub.sequential && prevId) {
        dependsOn = JSON.stringify([prevId]);
      }

      const task = {
        id: subId,
        number,
        title: sub.title,
        description: sub.description ?? null,
        status: "open" as const,
        assigneeAgentId: sub.assigneeAgentId ?? parent.assigneeAgentId,
        workingDirectory: sub.workingDirectory ?? parent.workingDirectory,
        scheduleType: "immediate" as const,
        parentTaskId: parentId,
        dependsOn,
        inputContext: sub.inputContext ? JSON.stringify(sub.inputContext) : null,
        concurrencyKey: sub.concurrencyKey ?? null,
        maxRetries: sub.maxRetries ?? 0,
        source: "web" as const,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(tasks).values(task);
      await db.insert(activityLog).values({
        id: nanoid(),
        taskId: subId,
        action: "task.created",
        actorType: "system",
        message: `Subtask #${number} of #${parent.number}: ${sub.title}`,
        createdAt: now,
      });

      created.push(task);
      prevId = subId;
    }

    eventBus.broadcast("task.created", { parentId, count: created.length });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create subtasks" }, { status: 500 });
  }
}
