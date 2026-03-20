import { NextRequest, NextResponse } from 'next/server'
import { notify, buildTaskNotification, saveNotificationConfig, getNotificationConfig } from '@/lib/notifications/manager'
import type { NotificationConfig } from '@/lib/notifications/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // If config is provided, save it first
    if (body.config) {
      await saveNotificationConfig(body.config as NotificationConfig)
    }

    // Send a test notification
    const payload = buildTaskNotification('task.completed', {
      id: 'test',
      number: 0,
      title: 'LumiTask 通知测试',
    }, { summary: '如果你看到这条消息，说明通知配置成功！' })

    const success = await notify(payload)
    return NextResponse.json({ success })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
