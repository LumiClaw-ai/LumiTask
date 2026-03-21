import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import { mkdirSync } from "fs";
import { resolve } from "path";
import * as schema from "./schema";

const DB_PATH = resolve(process.cwd(), "data", "lumitask.db");

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  mkdirSync(resolve(process.cwd(), "data"), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      description TEXT,
      adapter_type TEXT NOT NULL DEFAULT 'openclaw',
      adapter_config TEXT,
      status TEXT DEFAULT 'offline',
      version TEXT,
      last_detected_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      assignee_agent_id TEXT REFERENCES agents(id),
      working_directory TEXT,
      schedule_type TEXT DEFAULT 'manual',
      schedule_cron TEXT,
      schedule_at INTEGER,
      schedule_next_at INTEGER,
      schedule_last_at INTEGER,
      depends_on TEXT,
      parent_task_id TEXT REFERENCES tasks(id),
      input_context TEXT,
      output_result TEXT,
      concurrency_key TEXT,
      session_id TEXT,
      source_channel TEXT,
      source_account_id TEXT,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 0,
      summary TEXT,
      result TEXT,
      block_reason TEXT,
      fail_reason TEXT,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0,
      due_at INTEGER,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      source TEXT DEFAULT 'web',
      sort_order REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      message TEXT,
      details TEXT,
      tool_name TEXT,
      tool_input TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      model TEXT,
      provider TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      type TEXT NOT NULL,
      name TEXT,
      content TEXT,
      mime_type TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add new columns to existing databases (safe to run multiple times)
  const alterStatements = [
    // agents table migrations
    "ALTER TABLE agents ADD COLUMN adapter_type TEXT DEFAULT 'openclaw'",
    "ALTER TABLE agents ADD COLUMN adapter_config TEXT",
    "ALTER TABLE agents ADD COLUMN version TEXT",
    "ALTER TABLE agents ADD COLUMN last_detected_at INTEGER",
    // tasks table migrations
    "ALTER TABLE tasks ADD COLUMN working_directory TEXT",
    "ALTER TABLE tasks ADD COLUMN schedule_type TEXT DEFAULT 'manual'",
    "ALTER TABLE tasks ADD COLUMN schedule_cron TEXT",
    "ALTER TABLE tasks ADD COLUMN schedule_at INTEGER",
    "ALTER TABLE tasks ADD COLUMN schedule_next_at INTEGER",
    "ALTER TABLE tasks ADD COLUMN schedule_last_at INTEGER",
    // activity_log table migrations
    "ALTER TABLE activity_log ADD COLUMN tool_name TEXT",
    "ALTER TABLE activity_log ADD COLUMN tool_input TEXT",
    // v0.2: task dependencies & structured I/O
    "ALTER TABLE tasks ADD COLUMN depends_on TEXT",
    "ALTER TABLE tasks ADD COLUMN parent_task_id TEXT REFERENCES tasks(id)",
    "ALTER TABLE tasks ADD COLUMN input_context TEXT",
    "ALTER TABLE tasks ADD COLUMN output_result TEXT",
    "ALTER TABLE tasks ADD COLUMN concurrency_key TEXT",
    "ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN session_id TEXT",
    "ALTER TABLE tasks ADD COLUMN source_channel TEXT",
    "ALTER TABLE tasks ADD COLUMN source_account_id TEXT",
  ];

  for (const stmt of alterStatements) {
    try {
      sqlite.exec(stmt);
    } catch {
      // Column already exists, ignore
    }
  }

  return db;
}

export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

export function getNextTaskNumber(): number {
  const result = getDb().get<{ maxNum: number | null }>(
    sql`SELECT MAX(number) as maxNum FROM tasks`
  );
  return (result?.maxNum ?? 0) + 1;
}

export function getSetting(key: string, defaultValue: string = ''): string {
  const result = getDb().get<{ value: string }>(
    sql`SELECT value FROM settings WHERE key = ${key}`
  );
  return result?.value ?? defaultValue;
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().all<{ key: string; value: string }>(
    sql`SELECT key, value FROM settings`
  );
  const result: Record<string, string> = {};
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export function setSetting(key: string, value: string): void {
  getDb().run(
    sql`INSERT OR REPLACE INTO settings (key, value) VALUES (${key}, ${value})`
  );
}

export { schema };
