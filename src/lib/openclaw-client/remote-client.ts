import type { OpenClawClient, OpenClawAgent, CronJobInfo, ChannelBinding, SessionMessage } from './types'

export class RemoteOpenClawClient implements OpenClawClient {
  private gatewayUrl: string // HTTP base URL
  private token: string

  constructor(wsUrl: string, token: string) {
    // Convert ws:// to http:// for HTTP RPC
    this.gatewayUrl = wsUrl
      .replace('ws://', 'http://')
      .replace('wss://', 'https://')
    this.token = token
  }

  private async rpc(method: string, params?: unknown): Promise<any> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch(`${this.gatewayUrl}/rpc/${method}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params || {}),
      })
      if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`)
      return res.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  private async httpGet(path: string): Promise<any> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const res = await fetch(`${this.gatewayUrl}${path}`, {
        signal: controller.signal,
        headers: this.token ? { 'Authorization': `Bearer ${this.token}` } : {},
      })
      if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
      return res.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.httpGet('/health')
      return res?.ok === true
    } catch {
      return false
    }
  }

  async listAgents(): Promise<OpenClawAgent[]> {
    try {
      const data = await this.rpc('agents.list')
      const agents = Array.isArray(data) ? data : (data?.agents || [])
      return agents.map((a: any) => ({
        id: a.id || '',
        name: a.identityName || a.name || a.id || '',
        emoji: a.identityEmoji || '',
        model: a.model || '',
        workspace: a.workspace || '',
        isDefault: !!a.isDefault,
      }))
    } catch {
      // Try via health endpoint which includes agent info
      try {
        const health = await this.httpGet('/health')
        const agents = health?.agents || []
        return agents.map((a: any) => ({
          id: a.id || '',
          name: a.name || a.id || '',
          isDefault: !!a.isDefault,
        }))
      } catch { return [] }
    }
  }

  async executeAgent(agentId: string, message: string): Promise<any> {
    return this.rpc('agent.run', { agentId, message })
  }

  async listCronJobs(): Promise<CronJobInfo[]> {
    try {
      const data = await this.rpc('cron.list')
      const jobs = Array.isArray(data) ? data : (data?.jobs || [])
      return jobs.map((j: any) => ({
        id: j.id,
        name: j.name || '',
        cron: j.schedule?.expr || j.cron || '',
        agent: j.agentId || j.agent || '',
        message: j.payload?.message || j.message || '',
        enabled: j.enabled ?? true,
        lastRunAt: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : j.lastRunAt,
        nextRunAt: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : j.nextRunAt,
      }))
    } catch { return [] }
  }

  async listChannels(): Promise<ChannelBinding[]> {
    try {
      const data = await this.rpc('channels.list')
      const bindings = Array.isArray(data) ? data : (data?.bindings || [])
      return bindings
        .filter((b: any) => b.channel || b.match?.channel)
        .map((b: any) => ({
          agentId: b.agentId || 'main',
          channel: b.match?.channel || b.channel,
          accountId: b.match?.accountId || b.accountId || 'default',
        }))
    } catch { return [] }
  }

  async sendMessage(channel: string, accountId: string, text: string): Promise<boolean> {
    try {
      await this.rpc('message.send', { channel, accountId, text })
      return true
    } catch { return false }
  }

  async getSessionMessages(agentId: string, sessionId: string, limit = 20): Promise<SessionMessage[]> {
    try {
      const data = await this.rpc('session.messages', { agentId, sessionId, limit })
      return Array.isArray(data) ? data : (data?.messages || [])
    } catch { return [] }
  }
}

/** Parse a connection code (base64 JSON) into url + token */
export function parseConnectionCode(code: string): { url: string; token: string } {
  const json = JSON.parse(Buffer.from(code.trim(), 'base64').toString('utf-8'))
  return {
    url: json.url || '',
    token: json.bootstrapToken || json.token || '',
  }
}
