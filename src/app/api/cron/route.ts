import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { findOpenClawBinary } from "@/lib/agents/openclaw-detect";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "").trim();
}

function parseJsonFromOutput(output: string): unknown {
  const clean = stripAnsi(output);
  // Find the first [ or {
  let start = -1;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === "[" || clean[i] === "{") { start = i; break; }
  }
  if (start < 0) return [];

  // Use a stack to handle all bracket types correctly
  const pairs: Record<string, string> = { "{": "}", "[": "]" };
  const closers = new Set(Object.values(pairs));
  const stack: string[] = [];
  let end = -1;

  for (let i = start; i < clean.length; i++) {
    const ch = clean[i];
    if (pairs[ch]) {
      stack.push(pairs[ch]);
    } else if (closers.has(ch)) {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) break;
      stack.pop();
      if (stack.length === 0) { end = i; break; }
    }
  }

  if (end < 0) return [];
  try { return JSON.parse(clean.slice(start, end + 1)); }
  catch { return []; }
}

/** Map OpenClaw local job format to LumiTask CronJob format */
function mapOpenClawJob(job: any): any {
  return {
    id: job.id,
    name: job.name || "",
    description: job.payload?.message || "",
    cron: job.schedule?.expr || "",
    every: job.schedule?.kind === "interval" ? job.schedule?.expr : undefined,
    agent: job.agentId || "",
    message: job.payload?.message || "",
    enabled: job.enabled ?? true,
    lastRunAt: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : undefined,
    nextRunAt: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : undefined,
  };
}

/** Read cron jobs directly from ~/.openclaw/cron/jobs.json */
function readLocalCronJobs(): any[] {
  try {
    const openclawHome = process.env.OPENCLAW_HOME || join(homedir(), ".openclaw");
    const jobsPath = join(openclawHome, "cron", "jobs.json");
    if (!existsSync(jobsPath)) return [];
    const data = JSON.parse(readFileSync(jobsPath, "utf-8"));
    return (data.jobs || []).map(mapOpenClawJob);
  } catch { return []; }
}

// File-based cache (survives Next.js dev module reloads)
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

  // Try CLI first
  const binaryPath = await findOpenClawBinary();
  if (binaryPath) {
    try {
      const raw = execSync(`"${binaryPath}" cron list --json 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 30000,
      });
      const parsed = parseJsonFromOutput(raw);
      // CLI returns { jobs: [...] } or [...]
      let jobs: any[];
      if (Array.isArray(parsed)) {
        jobs = parsed;
      } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).jobs)) {
        jobs = (parsed as any).jobs.map(mapOpenClawJob);
      } else {
        jobs = [];
      }
      if (jobs.length > 0) {
        writeCache(jobs);
        return jobs;
      }
    } catch {}
  }

  // Fallback: read local jobs.json directly
  const localJobs = readLocalCronJobs();
  if (localJobs.length > 0) {
    writeCache(localJobs);
    return localJobs;
  }

  return cache?.data || [];
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
