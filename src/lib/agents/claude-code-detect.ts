import { execSync } from 'child_process'
import { existsSync, realpathSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Search for claude binary - check known paths first, then fall back to PATH
export async function findClaudeCodeBinary(): Promise<string | null> {
  const candidates = [
    join(homedir(), '.local', 'bin', 'claude'),
    join(homedir(), '.claude', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
  ]

  for (const p of candidates) {
    if (existsSync(p)) {
      // Resolve symlinks to get the real binary
      try { return realpathSync(p) } catch { return p }
    }
  }

  // Fall back to which/command -v (won't resolve aliases in non-interactive shell)
  try {
    const result = execSync('command -v claude 2>/dev/null || which claude 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
      shell: '/bin/bash',
    }).trim()
    if (result && existsSync(result)) return result
  } catch {}

  return null
}

export async function getClaudeCodeVersion(binaryPath: string): Promise<string | null> {
  try {
    const output = execSync(`"${binaryPath}" --version 2>/dev/null`, {
      encoding: 'utf-8',
      timeout: 10000,
    }).trim()
    const match = output.match(/(\d+\.\d+\.\d+)/)
    return match ? match[1] : null
  } catch { return null }
}
