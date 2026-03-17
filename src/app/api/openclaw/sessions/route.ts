import { NextResponse } from "next/server";
import { getActiveSessions, getAgentLiveStatuses } from "@/lib/session-observer";

export async function GET() {
  try {
    const activeSessions = getActiveSessions();
    const agentStatuses = getAgentLiveStatuses();

    return NextResponse.json({ activeSessions, agentStatuses });
  } catch (error) {
    console.error("Sessions error:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}
