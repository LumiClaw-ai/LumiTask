import { eq, and, lte } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'
import { executeTask } from './task-executor'

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

async function tick() {
  const now = Date.now()

  try {
    // 1. Check scheduled tasks (one-time, at specific time)
    const scheduledTasks = await db.select().from(tasks).where(
      and(
        eq(tasks.scheduleType, 'scheduled'),
        eq(tasks.status, 'open'),
        lte(tasks.scheduleAt, now),
      )
    )

    // 2. Check recurring tasks
    const recurringTasks = await db.select().from(tasks).where(
      and(
        eq(tasks.scheduleType, 'recurring'),
        eq(tasks.status, 'open'),
        lte(tasks.scheduleNextAt, now),
      )
    )

    const toExecute = [...scheduledTasks, ...recurringTasks]

    for (const task of toExecute) {
      if (!task.assigneeAgentId) continue // Skip unassigned

      console.log(`[Scheduler] Executing task #${task.number}: ${task.title}`)
      // Execute in background (don't await to avoid blocking scheduler)
      executeTask(task.id).catch(err => {
        console.error(`[Scheduler] Failed to execute task #${task.number}:`, err.message)
      })
    }
  } catch (err) {
    console.error('[Scheduler] Error:', err)
  }
}
