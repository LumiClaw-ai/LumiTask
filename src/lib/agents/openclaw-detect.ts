import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export async function findOpenClawBinary(): Promise<string | null> {
  const candidates = [
    join(homedir(), '.local', 'bin', 'openclaw'),
    '/usr/local/bin/openclaw',
    '/opt/homebrew/bin/openclaw',
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  try {
    const result = execSync('command -v openclaw 2>/dev/null', {
      encoding: 'utf-8', timeout: 5000, shell: '/bin/bash',
    }).trim()
    if (result && existsSync(result)) return result
  } catch {}
  return null
}

export async function checkOpenClawGateway(url?: string): Promise<boolean> {
  const gatewayUrl = url || process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789'
  const httpUrl = gatewayUrl.replace('ws://', 'http://').replace('wss://', 'https://')
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${httpUrl}/health`, { signal: controller.signal }).catch(() => null)
    clearTimeout(timeout)
    if (res && res.ok) return true
  } catch {}
  return existsSync(join(homedir(), '.openclaw'))
}

export interface OpenClawAgentInfo {
  id: string
  identityName: string
  identityEmoji: string
  model: string
  workspace: string
  agentDir: string
  isDefault: boolean
}

/**
 * List all OpenClaw agents via `openclaw agents list --json`
 */
export async function listOpenClawAgents(binaryPath: string): Promise<OpenClawAgentInfo[]> {
  try {
    const raw = execSync(`"${binaryPath}" agents list --json 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 15000,
    })
    // Strip ANSI codes and find JSON array
    const clean = raw.replace(/\x1b\[[0-9;]*m/g, '').trim()
    const jsonStart = clean.indexOf('[')
    if (jsonStart < 0) return []
    // Find the matching closing bracket (not just last ']' since there may be garbage after)
    let depth = 0
    let jsonEnd = -1
    for (let i = jsonStart; i < clean.length; i++) {
      if (clean[i] === '[') depth++
      else if (clean[i] === ']') { depth--; if (depth === 0) { jsonEnd = i; break } }
    }
    if (jsonEnd < 0) return []
    const arr = JSON.parse(clean.slice(jsonStart, jsonEnd + 1))
    return arr.map((a: any) => ({
      id: a.id || '',
      identityName: a.identityName || a.id || '',
      identityEmoji: a.identityEmoji || '',
      model: a.model || '',
      workspace: a.workspace || '',
      agentDir: a.agentDir || '',
      isDefault: !!a.isDefault,
    }))
  } catch {
    return []
  }
}
