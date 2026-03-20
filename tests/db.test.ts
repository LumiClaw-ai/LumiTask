import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, and, isNull, desc, asc, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import * as schema from '../src/lib/db/schema'

const { tasks, agents, activityLog, artifacts, settings } = schema

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      description TEXT,
      adapter_type TEXT NOT NULL DEFAULT 'claude-code',
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
  `)

  return drizzle(sqlite, { schema })
}

let db: ReturnType<typeof createTestDb>

beforeEach(() => {
  db = createTestDb()
})

describe('Task CRUD', () => {
  it('creates a task with correct fields', async () => {
    const now = Date.now()
    const id = nanoid()
    await db.insert(tasks).values({
      id,
      number: 1,
      title: 'Test task',
      description: 'A description',
      createdAt: now,
      updatedAt: now,
    })

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
    expect(task).toBeDefined()
    expect(task.title).toBe('Test task')
    expect(task.description).toBe('A description')
    expect(task.status).toBe('open')
    expect(task.number).toBe(1)
    expect(task.totalInputTokens).toBe(0)
    expect(task.totalOutputTokens).toBe(0)
  })

  it('auto-incrementing task numbers', async () => {
    const now = Date.now()
    for (let i = 1; i <= 3; i++) {
      await db.insert(tasks).values({
        id: nanoid(),
        number: i,
        title: `Task ${i}`,
        createdAt: now,
        updatedAt: now,
      })
    }

    const result = db.get<{ maxNum: number | null }>(
      sql`SELECT MAX(number) as maxNum FROM tasks`
    )
    expect(result?.maxNum).toBe(3)
  })

  it('updates title and description', async () => {
    const now = Date.now()
    const id = nanoid()
    await db.insert(tasks).values({ id, number: 1, title: 'Old', createdAt: now, updatedAt: now })

    await db.update(tasks).set({ title: 'New', description: 'Updated desc', updatedAt: Date.now() }).where(eq(tasks.id, id))

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
    expect(task.title).toBe('New')
    expect(task.description).toBe('Updated desc')
  })

  it('lists tasks filtered by status', async () => {
    const now = Date.now()
    await db.insert(tasks).values([
      { id: nanoid(), number: 1, title: 'Open task', status: 'open', createdAt: now, updatedAt: now },
      { id: nanoid(), number: 2, title: 'Done task', status: 'done', createdAt: now, updatedAt: now },
      { id: nanoid(), number: 3, title: 'Another open', status: 'open', createdAt: now, updatedAt: now },
    ])

    const openTasks = await db.select().from(tasks).where(eq(tasks.status, 'open'))
    expect(openTasks).toHaveLength(2)

    const doneTasks = await db.select().from(tasks).where(eq(tasks.status, 'done'))
    expect(doneTasks).toHaveLength(1)
  })

  it('lists tasks filtered by unassigned', async () => {
    const now = Date.now()
    const agentId = nanoid()
    await db.insert(agents).values({ id: agentId, name: 'agent-1', adapterType: 'claude-code', createdAt: now })

    await db.insert(tasks).values([
      { id: nanoid(), number: 1, title: 'Unassigned', createdAt: now, updatedAt: now },
      { id: nanoid(), number: 2, title: 'Assigned', assigneeAgentId: agentId, createdAt: now, updatedAt: now },
    ])

    const unassigned = await db.select().from(tasks).where(isNull(tasks.assigneeAgentId))
    expect(unassigned).toHaveLength(1)
    expect(unassigned[0].title).toBe('Unassigned')
  })

  it('stores workingDirectory and scheduleType', async () => {
    const now = Date.now()
    const id = nanoid()
    await db.insert(tasks).values({
      id,
      number: 1,
      title: 'Scheduled task',
      workingDirectory: '/tmp/work',
      scheduleType: 'immediate',
      createdAt: now,
      updatedAt: now,
    })

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id))
    expect(task.workingDirectory).toBe('/tmp/work')
    expect(task.scheduleType).toBe('immediate')
  })
})

describe('Task State Machine', () => {
  it('open -> assigned -> running -> done', async () => {
    const now = Date.now()
    const taskId = nanoid()
    const agentId = nanoid()
    await db.insert(agents).values({ id: agentId, name: 'bot', adapterType: 'claude-code', createdAt: now })
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Flow test', createdAt: now, updatedAt: now })

    // Assign
    await db.update(tasks).set({ status: 'assigned', assigneeAgentId: agentId, updatedAt: Date.now() }).where(eq(tasks.id, taskId))
    let [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('assigned')
    expect(task.assigneeAgentId).toBe(agentId)

    // Start
    const startTime = Date.now()
    await db.update(tasks).set({ status: 'running', startedAt: startTime, updatedAt: startTime }).where(eq(tasks.id, taskId))
    ;[task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('running')
    expect(task.startedAt).toBe(startTime)

    // Complete
    const completeTime = Date.now()
    await db.update(tasks).set({ status: 'done', summary: 'All done', completedAt: completeTime, updatedAt: completeTime }).where(eq(tasks.id, taskId))
    ;[task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('done')
    expect(task.summary).toBe('All done')
    expect(task.completedAt).toBe(completeTime)
  })

  it('open -> assigned -> running -> blocked -> reopened', async () => {
    const now = Date.now()
    const taskId = nanoid()
    const agentId = nanoid()
    await db.insert(agents).values({ id: agentId, name: 'bot2', adapterType: 'claude-code', createdAt: now })
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Block test', createdAt: now, updatedAt: now })

    await db.update(tasks).set({ status: 'assigned', assigneeAgentId: agentId, updatedAt: now }).where(eq(tasks.id, taskId))
    await db.update(tasks).set({ status: 'running', startedAt: now, updatedAt: now }).where(eq(tasks.id, taskId))

    // Block
    await db.update(tasks).set({ status: 'blocked', blockReason: 'Need info', updatedAt: now }).where(eq(tasks.id, taskId))
    let [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('blocked')
    expect(task.blockReason).toBe('Need info')

    // Reopen
    await db.update(tasks).set({ status: 'open', assigneeAgentId: null, blockReason: null, failReason: null, updatedAt: now }).where(eq(tasks.id, taskId))
    ;[task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('open')
    expect(task.blockReason).toBeNull()
    expect(task.assigneeAgentId).toBeNull()
  })

  it('open -> assigned -> running -> failed -> reopened', async () => {
    const now = Date.now()
    const taskId = nanoid()
    const agentId = nanoid()
    await db.insert(agents).values({ id: agentId, name: 'bot3', adapterType: 'claude-code', createdAt: now })
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Fail test', createdAt: now, updatedAt: now })

    await db.update(tasks).set({ status: 'assigned', assigneeAgentId: agentId, updatedAt: now }).where(eq(tasks.id, taskId))
    await db.update(tasks).set({ status: 'running', startedAt: now, updatedAt: now }).where(eq(tasks.id, taskId))

    // Fail
    await db.update(tasks).set({ status: 'failed', failReason: 'Crashed', updatedAt: now }).where(eq(tasks.id, taskId))
    let [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('failed')
    expect(task.failReason).toBe('Crashed')

    // Reopen
    await db.update(tasks).set({ status: 'open', assigneeAgentId: null, blockReason: null, failReason: null, updatedAt: now }).where(eq(tasks.id, taskId))
    ;[task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.status).toBe('open')
    expect(task.failReason).toBeNull()
  })
})

describe('Activity Log', () => {
  it('inserts and retrieves activity log entries', async () => {
    const now = Date.now()
    const taskId = nanoid()
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Log test', createdAt: now, updatedAt: now })

    await db.insert(activityLog).values([
      { id: nanoid(), taskId, action: 'task.created', actorType: 'system', message: 'Created', createdAt: now },
      { id: nanoid(), taskId, action: 'task.started', actorType: 'system', message: 'Started', createdAt: now + 1000 },
    ])

    const logs = await db.select().from(activityLog).where(eq(activityLog.taskId, taskId)).orderBy(asc(activityLog.createdAt))
    expect(logs).toHaveLength(2)
    expect(logs[0].action).toBe('task.created')
    expect(logs[1].action).toBe('task.started')
  })

  it('tracks tokens and updates task totals', async () => {
    const now = Date.now()
    const taskId = nanoid()
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Token test', createdAt: now, updatedAt: now })

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId,
      action: 'task.progress',
      actorType: 'agent',
      inputTokens: 100,
      outputTokens: 50,
      createdAt: now,
    })

    await db.update(tasks).set({
      totalInputTokens: sql`${tasks.totalInputTokens} + 100`,
      totalOutputTokens: sql`${tasks.totalOutputTokens} + 50`,
      updatedAt: now,
    }).where(eq(tasks.id, taskId))

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task.totalInputTokens).toBe(100)
    expect(task.totalOutputTokens).toBe(50)

    await db.update(tasks).set({
      totalInputTokens: sql`${tasks.totalInputTokens} + 200`,
      totalOutputTokens: sql`${tasks.totalOutputTokens} + 100`,
      updatedAt: now,
    }).where(eq(tasks.id, taskId))

    const [task2] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task2.totalInputTokens).toBe(300)
    expect(task2.totalOutputTokens).toBe(150)
  })

  it('stores toolName and toolInput', async () => {
    const now = Date.now()
    const taskId = nanoid()
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Tool test', createdAt: now, updatedAt: now })

    await db.insert(activityLog).values({
      id: nanoid(),
      taskId,
      action: 'tool.call',
      actorType: 'agent',
      toolName: 'Read',
      toolInput: JSON.stringify({ file_path: '/tmp/test.txt' }),
      createdAt: now,
    })

    const [log] = await db.select().from(activityLog).where(eq(activityLog.taskId, taskId))
    expect(log.toolName).toBe('Read')
    expect(JSON.parse(log.toolInput!)).toEqual({ file_path: '/tmp/test.txt' })
  })
})

describe('Agents', () => {
  it('registers an agent with adapterType', async () => {
    const now = Date.now()
    const id = nanoid()
    await db.insert(agents).values({
      id,
      name: 'coder-bot',
      displayName: 'Coder Bot',
      description: 'Writes code',
      adapterType: 'claude-code',
      createdAt: now,
    })

    const [agent] = await db.select().from(agents).where(eq(agents.id, id))
    expect(agent.name).toBe('coder-bot')
    expect(agent.displayName).toBe('Coder Bot')
    expect(agent.adapterType).toBe('claude-code')
  })

  it('lists agents ordered by name', async () => {
    const now = Date.now()
    await db.insert(agents).values([
      { id: nanoid(), name: 'zebra', adapterType: 'claude-code', createdAt: now },
      { id: nanoid(), name: 'alpha', adapterType: 'claude-code', createdAt: now },
    ])

    const result = await db.select().from(agents).orderBy(asc(agents.name))
    expect(result[0].name).toBe('alpha')
    expect(result[1].name).toBe('zebra')
  })

  it('updates lastDetectedAt', async () => {
    const now = Date.now()
    const id = nanoid()
    await db.insert(agents).values({ id, name: 'checker', adapterType: 'claude-code', createdAt: now })

    const detectTime = Date.now()
    await db.update(agents).set({ lastDetectedAt: detectTime }).where(eq(agents.id, id))

    const [agent] = await db.select().from(agents).where(eq(agents.id, id))
    expect(agent.lastDetectedAt).toBe(detectTime)
  })

  it('enforces unique agent name', async () => {
    const now = Date.now()
    await db.insert(agents).values({ id: nanoid(), name: 'unique-bot', adapterType: 'claude-code', createdAt: now })

    await expect(
      db.insert(agents).values({ id: nanoid(), name: 'unique-bot', adapterType: 'claude-code', createdAt: now })
    ).rejects.toThrow()
  })
})

describe('Settings', () => {
  it('inserts and retrieves settings', async () => {
    await db.insert(settings).values({ key: 'theme', value: 'dark' })

    const [setting] = await db.select().from(settings).where(eq(settings.key, 'theme'))
    expect(setting.value).toBe('dark')
  })

  it('upserts settings via raw SQL', async () => {
    db.run(sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('dir', '/tmp')`)
    let result = db.get<{ value: string }>(sql`SELECT value FROM settings WHERE key = 'dir'`)
    expect(result?.value).toBe('/tmp')

    db.run(sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('dir', '/home')`)
    result = db.get<{ value: string }>(sql`SELECT value FROM settings WHERE key = 'dir'`)
    expect(result?.value).toBe('/home')
  })
})

describe('Artifacts', () => {
  it('adds and lists artifacts for a task', async () => {
    const now = Date.now()
    const taskId = nanoid()
    await db.insert(tasks).values({ id: taskId, number: 1, title: 'Artifact test', createdAt: now, updatedAt: now })

    await db.insert(artifacts).values([
      { id: nanoid(), taskId, type: 'file', name: 'output.txt', content: 'hello', createdAt: now },
      { id: nanoid(), taskId, type: 'url', name: 'link', content: 'https://example.com', createdAt: now },
    ])

    const arts = await db.select().from(artifacts).where(eq(artifacts.taskId, taskId))
    expect(arts).toHaveLength(2)
    expect(arts.map(a => a.type).sort()).toEqual(['file', 'url'])
  })
})
