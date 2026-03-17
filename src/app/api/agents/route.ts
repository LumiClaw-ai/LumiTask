import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export async function GET() {
  try {
    const result = await db
      .select()
      .from(agents)
      .orderBy(asc(agents.name));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Failed to list agents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = Date.now();

    const agent = {
      id: nanoid(),
      name: body.name,
      displayName: body.displayName ?? null,
      description: body.description ?? null,
      adapterType: body.adapterType ?? "claude-code",
      adapterConfig: body.adapterConfig ? JSON.stringify(body.adapterConfig) : null,
      createdAt: now,
    };

    await db.insert(agents).values(agent);

    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
  }
}
