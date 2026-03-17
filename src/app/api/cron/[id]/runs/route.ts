import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { findOpenClawBinary } from "@/lib/agents/openclaw-detect";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

function parseJsonFromOutput(output: string): any {
  const clean = stripAnsi(output);
  let start = clean.indexOf("[");
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === "[") depth++;
    else if (clean[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  return JSON.parse(clean.slice(start, end + 1));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const binaryPath = await findOpenClawBinary();
    if (!binaryPath) return NextResponse.json([]);

    const raw = execSync(`"${binaryPath}" cron runs --json --id ${id} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    const runs = parseJsonFromOutput(raw);
    return NextResponse.json(Array.isArray(runs) ? runs : []);
  } catch (error) {
    return NextResponse.json([]);
  }
}
