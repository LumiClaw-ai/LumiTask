import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { executeTask } from "@/lib/agents/task-executor";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    if (!task.assigneeAgentId) {
      return NextResponse.json({ error: "No agent assigned" }, { status: 400 });
    }

    executeTask(id).catch(err => console.error("Execution error:", err));

    return NextResponse.json({ status: "executing" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to execute task" }, { status: 500 });
  }
}
