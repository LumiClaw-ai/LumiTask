import { eq, and, lte, inArray, or, sql, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { executeTask } from './task-executor'
import { canAcquire, acquire } from './concurrency'
import { eventBus } from '@/lib/events'

// Per-agent max concurrent tasks
const DEFAULT_MAX_CONCURRENT = 1

let schedulerInterval: NodeJS.Timeout | null = null

export function startScheduler(intervalMs = 60000) {
  if (schedulerInterval) return

  console.log(`[Scheduler] Started (event-driven + fallback every ${intervalMs / 1000}s)`)

  // Event-driven: when a task finishes, immediately try to dispatch next for that agent
  eventBus.on(async (event, data) => {
    if (event === 'task.completed' || event === 'task.failed') {
      const taskId = data?.taskId
      if (!taskId) return

      // Find which agent just finished
      const [finished] = await db.select({ assigneeAgentId: tasks.assigneeAgentId })
        .from(tasks).where(eq(tasks.id, taskId))
      if (finished?.assigneeAgentId) {
        console.log(`[Scheduler] Agent ${finished.assigneeAgentId} finished task, checking queue...`)
        await dispatchForAgent(finished.assigneeAgentId)
      }
    }

    // When a new task is created, try to dispatch it
    if (event === 'task.created') {
      const agentId = data?.assigneeAgentId
      if (agentId) {
        await dispatchForAgent(agentId)
      }
    }
  })

  // Fallback: periodic sweep for scheduled/recurring tasks and edge cases
  schedulerInterval = setInterval(() => sweepAll(), intervalMs)
  // Initial sweep on start
  sweepAll()
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('[Scheduler] Stopped')
  }
}

/** Check if all dependency tasks are done */
function checkDependencies(dependsOnJson: string | null, statusMap: Map<string, string>): 'ready' | 'waiting' | 'failed' {
  if (!dependsOnJson) return 'ready'

  let depIds: string[]
  try { depIds = JSON.parse(dependsOnJson) }
  catch { return 'ready' }

  if (!Array.isArray(depIds) || depIds.length === 0) return 'ready'

  for (const depId of depIds) {
    const status = statusMap.get(depId)
    if (status === 'failed' || status === 'cancelled') return 'failed'
    if (status !== 'done') return 'waiting'
  }
  return 'ready'
}

/** Check if an agent can accept another task */
async function isAgentAvailable(agentId: string): Promise<boolean> {
  const [result] = await db.select({
    count: sql<number>`count(*)`,
  }).from(tasks)
    .where(and(eq(tasks.status, 'running'), eq(tasks.assigneeAgentId, agentId)))

  return (result?.count || 0) < DEFAULT_MAX_CONCURRENT
}

/** Dispatch next queued task for a specific agent */
async function dispatchForAgent(agentId: string): Promise<void> {
  // Check if agent has capacity
  if (!(await isAgentAvailable(agentId))) return

  const now = Date.now()

  // Find next task for this agent: open/assigned, ready to run, ordered by creation time
  const candidates = await db.select().from(tasks).where(
    and(
      eq(tasks.assigneeAgentId, agentId),
      or(eq(tasks.status, 'open'), eq(tasks.status, 'assigned')),
      or(
        eq(tasks.scheduleType, 'immediate'),
        eq(tasks.scheduleType, 'manual'),
        and(eq(tasks.scheduleType, 'scheduled'), lte(tasks.scheduleAt, now)),
        and(eq(tasks.scheduleType, 'recurring'), lte(tasks.scheduleNextAt, now)),
      )
    )
  ).orderBy(tasks.createdAt)

  if (candidates.length === 0) return

  // Resolve dependency statuses
  const allDepIds = new Set<string>()
  for (const task of candidates) {
    if (task.dependsOn) {
      try { JSON.parse(task.dependsOn).forEach((id: string) => allDepIds.add(id)) } catch {}
    }
  }

  const depStatusMap = new Map<string, string>()
  if (allDepIds.size > 0) {
    const depTasks = await db.select({ id: tasks.id, status: tasks.status })
      .from(tasks).where(inArray(tasks.id, [...allDepIds]))
    for (const t of depTasks) depStatusMap.set(t.id, t.status)
  }

  // Find first eligible task
  for (const task of candidates) {
    // Skip manual tasks (user must explicitly execute)
    if (task.scheduleType === 'manual') continue

    // Check dependencies
    const depStatus = checkDependencies(task.dependsOn, depStatusMap)
    if (depStatus === 'failed') {
      await db.update(tasks).set({
        status: 'failed',
        failReason: 'Dependency task failed or cancelled',
        updatedAt: now,
      }).where(eq(tasks.id, task.id))
      eventBus.broadcast('task.failed', { taskId: task.id, number: task.number })
      console.log(`[Scheduler] Task #${task.number} cascade failed (dependency)`)
      continue
    }
    if (depStatus === 'waiting') continue

    // Check concurrency key lock
    if (task.concurrencyKey && !canAcquire(task.concurrencyKey, task.id)) continue

    // All checks passed — dispatch
    if (task.concurrencyKey) acquire(task.concurrencyKey, task.id)

    if (task.dependsOn) {
      eventBus.broadcast('task.dependencies_met', { taskId: task.id, number: task.number })
    }

    console.log(`[Scheduler] Dispatching task #${task.number} to agent ${agentId}`)
    executeTask(task.id).catch(err => {
      console.error(`[Scheduler] Failed to execute task #${task.number}:`, err.message)
    })
    return // One task at a time per agent
  }
}

/** Periodic sweep: check all agents for queued work (handles scheduled/recurring and edge cases) */
async function sweepAll(): Promise<void> {
  try {
    // Find all agents that have queued tasks but aren't at capacity
    const agentsWithQueue = await db.select({
      agentId: tasks.assigneeAgentId,
    }).from(tasks).where(
      and(
        or(eq(tasks.status, 'open'), eq(tasks.status, 'assigned')),
        // Only non-manual tasks (manual tasks need explicit execution)
        or(
          eq(tasks.scheduleType, 'immediate'),
          eq(tasks.scheduleType, 'scheduled'),
          eq(tasks.scheduleType, 'recurring'),
        )
      )
    ).groupBy(tasks.assigneeAgentId)

    for (const row of agentsWithQueue) {
      if (row.agentId) {
        await dispatchForAgent(row.agentId)
      }
    }
  } catch (err) {
    console.error('[Scheduler] Sweep error:', err)
  }
}
