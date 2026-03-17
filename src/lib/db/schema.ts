import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name"),
  description: text("description"),
  adapterType: text("adapter_type").notNull(), // 'claude-code' | 'openclaw'
  adapterConfig: text("adapter_config"), // JSON
  status: text("status", { enum: ["online", "busy", "offline"] }).default("offline"),
  version: text("version"),
  lastDetectedAt: integer("last_detected_at"),
  createdAt: integer("created_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["inbox", "open", "assigned", "running", "blocked", "done", "failed", "cancelled"],
  }).notNull().default("open"),
  assigneeAgentId: text("assignee_agent_id").references(() => agents.id),
  workingDirectory: text("working_directory"),
  // Schedule
  scheduleType: text("schedule_type", { enum: ["manual", "immediate", "scheduled", "recurring"] }).default("manual"),
  scheduleCron: text("schedule_cron"),
  scheduleAt: integer("schedule_at"),
  scheduleNextAt: integer("schedule_next_at"),
  scheduleLastAt: integer("schedule_last_at"),
  // Results
  summary: text("summary"),
  result: text("result"),
  blockReason: text("block_reason"),
  failReason: text("fail_reason"),
  totalInputTokens: integer("total_input_tokens").default(0),
  totalOutputTokens: integer("total_output_tokens").default(0),
  totalCostCents: integer("total_cost_cents").default(0),
  // Timestamps
  dueAt: integer("due_at"),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  source: text("source", { enum: ["web", "chat", "cli"] }).default("web"),
  sortOrder: real("sort_order").default(0),
});

export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  action: text("action").notNull(),
  actorType: text("actor_type", { enum: ["user", "agent", "system"] }).notNull(),
  actorId: text("actor_id"),
  message: text("message"),
  details: text("details"),
  toolName: text("tool_name"),
  toolInput: text("tool_input"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  model: text("model"),
  provider: text("provider"),
  createdAt: integer("created_at").notNull(),
});

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  type: text("type", { enum: ["file", "url", "text", "json", "image"] }).notNull(),
  name: text("name"),
  content: text("content"),
  mimeType: text("mime_type"),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
