import { NextResponse } from "next/server";
import { syncDetectedAgents } from "@/lib/agents/detect";

export async function GET() {
  try {
    const agents = await syncDetectedAgents();
    return NextResponse.json(agents);
  } catch (error) {
    return NextResponse.json({ error: "Failed to detect agents" }, { status: 500 });
  }
}
