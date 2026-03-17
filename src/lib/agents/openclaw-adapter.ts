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

      // Heartbeat: show elapsed time so user knows it's alive
      const heartbeat = setInterval(() => {
        elapsedSec += 5
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

        // Find JSON in stdout (may have non-JSON lines before it)
        const jsonStart = cleanStdout.indexOf('{')
        if (jsonStart >= 0) {
          try {
            const json = JSON.parse(cleanStdout.slice(jsonStart))
            const payloads = json.payloads || []
            resultText = payloads.map((p: any) => p.text || '').filter(Boolean).join('\n')
            durationMs = json.meta?.durationMs || 0
          } catch {
            resultText = cleanStdout
          }
        } else {
          resultText = cleanStdout
        }

        if (code === 0 && resultText) {
          onEvent({
            type: 'completed',
            message: `完成 | ${durationMs ? (durationMs / 1000).toFixed(1) + 's' : ''}`,
            timestamp: Date.now(),
          })
          resolve({
            success: true,
            summary: resultText.slice(0, 500),
            result: resultText,
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
