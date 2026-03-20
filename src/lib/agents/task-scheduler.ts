import { eq, and, lte, inArray, isNull, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { executeTask } from './task-executor'
import { canAcquire, acquire } from './concurrency'
import { eventBus } from '@/lib/events'

let schedulerInterval: NodeJS.Timeout | null = null

export function startScheduler(intervalMs = 30000) {
  if (schedulerInterval) return

  console.log(`[Scheduler] Started, checking every ${intervalMs / 1000}s`)
  schedulerInterval = setInterval(() => tick(), intervalMs)
  // Run immediately on start
  tick()
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('[Scheduler] Stopped')
  }
}

/** Check if all dependency tasks are done. Returns 'ready' | 'waiting' | 'failed' */
function checkDependencies(dependsOnJson: string | null, allTasks: Map<string, string>): 'ready' | 'waiting' | 'failed' {
  if (!dependsOnJson) return 'ready'

  let depIds: string[]
  try { depIds = JSON.parse(dependsOnJson) }
  catch { return 'ready' }

  if (!Array.isArray(depIds) || depIds.length === 0) return 'ready'

  for (const depId of depIds) {
    const status = allTasks.get(depId)
    if (status === 'failed' || status === 'cancelled') return 'failed'
    if (status !== 'done') return 'waiting'
  }
  return 'ready'
}

async function tick() {
  const now = Date.now()

  try {
    // Fetch all open/assigned tasks that might be ready to run
    const candidates = await db.select().from(tasks).where(
      and(
        or(eq(tasks.status, 'open'), eq(tasks.status, 'assigned')),
        or(
          // Scheduled tasks whose time has come
          and(eq(tasks.scheduleType, 'scheduled'), lte(tasks.scheduleAt, now)),
          // Recurring tasks due
          and(eq(tasks.scheduleType, 'recurring'), lte(tasks.scheduleNextAt, now)),
          // Immediate tasks
          eq(tasks.scheduleType, 'immediate'),
        )
      )
    )

    if (candidates.length === 0) return

    // Build a status lookup map for dependency checking
    // Only fetch tasks that are referenced as dependencies
    const allDepIds = new Set<string>()
    for (const task of candidates) {
      if (task.dependsOn) {
        try {
          const ids: string[] = JSON.parse(task.dependsOn)
          ids.forEach(id => allDepIds.add(id))
        } catch {}
      }
    }

    const depStatusMap = new Map<string, string>()
    if (allDepIds.size > 0) {
      const depTasks = await db.select({ id: tasks.id, status: tasks.status })
        .from(tasks)
        .where(inArray(tasks.id, [...allDepIds]))
      for (const t of depTasks) {
        depStatusMap.set(t.id, t.status)
      }
    }

    for (const task of candidates) {
      if (!task.assigneeAgentId) continue // Skip unassigned

      // 1. Check dependencies
      const depStatus = checkDependencies(task.dependsOn, depStatusMap)
      if (depStatus === 'failed') {
        // Cascade failure
        await db.update(tasks).set({
          status: 'failed',
          failReason: 'Dependency task failed or cancelled',
          updatedAt: now,
        }).where(eq(tasks.id, task.id))
        eventBus.broadcast('task.failed', { taskId: task.id, number: task.number })
        console.log(`[Scheduler] Task #${task.number} cascade failed (dependency)`)
        continue
      }
      if (depStatus === 'waiting') continue // Not ready yet

      // 2. Check concurrency lock
      if (task.concurrencyKey && !canAcquire(task.concurrencyKey, task.id)) {
        continue // Lock held by another task
      }

      // 3. Acquire concurrency lock
      if (task.concurrencyKey) {
        acquire(task.concurrencyKey, task.id)
      }

      // Dependencies met — notify
      if (task.dependsOn) {
        eventBus.broadcast('task.dependencies_met', { taskId: task.id, number: task.number })
      }

      console.log(`[Scheduler] Executing task #${task.number}: ${task.title}`)
      executeTask(task.id).catch(err => {
        console.error(`[Scheduler] Failed to execute task #${task.number}:`, err.message)
      })
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err)
  }
}
