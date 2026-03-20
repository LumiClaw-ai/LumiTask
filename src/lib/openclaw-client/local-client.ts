import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { findOpenClawBinary } from '@/lib/agents/openclaw-detect'
import type { OpenClawClient, OpenClawAgent, CronJobInfo, ChannelBinding, SessionMessage } from './types'

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

function safeJsonParse(output: string): unknown {
  const clean = stripAnsi(output)
  let start = -1
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '[' || clean[i] === '{') { start = i; break }
  }
  if (start < 0) return null
  const pairs: Record<string, string> = { '{': '}', '[': ']' }
  const closers = new Set(Object.values(pairs))
  const stack: string[] = []
  let end = -1
  for (let i = start; i < clean.length; i++) {
    const ch = clean[i]
    if (pairs[ch]) stack.push(pairs[ch])
    else if (closers.has(ch)) {
      if (stack.length === 0 || stack[stack.length - 1] !== ch) break
      stack.pop()
      if (stack.length === 0) { end = i; break }
    }
  }
  if (end < 0) return null
  try { return JSON.parse(clean.slice(start, end + 1)) }
  catch { return null }
}

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw')

export class LocalOpenClawClient implements OpenClawClient {
  private binaryPath: string | null = null

  private async getBinary(): Promise<string | null> {
    if (!this.binaryPath) {
      this.binaryPath = await findOpenClawBinary()
    }
    return this.binaryPath
  }

  private exec(args: string): string | null {
    if (!this.binaryPath) return null
    try {
      return execSync(`"${this.binaryPath}" ${args} 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 30000,
      })
    } catch { return null }
  }

  async isAvailable(): Promise<boolean> {
    const bin = await this.getBinary()
    return !!bin || existsSync(OPENCLAW_HOME)
  }

  async listAgents(): Promise<OpenClawAgent[]> {
    await this.getBinary()
    const raw = this.exec('agents list --json')
    if (!raw) return []
    const parsed = safeJsonParse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((a: any) => ({
      id: a.id || '',
      name: a.identityName || a.id || '',
      emoji: a.identityEmoji || '',
      model: a.model || '',
      workspace: a.workspace || '',
      isDefault: !!a.isDefault,
    }))
  }

  async executeAgent(agentId: string, message: string, opts?: { workingDirectory?: string }): Promise<any> {
    await this.getBinary()
    if (!this.binaryPath) throw new Error('OpenClaw binary not found')
    // Execution is handled by openclaw-adapter.ts spawn, this is for future use
    return null
  }

  async listCronJobs(): Promise<CronJobInfo[]> {
    await this.getBinary()

    // Try CLI first
    const raw = this.exec('cron list --json')
    if (raw) {
      const parsed = safeJsonParse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as any).jobs)) {
        return (parsed as any).jobs.map(mapLocalJob)
      }
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }

    // Fallback: read local file
    try {
      const jobsPath = join(OPENCLAW_HOME, 'cron', 'jobs.json')
      if (!existsSync(jobsPath)) return []
      const data = JSON.parse(readFileSync(jobsPath, 'utf-8'))
      return (data.jobs || []).map(mapLocalJob)
    } catch { return [] }
  }

  async listChannels(): Promise<ChannelBinding[]> {
    await this.getBinary()
    const raw = this.exec('agents bindings --json')
    if (!raw) return []
    const parsed = safeJsonParse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b: any) => b.type === 'route' && b.match?.channel)
      .map((b: any) => ({
        agentId: b.agentId || 'main',
        channel: b.match.channel,
        accountId: b.match.accountId || 'default',
      }))
  }

  async sendMessage(channel: string, accountId: string, text: string): Promise<boolean> {
    await this.getBinary()
    const escaped = JSON.stringify(text)
    const result = this.exec(`message send --channel ${channel} --account ${accountId} --text ${escaped}`)
    return result !== null
  }

  async getSessionMessages(agentId: string, sessionId: string, limit = 20): Promise<SessionMessage[]> {
    try {
      const sessionFile = join(OPENCLAW_HOME, 'agents', agentId, 'sessions', `${sessionId}.jsonl`)
      if (!existsSync(sessionFile)) return []
      const content = readFileSync(sessionFile, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)
      const messages = lines.slice(-limit).map(line => {
        try { return JSON.parse(line) }
        catch { return null }
      }).filter(Boolean)
      return messages
    } catch { return [] }
  }
}

function mapLocalJob(job: any): CronJobInfo {
  return {
    id: job.id,
    name: job.name || '',
    cron: job.schedule?.expr || '',
    agent: job.agentId || '',
    message: job.payload?.message || '',
    enabled: job.enabled ?? true,
    lastRunAt: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : undefined,
    nextRunAt: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : undefined,
  }
}
