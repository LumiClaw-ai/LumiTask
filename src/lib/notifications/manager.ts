import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { sendViaOpenClaw } from './openclaw-channel'
import type { NotificationPayload, NotificationConfig } from './types'

const CONFIG_KEY = 'notification_config'

export async function getNotificationConfig(): Promise<NotificationConfig | null> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, CONFIG_KEY))
    if (!row) return null
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

export async function saveNotificationConfig(config: NotificationConfig): Promise<void> {
  const value = JSON.stringify(config)
  const existing = await db.select().from(settings).where(eq(settings.key, CONFIG_KEY))
  if (existing.length > 0) {
    await db.update(settings).set({ value }).where(eq(settings.key, CONFIG_KEY))
  } else {
    await db.insert(settings).values({ key: CONFIG_KEY, value })
  }
}

/**
 * Send notification — auto-routes based on task's source channel.
 * Priority:
 *   1. Task's sourceChannel (from where it was created → reply back there)
 *   2. Global notification config in Settings (fallback)
 */
export async function notify(
  payload: NotificationPayload,
  taskSource?: { sourceChannel?: string | null; sourceAccountId?: string | null }
): Promise<boolean> {
  // Priority 1: Route back to task's source channel
  if (taskSource?.sourceChannel && taskSource?.sourceAccountId) {
    return sendViaOpenClaw(taskSource.sourceChannel, taskSource.sourceAccountId, payload)
  }

  // Priority 2: Global notification config from Settings
  const config = await getNotificationConfig()
  if (!config || !config.enabled) return false
  if (config.events.length > 0 && !config.events.includes(payload.event)) return false

  return sendViaOpenClaw(config.channel, config.accountId, payload)
}

/** Build notification payload from task events */
export function buildTaskNotification(
  event: string,
  task: { id: string; number: number; title: string },
  extra?: { summary?: string; error?: string; blockReason?: string }
): NotificationPayload {
  const baseUrl = process.env.LUMITASK_URL || 'http://localhost:3179'
  const actionUrl = `${baseUrl}/tasks/${task.id}`

  switch (event) {
    case 'task.completed':
      return {
        event,
        title: `任务 #${task.number} 已完成`,
        body: `${extra?.summary || task.title}\n\n查看详情: ${actionUrl}`,
        level: 'info',
        taskId: task.id,
        taskNumber: task.number,
        actionUrl,
      }
    case 'task.failed':
      return {
        event,
        title: `任务 #${task.number} 失败`,
        body: `${task.title}\n原因：${extra?.error || '未知错误'}\n\n查看详情: ${actionUrl}`,
        level: 'error',
        taskId: task.id,
        taskNumber: task.number,
        actionUrl,
      }
    case 'task.blocked':
      return {
        event,
        title: `任务 #${task.number} 需要你的决定`,
        body: `${task.title}\n${extra?.blockReason || ''}\n\n前往处理: ${actionUrl}`,
        level: 'warning',
        taskId: task.id,
        taskNumber: task.number,
        actionUrl,
      }
    case 'task.dependencies_met':
      return {
        event,
        title: `任务 #${task.number} 依赖就绪，开始执行`,
        body: `${task.title}\n\n查看进度: ${actionUrl}`,
        level: 'info',
        taskId: task.id,
        taskNumber: task.number,
        actionUrl,
      }
    default:
      return {
        event,
        title: `任务 #${task.number}`,
        body: `${task.title}\n\n查看详情: ${actionUrl}`,
        level: 'info',
        taskId: task.id,
        taskNumber: task.number,
        actionUrl,
      }
  }
}
