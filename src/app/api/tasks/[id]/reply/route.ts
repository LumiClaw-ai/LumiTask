import { NextRequest, NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { tasks, activityLog, agents } from "@/lib/db/schema"
import { eventBus } from "@/lib/events"
import { adapterManager } from "@/lib/agents/adapter-manager"
import { executeTask } from "@/lib/agents/task-executor"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if (!body.body || typeof body.body !== "string") {
      return NextResponse.json({ error: "body is required" }, { status: 400 })
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const now = Date.now()

    // 1. Add comment.user to activity log
    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "comment.user",
      actorType: "user",
      message: body.body,
      createdAt: now,
    })

    eventBus.broadcast("task.comment", {
      taskId: id,
      number: task.number,
      action: "comment.user",
      message: body.body,
    })

    // 2. If blocked and process is alive, try stdin reply
    if (task.status === "blocked" && task.assigneeAgentId) {
      const [agent] = await db.select().from(agents).where(eq(agents.id, task.assigneeAgentId))
      if (agent) {
        const adapter = adapterManager.get(agent.adapterType)
        if (adapter) {
          const replySucceeded = await adapter.reply(id, body.body)
          if (replySucceeded) {
            await db.update(tasks).set({
              status: "running" as const,
              blockReason: null,
              updatedAt: Date.now(),
            }).where(eq(tasks.id, id))

            await db.insert(activityLog).values({
              id: nanoid(),
              taskId: id,
              action: "task.unblocked",
              actorType: "user",
              message: "User replied, task resumed",
              createdAt: Date.now(),
            })

            eventBus.broadcast("task.unblocked", { taskId: id, number: task.number })
            eventBus.broadcast("task.updated", { taskId: id, number: task.number })

            return NextResponse.json({ ok: true, fallback: false })
          }
        }
      }
    }

    // 3. Re-execute with follow-up context (don't modify original description)
    // Store the follow-up instruction in a separate field for the executor to use
    const previousResult = [task.summary, task.result].filter(Boolean).join("\n")
    const followUpPrompt = `原始任务: ${task.title}\n${task.description || ""}\n\n上次执行结果:\n${previousResult || "(无)"}\n\n用户追加指令:\n${body.body}\n\n请根据用户的追加指令，在上次结果的基础上继续执行。`

    // Reset task for re-execution without changing title/description
    await db.update(tasks).set({
      status: "open" as const,
      blockReason: null,
      failReason: null,
      completedAt: null,
      startedAt: null,
      updatedAt: Date.now(),
    }).where(eq(tasks.id, id))

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId: id,
      action: "task.reopened",
      actorType: "user",
      message: `用户追加指令并继续执行: ${body.body.slice(0, 200)}`,
      createdAt: Date.now(),
    })

    eventBus.broadcast("task.updated", { taskId: id, number: task.number })

    // Execute with the follow-up prompt as override description
    // We pass it via a temporary approach: update a transient field
    // Better: pass directly to executeTask
    const { executeTaskWithPrompt } = await import("@/lib/agents/task-executor")
    executeTaskWithPrompt(id, followUpPrompt).catch(() => {})

    return NextResponse.json({ ok: true, fallback: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to reply" }, { status: 500 })
  }
}
