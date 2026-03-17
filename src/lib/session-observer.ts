import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || join(homedir(), '.openclaw')

export interface SessionInfo {
  key: string
  sessionId: string
  agentId: string
  updatedAt: number
  chatType: string
}

export interface SessionMessage {
  id: string
  timestamp: string
  role: string  // user | assistant | toolResult
  text?: string
  thinking?: string
  toolCalls?: { name: string; input: string }[]
  toolResult?: { name: string; content: string }
}

export interface ActiveSession {
  key: string
  sessionId: string
  agentId: string
  agentName?: string
  state: 'active' | 'idle'  // active = updated in last 30s
  updatedAt: number
  latestMessages: SessionMessage[]  // last 5 messages
  lastUserMessage?: string
}

// Read sessions.json for all agents
export function readAllSessions(): SessionInfo[] {
  const sessions: SessionInfo[] = []
  const agentsDir = join(OPENCLAW_HOME, 'agents')

  if (!existsSync(agentsDir)) return sessions

  try {
    const agentDirs = readdirSync(agentsDir)

    for (const agentDir of agentDirs) {
      const sessionsFile = join(agentsDir, agentDir, 'sessions', 'sessions.json')
      if (!existsSync(sessionsFile)) continue

      try {
        const data = JSON.parse(readFileSync(sessionsFile, 'utf-8'))
        for (const [key, value] of Object.entries(data)) {
          const v = value as any
          sessions.push({
            key,
            sessionId: v.sessionId,
            agentId: agentDir,
            updatedAt: v.updatedAt || 0,
            chatType: v.chatType || 'unknown',
          })
        }
      } catch {}
    }
  } catch {}

  return sessions
}

// Read last N messages from a session JSONL file
export function readSessionTail(agentId: string, sessionId: string, lines: number = 10): SessionMessage[] {
  const filePath = join(OPENCLAW_HOME, 'agents', agentId, 'sessions', `${sessionId}.jsonl`)
  if (!existsSync(filePath)) return []

  try {
    const content = readFileSync(filePath, 'utf-8')
    const allLines = content.trim().split('\n').filter(Boolean)
    const lastLines = allLines.slice(-lines)

    return lastLines.map(line => {
      try {
        const d = JSON.parse(line)
        const msg = d.message || {}
        const content = msg.content
        const result: SessionMessage = {
          id: d.id || '',
          timestamp: d.timestamp || '',
          role: msg.role || 'unknown',
        }

        if (typeof content === 'string') {
          result.text = content
        } else if (Array.isArray(content)) {
          // Extract text, thinking, tool_use, tool_result
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              result.text = (result.text || '') + block.text
            }
            if (block.type === 'thinking' && block.thinking) {
              result.thinking = block.thinking.slice(0, 200)
            }
            if (block.type === 'toolCall' || block.type === 'tool_use') {
              if (!result.toolCalls) result.toolCalls = []
              result.toolCalls.push({
                name: block.toolName || block.name || '',
                input: JSON.stringify(block.input || {}).slice(0, 200),
              })
            }
          }
        }

        // Handle toolResult role
        if (msg.role === 'toolResult') {
          const resultContent = Array.isArray(content)
            ? content.map((c: any) => c.text || '').join('').slice(0, 200)
            : typeof content === 'string' ? content.slice(0, 200) : ''
          result.toolResult = {
            name: msg.toolName || '',
            content: resultContent,
          }
        }

        return result
      } catch {
        return { id: '', timestamp: '', role: 'unknown' }
      }
    }).filter(m => m.role !== 'unknown')
  } catch {
    return []
  }
}

// Get active sessions (updated within last 60 seconds)
export function getActiveSessions(): ActiveSession[] {
  const now = Date.now()
  const sessions = readAllSessions()

  const active: ActiveSession[] = []

  for (const session of sessions) {
    const isActive = now - session.updatedAt < 60000  // 60s threshold

    if (isActive) {
      const messages = readSessionTail(session.agentId, session.sessionId, 8)
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')

      active.push({
        key: session.key,
        sessionId: session.sessionId,
        agentId: session.agentId,
        state: now - session.updatedAt < 30000 ? 'active' : 'idle',
        updatedAt: session.updatedAt,
        latestMessages: messages.slice(-5),
        lastUserMessage: lastUserMsg?.text?.slice(0, 200),
      })
    }
  }

  return active.sort((a, b) => b.updatedAt - a.updatedAt)
}

// Get all sessions with basic info (for listing)
export function getAllSessionsSummary(): { key: string; sessionId: string; agentId: string; updatedAt: number; chatType: string; isActive: boolean }[] {
  const now = Date.now()
  return readAllSessions()
    .map(s => ({ ...s, isActive: now - s.updatedAt < 60000 }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// Get agent live status from sessions
export function getAgentLiveStatuses(): { agentId: string; state: 'idle' | 'busy'; currentSession?: string; lastActivity: number }[] {
  const now = Date.now()
  const sessions = readAllSessions()

  // Group by agentId
  const agentMap = new Map<string, { latestUpdate: number; activeSession?: string }>()

  for (const s of sessions) {
    const existing = agentMap.get(s.agentId)
    if (!existing || s.updatedAt > existing.latestUpdate) {
      agentMap.set(s.agentId, {
        latestUpdate: s.updatedAt,
        activeSession: now - s.updatedAt < 30000 ? s.key : undefined,
      })
    }
  }

  return Array.from(agentMap.entries()).map(([agentId, info]) => ({
    agentId,
    state: info.activeSession ? 'busy' as const : 'idle' as const,
    currentSession: info.activeSession,
    lastActivity: info.latestUpdate,
  }))
}
