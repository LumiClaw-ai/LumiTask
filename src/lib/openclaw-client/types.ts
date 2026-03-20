export interface OpenClawAgent {
  id: string
  name: string
  emoji?: string
  model?: string
  workspace?: string
  isDefault?: boolean
}

export interface CronJobInfo {
  id: string
  name?: string
  cron?: string
  agent?: string
  message?: string
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
}

export interface SessionMessage {
  id: string
  timestamp: string
  message: {
    role: string
    content: string
    toolName?: string
  }
}

export interface ChannelBinding {
  agentId: string
  channel: string
  accountId: string
}

export interface OpenClawClient {
  // Connection
  isAvailable(): Promise<boolean>

  // Agents
  listAgents(): Promise<OpenClawAgent[]>

  // Task execution
  executeAgent(agentId: string, message: string, opts?: { workingDirectory?: string }): Promise<any>

  // Cron
  listCronJobs(): Promise<CronJobInfo[]>

  // Channels
  listChannels(): Promise<ChannelBinding[]>
  sendMessage(channel: string, accountId: string, text: string): Promise<boolean>

  // Sessions
  getSessionMessages(agentId: string, sessionId: string, limit?: number): Promise<SessionMessage[]>
}
