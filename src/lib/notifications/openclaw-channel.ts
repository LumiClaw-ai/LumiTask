import { execSync } from 'child_process'
import { findOpenClawBinary } from '@/lib/agents/openclaw-detect'
import type { ChannelInfo, NotificationPayload } from './types'

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

function safeJsonParse(output: string): unknown {
  const clean = stripAnsi(output)
  const pairs: Record<string, string> = { '{': '}', '[': ']' }
  const closers = new Set(Object.values(pairs))

  // Find each potential JSON start, use bracket matching, then try JSON.parse
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (!pairs[ch]) continue

    // Skip log-style lines like "[plugins]", "[warn]", etc.
    if (ch === '[') {
      // Check if this [ is followed by a letter (log prefix) vs whitespace/{ (JSON array)
      const next = clean[i + 1]
      if (next && next !== '\n' && next !== '\r' && next !== ' ' && next !== '{' && next !== '"' && next !== '[' && next !== ']') {
        continue
      }
    }

    const stack: string[] = []
    let end = -1
    for (let j = i; j < clean.length; j++) {
      if (pairs[clean[j]]) stack.push(pairs[clean[j]])
      else if (closers.has(clean[j])) {
        if (stack.length === 0 || stack[stack.length - 1] !== clean[j]) break
        stack.pop()
        if (stack.length === 0) { end = j; break }
      }
    }
    if (end > i) {
      try { return JSON.parse(clean.slice(i, end + 1)) }
      catch { continue }
    }
  }

  return null
}

/** Discover available notification channels from OpenClaw agents */
export async function discoverChannels(): Promise<ChannelInfo[]> {
  const binaryPath = await findOpenClawBinary()
  if (!binaryPath) return []

  try {
    // Get agent-channel bindings
    const bindingsRaw = execSync(`"${binaryPath}" agents bindings --json 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 15000,
    })
    const bindings = safeJsonParse(bindingsRaw) as any[] | null

    // Get agents list
    let agentsData: any[] | null = null
    try {
      const agentsRaw = execSync(`"${binaryPath}" agents list --json 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 15000,
      })
      agentsData = safeJsonParse(agentsRaw) as any[] | null
    } catch {}

    const agentMap = new Map<string, string>()
    if (Array.isArray(agentsData)) {
      for (const a of agentsData) {
        agentMap.set(a.id || a.agentId, a.identityName || a.name || a.id)
      }
    }

    const results: ChannelInfo[] = []

    if (Array.isArray(bindings)) {
      for (const b of bindings) {
        if (b.type === 'route' && b.match?.channel) {
          results.push({
            agentId: b.agentId || 'main',
            agentName: agentMap.get(b.agentId) || b.agentId || 'main',
            channel: b.match.channel,
            accountId: b.match.accountId || 'default',
            enabled: true,
          })
        }
      }
    }

    return results
  } catch {
    return []
  }
}

/** Send notification via OpenClaw message send CLI */
export async function sendViaOpenClaw(
  channel: string,
  accountId: string,
  payload: NotificationPayload,
  target?: string,
): Promise<boolean> {
  const binaryPath = await findOpenClawBinary()
  if (!binaryPath) return false

  const text = formatMessage(payload)

  // Resolve target: use provided target, or try to find from session data
  let resolvedTarget = target
  if (!resolvedTarget) {
    resolvedTarget = findFeishuTarget(channel)
  }

  try {
    const args = [
      'message', 'send',
      '--channel', channel,
      '--account', accountId,
      '-m', JSON.stringify(text),
    ]
    if (resolvedTarget) {
      args.push('--target', resolvedTarget)
    }
    execSync(`"${binaryPath}" ${args.join(' ')}`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log(`[Notify] Sent via ${channel}/${accountId}`)
    return true
  } catch (err: any) {
    console.error(`[Notify] Failed to send via ${channel}:`, err.message?.slice(0, 200))
    return false
  }
}

/** Try to find the Feishu user target from session data */
function findFeishuTarget(channel: string): string | undefined {
  if (channel !== 'feishu') return undefined
  try {
    const { homedir } = require('os')
    const { readFileSync } = require('fs')
    const { join } = require('path')
    const openclawHome = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw')
    const sessionsFile = join(openclawHome, 'agents', 'main', 'sessions', 'sessions.json')
    const content = readFileSync(sessionsFile, 'utf-8')
    // Find first feishu direct session with a target
    const match = content.match(/"lastTo"\s*:\s*"(user:ou_[^"]+)"/)
    if (match) return match[1]
  } catch {}
  return undefined
}

function formatMessage(payload: NotificationPayload): string {
  const icon = payload.level === 'error' ? '❌' : payload.level === 'warning' ? '⚠️' : '✅'
  let msg = `${icon} ${payload.title}`
  if (payload.body) msg += `\n${payload.body}`
  if (payload.actionUrl) msg += `\n${payload.actionUrl}`
  return msg
}
