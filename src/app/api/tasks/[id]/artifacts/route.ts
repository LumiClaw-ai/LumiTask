import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artifacts } from "@/lib/db/schema";
import { eventBus } from "@/lib/events";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.taskId, id));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Failed to list artifacts" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const now = Date.now();

    const artifact = {
      id: nanoid(),
      taskId: id,
      type: body.type,
      name: body.name ?? null,
      content: body.content,
      mimeType: body.mimeType ?? null,
      createdAt: now,
    };

    await db.insert(artifacts).values(artifact);

    eventBus.broadcast("task.artifact", artifact);

    return NextResponse.json(artifact, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create artifact" }, { status: 500 });
  }
}
