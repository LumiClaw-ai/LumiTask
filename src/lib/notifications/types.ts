export interface NotificationPayload {
  event: string // task.completed, task.failed, task.blocked, task.dependencies_met
  title: string
  body: string
  level: 'info' | 'warning' | 'error'
  taskId?: string
  taskNumber?: number
  actionUrl?: string
}

export interface ChannelInfo {
  agentId: string
  agentName: string
  channel: string   // feishu, discord, telegram, slack...
  accountId: string
  enabled: boolean
}

export interface NotificationConfig {
  enabled: boolean
  agentId: string
  channel: string
  accountId: string
  events: string[] // which events to notify
}
