import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const now = Date.now();

    const updates: Record<string, any> = {
      status: "open",
      updatedAt: now,
    };
    if (body.workingDirectory) updates.workingDirectory = body.workingDirectory;
    if (body.scheduleType) updates.scheduleType = body.scheduleType;

    await db.update(tasks).set(updates).where(eq(tasks.id, id));

    const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Fire-and-forget execution for immediate schedule
    if (body.scheduleType === "immediate" && updated.assigneeAgentId) {
      const { executeTask } = await import("@/lib/agents/task-executor");
      executeTask(id).catch(err => console.error("Execution error:", err));
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to promote inbox item" }, { status: 500 });
  }
}
