import { NextRequest, NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { executeTask } from "@/lib/agents/task-executor";

import { getSetting } from "@/lib/db";

function getMaxConcurrent(): number {
  try {
    const val = getSetting('maxConcurrentPerAgent', '1');
    const n = parseInt(val, 10);
    return n > 0 ? n : 1;
  } catch { return 1; }
}

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

    // Check per-agent concurrency
    const [running] = await db.select({
      count: sql<number>`count(*)`,
    }).from(tasks).where(
      and(eq(tasks.status, 'running'), eq(tasks.assigneeAgentId, task.assigneeAgentId))
    );

    if ((running?.count || 0) >= getMaxConcurrent()) {
      // Agent is busy — queue the task for automatic dispatch when current finishes
      await db.update(tasks).set({
        status: 'open',
        scheduleType: 'immediate',
        updatedAt: Date.now(),
      }).where(eq(tasks.id, id));

      return NextResponse.json({
        status: "queued",
        message: `Agent 正在执行其他任务，已加入队列等待`,
      });
    }

    executeTask(id).catch(err => console.error("Execution error:", err));

    return NextResponse.json({ status: "executing" });
  } catch (error) {
    return NextResponse.json({ error: "Failed to execute task" }, { status: 500 });
  }
}
