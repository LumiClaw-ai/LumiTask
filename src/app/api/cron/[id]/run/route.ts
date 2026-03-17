import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { findOpenClawBinary } from "@/lib/agents/openclaw-detect";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const binaryPath = await findOpenClawBinary();
    if (!binaryPath) return NextResponse.json({ error: "openclaw not found" }, { status: 500 });

    // Fire and forget
    execSync(`"${binaryPath}" cron run ${id} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 30000,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cron run error:", error);
    return NextResponse.json({ error: "Failed to run cron job" }, { status: 500 });
  }
}
