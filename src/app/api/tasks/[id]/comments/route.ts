import { NextRequest, NextResponse } from "next/server"
import { nanoid } from "nanoid"
import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { tasks, activityLog } from "@/lib/db/schema"
import { eventBus } from "@/lib/events"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const comments = await db
      .select()
      .from(activityLog)
      .where(
        eq(activityLog.taskId, id)
      )
      .orderBy(asc(activityLog.createdAt))

    // Filter to comment.* and task.blocked entries
    const filtered = comments.filter(
      (c) => c.action.startsWith("comment.") || c.action === "task.blocked"
    )

    return NextResponse.json(filtered)
  } catch (error) {
    return NextResponse.json({ error: "Failed to get comments" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 })
    }

    const body = await request.json()
    if (!body.body || typeof body.body !== "string") {
      return NextResponse.json({ error: "body is required" }, { status: 400 })
    }

    const authorType = body.authorType === "agent" ? "agent" : "user"
    const action = authorType === "agent" ? "comment.agent" : "comment.user"
    const now = Date.now()
    const commentId = nanoid()

    await db.insert(activityLog).values({
      id: commentId,
      taskId: id,
      action,
      actorType: authorType as "user" | "agent",
      actorId: body.authorId || undefined,
      message: body.body,
      createdAt: now,
    })

    eventBus.broadcast("task.comment", {
      taskId: id,
      number: task.number,
      commentId,
      action,
      message: body.body,
    })

    const [entry] = await db.select().from(activityLog).where(eq(activityLog.id, commentId))
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 })
  }
}
