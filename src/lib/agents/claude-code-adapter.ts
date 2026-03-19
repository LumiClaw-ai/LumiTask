import { spawn, execSync, type ChildProcess } from 'child_process'
import { findClaudeCodeBinary } from './claude-code-detect'
import type { AgentAdapter, TaskContext, ExecutionEvent, ExecutionResult } from './adapter'

function formatToolUse(name: string, input: any): string {
  if (!input) return `🔧 ${name}`
  switch (name) {
    case 'Read': return `📖 Read ${input.file_path || ''}`
    case 'Write': return `📝 Write ${input.file_path || ''}`
    case 'Edit': return `✏️ Edit ${input.file_path || ''}`
    case 'Bash': return `💻 ${(input.command || '').slice(0, 100)}`
    case 'Glob': return `🔍 Glob ${input.pattern || ''}`
    case 'Grep': return `🔎 Grep "${input.pattern || ''}"${input.path ? ` in ${input.path}` : ''}`
    case 'Agent': return `🤖 Agent: ${(input.description || '').slice(0, 80)}`
    default: return `🔧 ${name}`
  }
}

function summarizeToolInput(name: string, input: any): string {
  if (!input) return ''
  switch (name) {
    case 'Read': case 'Write': case 'Edit': return input.file_path || ''
    case 'Bash': return (input.command || '').slice(0, 200)
    case 'Glob': return input.pattern || ''
    case 'Grep': return input.pattern || ''
    default: return JSON.stringify(input).slice(0, 200)
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  type = 'claude-code'
  private runningProcesses = new Map<string, ChildProcess>()

  async detect(): Promise<boolean> {
    const path = await findClaudeCodeBinary()
    return !!path
  }

  async execute(context: TaskContext, onEvent: (e: ExecutionEvent) => void): Promise<ExecutionResult> {
    const binaryPath = await findClaudeCodeBinary()
    if (!binaryPath) throw new Error('Claude Code not found')

    const cwd = context.workingDirectory || process.env.HOME || process.cwd()
    const prompt = [context.title, context.description].filter(Boolean).join('\n\n')

    let totalInput = 0
    let totalOutput = 0
    let totalCostUsd = 0
    let lastModel = ''
    let resultText = ''

    onEvent({ type: 'started', message: 'Claude Code 开始执行', timestamp: Date.now() })

    return new Promise<ExecutionResult>((resolve, reject) => {
      // Build shell command - use bash -c for reliable stdout capture
      const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
      const escapedPath = binaryPath.replace(/'/g, "'\\''")
      const cmd = `'${escapedPath}' --print --output-format stream-json --verbose --max-turns 50 --dangerously-skip-permissions -p '${escapedPrompt}'`

      const proc = spawn('bash', ['-c', cmd], {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.runningProcesses.set(context.taskId, proc)
      let buffer = ''

      const processLine = (line: string) => {
        try {
          const event = JSON.parse(line)
          this.handleStreamEvent(event, onEvent, {
            addInput: (n) => { totalInput += n },
            addOutput: (n) => { totalOutput += n },
            setModel: (m) => { lastModel = m },
            setResult: (r) => { resultText = r },
            setCost: (c) => { totalCostUsd = c },
          })
        } catch {
          if (line.trim()) {
            onEvent({ type: 'progress', message: line.trim().slice(0, 500), timestamp: Date.now() })
          }
        }
      }

      if (proc.stdout) {
        proc.stdout.on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) processLine(line)
          }
        })
      }

      if (proc.stderr) {
        proc.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString().trim()
          if (text && !text.includes('ExperimentalWarning')) {
            onEvent({ type: 'progress', message: `⚠️ ${text.slice(0, 300)}`, timestamp: Date.now() })
          }
        })
      }

      proc.on('close', (code) => {
        this.runningProcesses.delete(context.taskId)
        // Process remaining buffer
        if (buffer.trim()) processLine(buffer.trim())

        const costCents = Math.round(totalCostUsd * 100)

        if (code === 0 || resultText) {
          resolve({
            success: true,
            summary: resultText.slice(0, 500) || 'Task completed',
            result: resultText || undefined,
            totalInputTokens: totalInput,
            totalOutputTokens: totalOutput,
            costCents,
            model: lastModel || undefined,
          })
        } else {
          resolve({
            success: false,
            summary: `Claude Code exited with code ${code}`,
            error: `Claude Code exited with code ${code}`,
            totalInputTokens: totalInput,
            totalOutputTokens: totalOutput,
            costCents,
            model: lastModel || undefined,
          })
        }
      })

      proc.on('error', (err) => {
        this.runningProcesses.delete(context.taskId)
        reject(err)
      })
    })
  }

  private handleStreamEvent(
    event: any,
    onEvent: (e: ExecutionEvent) => void,
    counters: {
      addInput: (n: number) => void
      addOutput: (n: number) => void
      setModel: (m: string) => void
      setResult: (r: string) => void
      setCost: (c: number) => void
    }
  ) {
    // System init event
    if (event.type === 'system' && event.subtype === 'init') {
      onEvent({
        type: 'progress',
        message: `Model: ${event.model || 'unknown'} | Tools: ${(event.tools || []).length}`,
        model: event.model,
        timestamp: Date.now(),
      })
      if (event.model) counters.setModel(event.model)
      return
    }

    // Assistant message
    if (event.type === 'assistant' && event.message) {
      const msg = event.message
      const usage = msg.usage
      if (usage) {
        counters.addInput((usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0))
        counters.addOutput(usage.output_tokens || 0)
      }
      if (msg.model) counters.setModel(msg.model)

      for (const block of (msg.content || [])) {
        if (block.type === 'text' && block.text?.trim()) {
          onEvent({
            type: 'progress',
            message: block.text.trim().slice(0, 1000),
            inputTokens: usage?.input_tokens,
            outputTokens: usage?.output_tokens,
            model: msg.model,
            timestamp: Date.now(),
          })
          counters.setResult(block.text.trim())
        }
        if (block.type === 'tool_use') {
          if (block.name === 'AskUserQuestion') {
            onEvent({
              type: 'blocked',
              message: block.input?.question || block.input?.text || 'Agent needs your input',
              toolName: 'AskUserQuestion',
              toolInput: JSON.stringify(block.input),
              timestamp: Date.now(),
            })
          } else {
            onEvent({
              type: 'tool_use',
              message: formatToolUse(block.name, block.input),
              toolName: block.name,
              toolInput: summarizeToolInput(block.name, block.input),
              timestamp: Date.now(),
            })
          }
        }
      }
    }

    // Tool results (comes as 'user' role with 'tool_result' content blocks)
    if (event.type === 'user' && event.message?.content) {
      for (const block of (Array.isArray(event.message.content) ? event.message.content : [])) {
        if (block.type === 'tool_result') {
          const resultText = typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c.text || '').join('')
              : ''
          if (resultText) {
            onEvent({
              type: 'tool_result',
              message: resultText.slice(0, 300),
              toolName: block.tool_use_id || '',
              timestamp: Date.now(),
            })
          }
        }
      }
      return
    }

    // Sub-agent events (Claude Code's Agent tool)
    if (event.type === 'system' && event.subtype?.startsWith('task_')) {
      if (event.subtype === 'task_started') {
        onEvent({
          type: 'tool_use',
          message: `🤖 子任务启动: ${event.description || ''}`,
          toolName: 'SubAgent',
          toolInput: `type=${event.task_type || ''} id=${event.task_id || ''}`,
          timestamp: Date.now(),
        })
      } else if (event.subtype === 'task_progress') {
        onEvent({
          type: 'tool_use',
          message: `🤖 ${event.last_tool_name || ''}: ${(event.description || '').slice(0, 200)}`,
          toolName: event.last_tool_name || 'SubAgent',
          toolInput: `tokens=${event.usage?.total_tokens || 0}`,
          timestamp: Date.now(),
        })
      } else if (event.subtype === 'task_notification') {
        const dur = event.usage?.duration_ms ? `${(event.usage.duration_ms / 1000).toFixed(1)}s` : ''
        onEvent({
          type: 'progress',
          message: `🤖 子任务${event.status === 'completed' ? '完成' : '失败'}: ${event.summary || ''} (${dur}, ${event.usage?.tool_uses || 0} tools)`,
          inputTokens: event.usage?.total_tokens,
          timestamp: Date.now(),
        })
      }
      return
    }

    // Result event
    if (event.type === 'result') {
      if (event.result) {
        counters.setResult(typeof event.result === 'string' ? event.result : JSON.stringify(event.result))
      }
      if (event.total_cost_usd) counters.setCost(event.total_cost_usd)

      onEvent({
        type: 'completed',
        message: `完成 | ${event.num_turns || 0} turns | ${event.duration_ms ? (event.duration_ms / 1000).toFixed(1) + 's' : ''} | $${(event.total_cost_usd || 0).toFixed(4)}`,
        timestamp: Date.now(),
      })
    }
  }

  async reply(_taskId: string, _text: string): Promise<boolean> {
    // Claude Code with --print mode doesn't support stdin interaction
    // Fallback: reply API will append user input to description and re-execute
    return false
  }

  async cancel(taskId: string): Promise<void> {
    const proc = this.runningProcesses.get(taskId)
    if (proc) {
      proc.kill('SIGTERM')
      setTimeout(() => { try { if (!proc.killed) proc.kill('SIGKILL') } catch {} }, 5000)
      this.runningProcesses.delete(taskId)
    }
  }
}
