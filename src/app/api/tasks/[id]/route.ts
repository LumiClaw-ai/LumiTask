import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, activityLog, artifacts, agents } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Resolve agent info
    let agent = null;
    if (task.assigneeAgentId) {
      const [a] = await db.select().from(agents).where(eq(agents.id, task.assigneeAgentId));
      if (a) agent = { id: a.id, name: a.name, displayName: a.displayName, adapterType: a.adapterType };
    }

    const logs = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.taskId, id))
      .orderBy(asc(activityLog.createdAt));

    const arts = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.taskId, id));

    return NextResponse.json({ ...task, agent, activityLog: logs, artifacts: arts });
  } catch (error) {
    return NextResponse.json({ error: "Failed to get task" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const now = Date.now();

    const updates: Record<string, any> = { updatedAt: now };
    for (const field of ["title", "description", "sortOrder", "dueAt", "workingDirectory", "scheduleType", "scheduleCron", "scheduleAt"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.updated",
      actorType: "system",
      message: `Task updated`,
      createdAt: now,
    });

    eventBus.broadcast("task.updated", updated);

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Delete related records first
    await db.delete(activityLog).where(eq(activityLog.taskId, id));
    await db.delete(artifacts).where(eq(artifacts.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));

    eventBus.broadcast("task.deleted", { taskId: id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
