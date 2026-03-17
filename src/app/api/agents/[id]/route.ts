import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    return NextResponse.json(agent);
  } catch (error) {
    return NextResponse.json({ error: "Failed to get agent" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, any> = {};
    for (const field of ["name", "displayName", "description", "status", "adapterType", "version"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (body.adapterConfig !== undefined) {
      updates.adapterConfig = JSON.stringify(body.adapterConfig);
    }

    await db.update(agents).set(updates).where(eq(agents.id, id));

    const [updated] = await db.select().from(agents).where(eq(agents.id, id));
    if (!updated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
  }
}
