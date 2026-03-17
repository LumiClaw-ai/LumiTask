import { NextRequest, NextResponse } from "next/server";
import { readSessionTail } from "@/lib/session-observer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get("agentId");
    const lines = parseInt(searchParams.get("lines") || "20", 10);

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const messages = readSessionTail(agentId, sessionId, lines);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Session tail error:", error);
    return NextResponse.json({ error: "Failed to read session tail" }, { status: 500 });
  }
}
