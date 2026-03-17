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
    else if (clean[i] === closeChar) {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  return JSON.parse(clean.slice(start, end + 1));
}

// File-based cache (survives Next.js dev module reloads)
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const CACHE_DIR = join(process.cwd(), "data");
const CACHE_FILE = join(CACHE_DIR, ".cron-cache.json");
const CACHE_TTL = 60000;

function readCache(): { data: any[]; timestamp: number } | null {
  try {
    const raw = readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch { return null; }
}

function writeCache(data: any[]) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

async function getCronJobsCached(): Promise<any[]> {
  const cache = readCache();
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }

  const binaryPath = await findOpenClawBinary();
  if (!binaryPath) return cache?.data || [];

  try {
    const raw = execSync(`"${binaryPath}" cron list --json 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    const jobs = parseJsonFromOutput(stripAnsi(raw));
    const result = Array.isArray(jobs) ? jobs : [];
    writeCache(result);
    return result;
  } catch {
    return cache?.data || [];
  }
}

function invalidateCronCache() {
  try { writeFileSync(CACHE_FILE, JSON.stringify({ data: [], timestamp: 0 })); } catch {}
}

export async function GET() {
  try {
    const jobs = await getCronJobsCached();
    return NextResponse.json(jobs);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const binaryPath = await findOpenClawBinary();
    if (!binaryPath) throw new Error("openclaw not found");

    const args = ["cron", "add"];
    if (body.cron) args.push("--cron", `"${body.cron}"`);
    if (body.message) args.push("--message", `"${body.message}"`);
    if (body.agent) args.push("--agent", `"${body.agent}"`);
    if (body.description) args.push("--description", `"${body.description}"`);
    if (body.announce) args.push("--announce");

    execSync(`"${binaryPath}" ${args.join(" ")} 2>/dev/null`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    invalidateCronCache();
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create cron job" }, { status: 500 });
  }
}

export { getCronJobsCached, invalidateCronCache };
