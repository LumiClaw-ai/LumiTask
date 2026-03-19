import { spawn, type ChildProcess } from 'child_process'
import { findOpenClawBinary } from './openclaw-detect'
import type { AgentAdapter, TaskContext, ExecutionEvent, ExecutionResult } from './adapter'

export class OpenClawAdapter implements AgentAdapter {
  type = 'openclaw'
  private runningProcesses = new Map<string, ChildProcess>()

  async detect(): Promise<boolean> {
    const path = await findOpenClawBinary()
    return !!path
  }

  async execute(context: TaskContext, onEvent: (e: ExecutionEvent) => void): Promise<ExecutionResult> {
    const binaryPath = await findOpenClawBinary()
    if (!binaryPath) throw new Error('OpenClaw not found')

    // Resolve agent-specific config (openclawAgentId, identityName)
    let agentId = 'main'
    let agentLabel = 'OpenClaw'
    if (context.agentConfig) {
      try {
        const cfg = typeof context.agentConfig === 'string' ? JSON.parse(context.agentConfig) : context.agentConfig
        if (cfg.openclawAgentId) agentId = cfg.openclawAgentId
        if (cfg.identityName) agentLabel = cfg.identityName
        if (cfg.identityEmoji) agentLabel = `${cfg.identityEmoji} ${agentLabel}`
      } catch {}
    }

    let prompt = [context.title, context.description].filter(Boolean).join('\n\n')
    if (context.workingDirectory) {
      prompt += `\n\n工作目录: ${context.workingDirectory}，请将产物输出到此目录。`
    }

    onEvent({ type: 'started', message: `${agentLabel} 开始执行`, timestamp: Date.now() })

    return new Promise<ExecutionResult>((resolve, reject) => {
      // Use --json for structured output, --agent for specific agent
      const args = ['agent', '--agent', agentId, '--message', prompt, '--json']
      const proc = spawn(binaryPath, args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.runningProcesses.set(context.taskId, proc)
      let stdout = ''
      let stderr = ''
      let elapsedSec = 0

      // Heartbeat + session tail: read session JSONL for real progress
      const seenMsgIds = new Set<string>()
      const heartbeat = setInterval(async () => {
        elapsedSec += 5

        // Try reading session file for real-time progress
        try {
          const { readSessionTail, readAllSessions } = await import('@/lib/session-observer')
          const sessions = readAllSessions().filter(s => s.agentId === agentId)
          if (sessions.length > 0) {
            const latest = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]
            const msgs = readSessionTail(agentId, latest.sessionId, 5)
            let hasNew = false
            for (const msg of msgs) {
              if (!msg.id || seenMsgIds.has(msg.id)) continue
              seenMsgIds.add(msg.id)
              hasNew = true

              if (msg.role === 'assistant' && msg.text) {
                const text = msg.text.replace(/^\[\[reply_to_current\]\]\s*/i, '').slice(0, 300)
                if (text) onEvent({ type: 'progress', message: text, timestamp: Date.now() })
              }
              if (msg.toolCalls) {
                for (const tc of msg.toolCalls) {
                  onEvent({ type: 'tool_use', message: `🔧 ${tc.name}`, toolName: tc.name, toolInput: tc.input.slice(0, 200), timestamp: Date.now() })
                }
              }
              if (msg.role === 'toolResult' && msg.toolResult) {
                onEvent({ type: 'tool_result', message: msg.toolResult.content.slice(0, 200), toolName: msg.toolResult.name, timestamp: Date.now() })
              }
            }
            if (hasNew) return // Got new data, skip generic heartbeat
          }
        } catch {}

        // Fallback: generic heartbeat only if no session data
        onEvent({ type: 'progress', message: `执行中... ${elapsedSec}s`, timestamp: Date.now() })
      }, 5000)

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stdout += text
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          const text = line.trim()
            .replace(/\x1b\[[0-9;]*m/g, '') // strip ANSI colors
          if (!text) continue
          // Filter noise: plugin loading, gateway fallback info, tool warnings
          if (text.startsWith('[plugins]') || text.startsWith('[tools]')) continue
          if (text.includes('gateway connect failed') || text.includes('Gateway agent failed')) continue
          if (text.startsWith('Gateway target:') || text.startsWith('Source:') || text.startsWith('Config:') || text.startsWith('Bind:')) continue
          stderr += text + '\n'
          onEvent({ type: 'progress', message: text.slice(0, 300), timestamp: Date.now() })
        }
      })

      proc.on('close', (code) => {
        clearInterval(heartbeat)
        this.runningProcesses.delete(context.taskId)

        // Strip ANSI codes and parse JSON output
        const cleanStdout = stdout.replace(/\x1b\[[0-9;]*m/g, '').trim()
        let resultText = ''
        let durationMs = 0

        // Find JSON object in stdout using bracket matching (may have garbage after)
        const jsonStart = cleanStdout.indexOf('{')
        if (jsonStart >= 0) {
          let depth = 0, jsonEnd = -1
          for (let i = jsonStart; i < cleanStdout.length; i++) {
            if (cleanStdout[i] === '{') depth++
            else if (cleanStdout[i] === '}') { depth--; if (depth === 0) { jsonEnd = i; break } }
          }
          if (jsonEnd > 0) {
            try {
              const json = JSON.parse(cleanStdout.slice(jsonStart, jsonEnd + 1))
              const payloads = json.payloads || []
              resultText = payloads.map((p: any) => p.text || '').filter(Boolean).join('\n')
              durationMs = json.meta?.durationMs || 0
            } catch {
              resultText = cleanStdout
            }
          } else {
            resultText = cleanStdout
          }
        } else {
          resultText = cleanStdout
        }

        // exit code 0 = success, even if resultText is empty
        const isSuccess = code === 0 || (code === null && resultText)

        if (isSuccess) {
          const summary = resultText || '任务已完成'
          onEvent({
            type: 'completed',
            message: `完成 | ${durationMs ? (durationMs / 1000).toFixed(1) + 's' : ''}`,
            timestamp: Date.now(),
          })

          // Try to read session file for richer result if resultText is empty
          if (!resultText) {
            try {
              const { readSessionTail, readAllSessions } = require('@/lib/session-observer')
              const cfgAgentId = context.agentConfig ? JSON.parse(context.agentConfig).openclawAgentId || 'main' : 'main'
              const sessions = readAllSessions().filter((s: any) => s.agentId === cfgAgentId)
              if (sessions.length > 0) {
                const latest = sessions.sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0]
                const msgs = readSessionTail(cfgAgentId, latest.sessionId, 5)
                const lastAssistant = [...msgs].reverse().find((m: any) => m.role === 'assistant' && m.text)
                if (lastAssistant?.text) {
                  resultText = lastAssistant.text.replace(/^\[\[reply_to_current\]\]\s*/i, '')
                }
              }
            } catch {}
          }

          resolve({
            success: true,
            summary: (resultText || summary).slice(0, 500),
            result: resultText || summary,
            totalInputTokens: 0,
            totalOutputTokens: 0,
          })
        } else {
          const errorMsg = resultText || stderr.trim() || `OpenClaw exited with code ${code}`
          resolve({
            success: false,
            summary: errorMsg.slice(0, 500),
            error: errorMsg.slice(0, 500),
            totalInputTokens: 0,
            totalOutputTokens: 0,
          })
        }
      })

      proc.on('error', (err) => {
        this.runningProcesses.delete(context.taskId)
        reject(err)
      })
    })
  }

  async reply(): Promise<boolean> {
    return false
  }

  async cancel(taskId: string): Promise<void> {
    const proc = this.runningProcesses.get(taskId)
    if (proc) {
      proc.kill('SIGTERM')
      this.runningProcesses.delete(taskId)
    }
  }
}
