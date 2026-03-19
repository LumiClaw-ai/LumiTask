import { nanoid } from 'nanoid'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, activityLog } from '@/lib/db/schema'
import { eventBus } from '@/lib/events'
import { adapterManager } from './adapter-manager'
import { ClaudeCodeAdapter } from './claude-code-adapter'
import { OpenClawAdapter } from './openclaw-adapter'
import type { ExecutionEvent, TaskContext } from './adapter'

// Register adapters
adapterManager.register(new ClaudeCodeAdapter())
adapterManager.register(new OpenClawAdapter())

// Execute with a custom prompt override (used for follow-up instructions)
export async function executeTaskWithPrompt(taskId: string, promptOverride: string): Promise<void> {
  return executeTask(taskId, promptOverride)
}

export async function executeTask(taskId: string, promptOverride?: string): Promise<void> {
  // Get task and agent
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
  if (!task) throw new Error('Task not found')
  if (task.status === 'running') throw new Error('Task already running')

  // Get agent
  const { agents: agentsTable } = await import('@/lib/db/schema')
  const [agent] = task.assigneeAgentId
    ? await db.select().from(agentsTable).where(eq(agentsTable.id, task.assigneeAgentId))
    : []

  if (!agent) throw new Error('No agent assigned')

  const adapter = adapterManager.get(agent.adapterType)
  if (!adapter) throw new Error(`No adapter for type: ${agent.adapterType}`)

  const now = Date.now()

  // Update task status
  await db.update(tasks).set({
    status: 'running' as const,
    startedAt: now,
    updatedAt: now,
  }).where(eq(tasks.id, taskId))

  // Update agent status
  await db.update(agentsTable).set({ status: 'busy' as const }).where(eq(agentsTable.id, agent.id))

  // Log start
  await writeActivityLog(taskId, {
    action: 'task.started',
    actorType: 'agent',
    actorId: agent.name,
    message: `${agent.displayName || agent.name} 开始执行`,
  })

  eventBus.broadcast('task.started', { taskId, number: task.number })

  // Build context — use promptOverride for follow-up executions
  const context: TaskContext = {
    taskId,
    taskNumber: task.number,
    title: promptOverride ? task.title : task.title,
    description: promptOverride || task.description,
    workingDirectory: task.workingDirectory,
    agentConfig: agent.adapterConfig,
  }

  // Execute with event callback
  const onEvent = async (event: ExecutionEvent) => {
    // Skip 'started' — already logged by executor above
    if (event.type === 'started') return
    // Skip 'completed' — executor handles final status update
    if (event.type === 'completed') {
      // Still log it as progress for the timeline
      await writeActivityLog(taskId, {
        action: 'task.progress',
        actorType: 'agent',
        actorId: agent.name,
        message: event.message,
      })
      eventBus.broadcast('task.progress', { taskId, number: task.number, event })
      return
    }

    if (event.type === 'blocked') {
      // Update task status to blocked
      await db.update(tasks).set({
        status: 'blocked' as const,
        blockReason: event.message,
        updatedAt: Date.now(),
      }).where(eq(tasks.id, taskId))

      await writeActivityLog(taskId, {
        action: 'comment.agent',
        actorType: 'agent',
        actorId: agent.name,
        message: event.message,
        toolName: event.toolName,
        toolInput: event.toolInput,
      })

      eventBus.broadcast('task.blocked', { taskId, number: task.number, blockReason: event.message })
      return
    }

    const logAction = event.type === 'tool_use' ? 'tool.use'
      : event.type === 'tool_result' ? 'tool.result'
      : event.type === 'failed' ? 'task.failed'
      : 'task.progress'

    await writeActivityLog(taskId, {
      action: logAction,
      actorType: 'agent',
      actorId: agent.name,
      message: event.message,
      toolName: event.toolName,
      toolInput: event.toolInput,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      model: event.model,
    })

    // Update token totals
    if (event.inputTokens || event.outputTokens) {
      await db.update(tasks).set({
        totalInputTokens: sql`COALESCE(${tasks.totalInputTokens}, 0) + ${event.inputTokens || 0}`,
        totalOutputTokens: sql`COALESCE(${tasks.totalOutputTokens}, 0) + ${event.outputTokens || 0}`,
        updatedAt: Date.now(),
      }).where(eq(tasks.id, taskId))
    }

    eventBus.broadcast('task.progress', { taskId, number: task.number, event })
  }

  try {
    const result = await adapter.execute(context, onEvent)
    const endNow = Date.now()

    if (result.success) {
      await db.update(tasks).set({
        status: 'done' as const,
        summary: result.summary,
        result: result.result || null,
        totalInputTokens: result.totalInputTokens || 0,
        totalOutputTokens: result.totalOutputTokens || 0,
        totalCostCents: result.costCents || 0,
        completedAt: endNow,
        updatedAt: endNow,
      }).where(eq(tasks.id, taskId))

      await writeActivityLog(taskId, {
        action: 'task.completed',
        actorType: 'agent',
        actorId: agent.name,
        message: result.summary,
      })

      eventBus.broadcast('task.completed', { taskId, number: task.number, summary: result.summary })
    } else {
      await db.update(tasks).set({
        status: 'failed' as const,
        failReason: result.error || 'Unknown error',
        totalInputTokens: result.totalInputTokens || 0,
        totalOutputTokens: result.totalOutputTokens || 0,
        totalCostCents: result.costCents || 0,
        updatedAt: endNow,
      }).where(eq(tasks.id, taskId))

      await writeActivityLog(taskId, {
        action: 'task.failed',
        actorType: 'agent',
        actorId: agent.name,
        message: result.error || 'Task failed',
      })

      eventBus.broadcast('task.failed', { taskId, number: task.number, error: result.error })
    }

    // Handle recurring tasks
    if (task.scheduleType === 'recurring' && task.scheduleCron) {
      const nextTime = getNextCronTime(task.scheduleCron)
      await db.update(tasks).set({
        status: 'open' as const,
        scheduleLastAt: endNow,
        scheduleNextAt: nextTime,
        summary: result.summary,
        result: result.result || null,
        updatedAt: endNow,
        completedAt: null,
        startedAt: null,
      }).where(eq(tasks.id, taskId))
    }
  } catch (err: any) {
    await db.update(tasks).set({
      status: 'failed' as const,
      failReason: err.message,
      updatedAt: Date.now(),
    }).where(eq(tasks.id, taskId))

    await writeActivityLog(taskId, {
      action: 'task.failed',
      actorType: 'system',
      message: `Execution error: ${err.message}`,
    })

    eventBus.broadcast('task.failed', { taskId, number: task.number, error: err.message })
  } finally {
    // Reset agent status
    await db.update(agentsTable).set({ status: 'online' as const }).where(eq(agentsTable.id, agent.id))
  }
}

async function writeActivityLog(taskId: string, entry: {
  action: string
  actorType: 'user' | 'agent' | 'system'
  actorId?: string
  message?: string
  toolName?: string
  toolInput?: string
  inputTokens?: number
  outputTokens?: number
  model?: string
}) {
  await db.insert(activityLog).values({
    id: nanoid(),
    taskId,
    ...entry,
    createdAt: Date.now(),
  })
}

// Simple cron time calculation (next occurrence)
function getNextCronTime(cron: string): number {
  // Parse simple cron: "minute hour dom month dow"
  // For MVP, support: "0 9 * * *" (daily at 9am), "*/30 * * * *" (every 30min), etc.
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return Date.now() + 86400000 // default: 24h

  const now = new Date()
  const [minute, hour] = parts

  const next = new Date(now)

  if (hour !== '*' && minute !== '*') {
    // Fixed time: e.g. "0 9 * * *"
    next.setHours(parseInt(hour), parseInt(minute), 0, 0)
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1) // tomorrow
    }
  } else if (minute.startsWith('*/')) {
    // Every N minutes
    const interval = parseInt(minute.slice(2)) || 10
    next.setMinutes(now.getMinutes() + interval, 0, 0)
  } else {
    // Default: 1 hour later
    next.setTime(now.getTime() + 3600000)
  }

  return next.getTime()
}

export { getNextCronTime }
