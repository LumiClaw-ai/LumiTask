import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, agents } from "@/lib/db/schema";
import { sql, eq, desc, inArray } from "drizzle-orm";

export async function GET() {
  try {
    // Count by status
    const allTasks = await db.select({
      status: tasks.status,
    }).from(tasks);

    const stats = { total: 0, running: 0, blocked: 0, inbox: 0, done: 0 };
    for (const t of allTasks) {
      if (t.status !== "cancelled") stats.total++;
      if (t.status === "running") stats.running++;
      if (t.status === "blocked") stats.blocked++;
      if (t.status === "inbox") stats.inbox++;
      if (t.status === "done") stats.done++;
    }

    // Recent completed/failed tasks
    const recentTasks = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.status, ["done", "failed"]))
      .orderBy(desc(tasks.completedAt))
      .limit(10);

    // Enrich with agent names
    const agentsList = await db.select().from(agents);
    const agentMap = new Map(agentsList.map(a => [a.id, a.displayName || a.name]));

    const enrichedRecent = recentTasks.map(t => ({
      ...t,
      agentName: t.assigneeAgentId ? agentMap.get(t.assigneeAgentId) || null : null,
    }));

    // Usage totals
    const usageResult = await db.get<{ totalTokens: number | null; totalCost: number | null }>(
      sql`SELECT COALESCE(SUM(total_input_tokens + total_output_tokens), 0) as totalTokens, COALESCE(SUM(total_cost_cents), 0) as totalCost FROM tasks`
    );

    return NextResponse.json({
      stats,
      recentTasks: enrichedRecent,
      usage: {
        totalTokens: usageResult?.totalTokens ?? 0,
        totalCost: usageResult?.totalCost ?? 0,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
