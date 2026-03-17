import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { findOpenClawBinary } from "@/lib/agents/openclaw-detect";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

function parseJsonFromOutput(output: string): any {
  const clean = stripAnsi(output);
  let start = clean.indexOf("[");
  const objStart = clean.indexOf("{");
  if (objStart >= 0 && (start < 0 || objStart < start)) start = objStart;
  if (start < 0) return [];
  const openChar = clean[start];
  const closeChar = openChar === "[" ? "]" : "}";
  let depth = 0;
  let end = -1;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === openChar) depth++;
    else if (clean[i] === closeChar) { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  return JSON.parse(clean.slice(start, end + 1));
}

async function runOpenClawCommand(args: string[]): Promise<string> {
  const binaryPath = await findOpenClawBinary();
  if (!binaryPath) throw new Error("openclaw binary not found");
  const raw = execSync(`"${binaryPath}" ${args.join(" ")}`, {
    encoding: "utf-8",
    timeout: 30000,
  });
  return stripAnsi(raw);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const output = await runOpenClawCommand(["cron", "list", "--json", "2>/dev/null"]);
    const jobs = parseJsonFromOutput(output);
    const job = Array.isArray(jobs) ? jobs.find((j: any) => j.id === id) : null;
    if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json({ error: "Failed to get cron job" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Handle enable/disable
    if (body.disabled !== undefined) {
      const cmd = body.disabled ? "disable" : "enable";
      await runOpenClawCommand(["cron", cmd, id, "2>/dev/null"]);
    }

    // Handle other edits
    const editArgs = ["cron", "edit", id];
    let hasEdits = false;
    if (body.cron) { editArgs.push("--cron", `"${body.cron}"`); hasEdits = true; }
    if (body.message) { editArgs.push("--message", `"${body.message}"`); hasEdits = true; }
    if (body.agent) { editArgs.push("--agent", `"${body.agent}"`); hasEdits = true; }
    if (body.description) { editArgs.push("--description", `"${body.description}"`); hasEdits = true; }

    if (hasEdits) {
      editArgs.push("2>/dev/null");
      await runOpenClawCommand(editArgs);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cron edit error:", error);
    return NextResponse.json({ error: "Failed to update cron job" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await runOpenClawCommand(["cron", "rm", id, "2>/dev/null"]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete cron job" }, { status: 500 });
  }
}
