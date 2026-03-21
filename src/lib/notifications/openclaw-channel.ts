import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { findOpenClawBinary } from '@/lib/agents/openclaw-detect'
import type { ChannelInfo, NotificationPayload } from './types'

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

function safeJsonParse(output: string): unknown {
  const clean = stripAnsi(output)
  const pairs: Record<string, string> = { '{': '}', '[': ']' }
  const closers = new Set(Object.values(pairs))

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (!pairs[ch]) continue
    if (ch === '[') {
      const next = clean[i + 1]
      if (next && next !== '\n' && next !== '\r' && next !== ' ' && next !== '{' && next !== '"' && next !== '[' && next !== ']') continue
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

// ============================================================
// Feishu API — direct card sending
// ============================================================

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw')

interface FeishuCredentials {
  appId: string
  appSecret: string
}

function getFeishuCredentials(accountId: string): FeishuCredentials | null {
  try {
    const configPath = join(OPENCLAW_HOME, 'openclaw.json')
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    const account = config.channels?.feishu?.accounts?.[accountId]
    if (!account?.appId || !account?.appSecret) return null
    return { appId: account.appId, appSecret: account.appSecret }
  } catch { return null }
}

let _tenantTokens = new Map<string, { token: string; expiresAt: number }>()

async function getTenantToken(accountId: string): Promise<string | null> {
  const cached = _tenantTokens.get(accountId)
  if (cached && Date.now() < cached.expiresAt) return cached.token

  const creds = getFeishuCredentials(accountId)
  if (!creds) return null

  try {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: creds.appId, app_secret: creds.appSecret }),
    })
    const data = await res.json()
    if (data.code === 0 && data.tenant_access_token) {
      _tenantTokens.set(accountId, {
        token: data.tenant_access_token,
        expiresAt: Date.now() + (data.expire - 300) * 1000,
      })
      return data.tenant_access_token
    }
    console.error(`[Feishu:token] failed: ${data.msg}`)
    return null
  } catch (err) {
    console.error('[Feishu:token] error:', err)
    return null
  }
}

async function sendFeishuCard(accountId: string, receiveId: string, card: Record<string, unknown>): Promise<boolean> {
  const token = await getTenantToken(accountId)
  if (!token) return false

  try {
    const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      }),
    })
    const data = await res.json()
    if (data.code === 0) {
      console.log(`[Feishu:card] sent OK, message_id=${data.data?.message_id}`)
      return true
    }
    console.error(`[Feishu:card] failed: code=${data.code} msg=${data.msg}`)
    return false
  } catch (err) {
    console.error('[Feishu:card] error:', err)
    return false
  }
}

// ============================================================
// Card builder
// ============================================================

function buildTaskCard(payload: NotificationPayload): Record<string, unknown> {
  const colorMap: Record<string, string> = {
    info: 'green',
    warning: 'orange',
    error: 'red',
  }
  const iconMap: Record<string, string> = {
    'task.completed': '✅',
    'task.failed': '❌',
    'task.blocked': '⚠️',
    'task.dependencies_met': '🔗',
  }

  const icon = iconMap[payload.event] || '📋'
  const color = colorMap[payload.level] || 'blue'

  const elements: Record<string, unknown>[] = []

  // Task info fields
  const fields: { label: string; value: string }[] = [
    { label: '任务', value: `#${payload.taskNumber} ${payload.title || ''}`.trim() },
  ]
  if (payload.event === 'task.completed') {
    fields.push({ label: '状态', value: '已完成' })
  } else if (payload.event === 'task.failed') {
    fields.push({ label: '状态', value: '失败' })
  } else if (payload.event === 'task.blocked') {
    fields.push({ label: '状态', value: '等待决策' })
  }

  elements.push({
    tag: 'div',
    fields: fields.map(f => ({
      is_short: true,
      text: { tag: 'lark_md', content: `**${f.label}**\n${f.value}` },
    })),
  })

  // Body content — full result, no truncation (Feishu card auto-expands vertically)
  if (payload.body) {
    elements.push({ tag: 'hr' })
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: payload.body },
    })
  }

  // Action button with URL
  if (payload.actionUrl) {
    elements.push({
      tag: 'action',
      actions: [{
        tag: 'button',
        text: { tag: 'plain_text', content: '📎 查看详情' },
        type: 'default',
        url: payload.actionUrl,
      }],
    })
  }

  // Footer
  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: 'LumiTask' }],
  })

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: `${icon} ${payload.title}` },
      template: color,
    },
    elements,
  }
}

// ============================================================
// Channel discovery
// ============================================================

/** Discover available notification channels from OpenClaw agents */
export async function discoverChannels(): Promise<ChannelInfo[]> {
  const binaryPath = await findOpenClawBinary()
  if (!binaryPath) return []

  try {
    const bindingsRaw = execSync(`"${binaryPath}" agents bindings --json 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 15000,
    })
    const bindings = safeJsonParse(bindingsRaw) as any[] | null

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

// ============================================================
// Send notification
// ============================================================

/** Send notification via Feishu card (preferred) or OpenClaw CLI (fallback) */
export async function sendViaOpenClaw(
  channel: string,
  accountId: string,
  payload: NotificationPayload,
  target?: string,
): Promise<boolean> {
  // Resolve target
  let resolvedTarget = target
  if (!resolvedTarget) {
    resolvedTarget = findChannelTarget(channel)
  }

  // For Feishu: try card message first (rich, with clickable button)
  if (channel === 'feishu' && resolvedTarget) {
    // Extract open_id from target (format: "user:ou_xxx")
    const openId = resolvedTarget.replace(/^user:/, '')
    if (openId.startsWith('ou_')) {
      const card = buildTaskCard(payload)
      const sent = await sendFeishuCard(accountId, openId, card)
      if (sent) return true
      // Fall through to CLI if card failed
    }
  }

  // Fallback: CLI message send
  const binaryPath = await findOpenClawBinary()
  if (!binaryPath) return false

  const text = formatMessage(payload)

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
    console.log(`[Notify] Sent via CLI ${channel}/${accountId}`)
    return true
  } catch (err: any) {
    console.error(`[Notify] Failed to send via ${channel}:`, err.message?.slice(0, 200))
    return false
  }
}

/** Find target for a channel from session data */
function findChannelTarget(channel: string): string | undefined {
  try {
    const sessionsFile = join(OPENCLAW_HOME, 'agents', 'main', 'sessions', 'sessions.json')
    if (!existsSync(sessionsFile)) return undefined
    const content = readFileSync(sessionsFile, 'utf-8')

    if (channel === 'feishu') {
      const match = content.match(/"lastTo"\s*:\s*"(user:ou_[^"]+)"/)
      if (match) return match[1]
    }
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
