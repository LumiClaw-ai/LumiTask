import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { testDb, getNextTaskNumber, getSetting, setSetting } = await vi.hoisted(async () => {
  const Database = (await import('better-sqlite3')).default
  const { drizzle } = await import('drizzle-orm/better-sqlite3')
  const { sql } = await import('drizzle-orm')
  const s = await import('../src/lib/db/schema')

  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`
    CREATE TABLE agents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, display_name TEXT,
      description TEXT, adapter_type TEXT NOT NULL DEFAULT 'claude-code',
      adapter_config TEXT, status TEXT DEFAULT 'offline', version TEXT,
      last_detected_at INTEGER, created_at INTEGER NOT NULL
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY, number INTEGER NOT NULL, title TEXT NOT NULL,
      description TEXT, status TEXT NOT NULL DEFAULT 'open',
      assignee_agent_id TEXT REFERENCES agents(id), working_directory TEXT,
      schedule_type TEXT DEFAULT 'manual', schedule_cron TEXT,
      schedule_at INTEGER, schedule_next_at INTEGER, schedule_last_at INTEGER,
      summary TEXT, result TEXT, block_reason TEXT, fail_reason TEXT,
      total_input_tokens INTEGER DEFAULT 0, total_output_tokens INTEGER DEFAULT 0,
      total_cost_cents INTEGER DEFAULT 0, due_at INTEGER, started_at INTEGER,
      completed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      source TEXT DEFAULT 'web', sort_order REAL DEFAULT 0
    );
    CREATE TABLE activity_log (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
      action TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT,
      message TEXT, details TEXT, tool_name TEXT, tool_input TEXT,
      input_tokens INTEGER, output_tokens INTEGER,
      model TEXT, provider TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE artifacts (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
      type TEXT NOT NULL, name TEXT, content TEXT, mime_type TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
  `)

  const db = drizzle(sqlite, { schema: s })

  function getNextTaskNumber(): number {
    const result = db.get<{ maxNum: number | null }>(
      sql`SELECT MAX(number) as maxNum FROM tasks`
    )
    return (result?.maxNum ?? 0) + 1
  }

  function getSetting(key: string, defaultValue: string = ''): string {
    const result = db.get<{ value: string }>(
      sql`SELECT value FROM settings WHERE key = ${key}`
    )
    return result?.value ?? defaultValue
  }

  function setSetting(key: string, value: string): void {
    db.run(
      sql`INSERT OR REPLACE INTO settings (key, value) VALUES (${key}, ${value})`
    )
  }

  return { testDb: db, getNextTaskNumber, getSetting, setSetting }
})

vi.mock('@/lib/db', () => ({
  db: testDb,
  getDb: () => testDb,
  getNextTaskNumber,
  getSetting,
  setSetting,
}))

vi.mock('@/lib/events', () => ({
  eventBus: { broadcast: vi.fn() },
}))

const { GET: getTasks, POST: createTask } = await import('../src/app/api/tasks/route')
const { GET: getTask, PATCH: patchTask } = await import('../src/app/api/tasks/[id]/route')
const { POST: assignTask } = await import('../src/app/api/tasks/[id]/assign/route')
const { POST: startTask } = await import('../src/app/api/tasks/[id]/start/route')
const { POST: completeTask } = await import('../src/app/api/tasks/[id]/complete/route')
const { POST: blockTask } = await import('../src/app/api/tasks/[id]/block/route')
const { POST: logProgress } = await import('../src/app/api/tasks/[id]/log/route')
const { POST: reopenTask } = await import('../src/app/api/tasks/[id]/reopen/route')
const { GET: getAgents, POST: createAgent } = await import('../src/app/api/agents/route')
const { GET: getSettings, PATCH: patchSettings } = await import('../src/app/api/settings/route')

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), options)
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('API Routes', () => {
  let taskId: string
  let agentId: string

  it('POST /api/agents creates an agent', async () => {
    const req = makeRequest('http://localhost/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'test-agent', displayName: 'Test Agent', adapterType: 'claude-code' }),
    })
    const res = await createAgent(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.name).toBe('test-agent')
    expect(data.adapterType).toBe('claude-code')
    agentId = data.id
  })

  it('GET /api/agents lists agents', async () => {
    const res = await getAgents()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  it('POST /api/tasks creates a task', async () => {
    const req = makeRequest('http://localhost/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'API test task', description: 'Testing the API' }),
    })
    const res = await createTask(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.title).toBe('API test task')
    expect(data.number).toBe(1)
    expect(data.scheduleType).toBe('manual')
    taskId = data.id
  })

  it('GET /api/tasks returns list', async () => {
    const req = makeRequest('http://localhost/api/tasks')
    const res = await getTasks(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/tasks/:id returns task with activityLog', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}`)
    const res = await getTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(taskId)
    expect(data.activityLog).toBeDefined()
    expect(data.activityLog.length).toBeGreaterThanOrEqual(1)
    expect(data.artifacts).toBeDefined()
  })

  it('POST /api/tasks/:id/assign assigns agent', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })
    const res = await assignTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('assigned')
    expect(data.assigneeAgentId).toBe(agentId)
  })

  it('POST /api/tasks/:id/start starts task', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}/start`, { method: 'POST' })
    const res = await startTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('running')
    expect(data.startedAt).toBeDefined()
  })

  it('POST /api/tasks/:id/log logs progress with tokens', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Making progress', inputTokens: 500, outputTokens: 200, actorType: 'agent' }),
    })
    const res = await logProgress(req, makeParams(taskId))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.message).toBe('Making progress')
    expect(data.inputTokens).toBe(500)
  })

  it('POST /api/tasks/:id/block blocks task', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Need clarification' }),
    })
    const res = await blockTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('blocked')
    expect(data.blockReason).toBe('Need clarification')
  })

  it('POST /api/tasks/:id/reopen reopens task', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}/reopen`, { method: 'POST' })
    const res = await reopenTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('open')
    expect(data.blockReason).toBeNull()
    expect(data.assigneeAgentId).toBeNull()
  })

  it('POST /api/tasks/:id/complete completes task', async () => {
    const assignReq = makeRequest(`http://localhost/api/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    })
    await assignTask(assignReq, makeParams(taskId))

    const startReq = makeRequest(`http://localhost/api/tasks/${taskId}/start`, { method: 'POST' })
    await startTask(startReq, makeParams(taskId))

    const req = makeRequest(`http://localhost/api/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: 'Task completed successfully', result: 'All tests pass' }),
    })
    const res = await completeTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('done')
    expect(data.summary).toBe('Task completed successfully')
    expect(data.result).toBe('All tests pass')
    expect(data.completedAt).toBeDefined()
  })

  it('GET /api/tasks/:id returns 404 for missing task', async () => {
    const req = makeRequest('http://localhost/api/tasks/nonexistent')
    const res = await getTask(req, makeParams('nonexistent'))
    expect(res.status).toBe(404)
  })

  it('PATCH /api/tasks/:id updates task fields', async () => {
    const req = makeRequest(`http://localhost/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated title', workingDirectory: '/tmp/work' }),
    })
    const res = await patchTask(req, makeParams(taskId))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.title).toBe('Updated title')
    expect(data.workingDirectory).toBe('/tmp/work')
  })

  it('GET /api/settings returns settings', async () => {
    const res = await getSettings()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeDefined()
    expect(typeof data.defaultWorkingDirectory).toBe('string')
  })

  it('PATCH /api/settings updates settings', async () => {
    const req = makeRequest('http://localhost/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'defaultWorkingDirectory', value: '/tmp/custom' }),
    })
    const res = await patchSettings(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.defaultWorkingDirectory).toBe('/tmp/custom')
  })
})
