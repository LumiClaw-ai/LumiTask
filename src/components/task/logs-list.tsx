'use client'

import { useState, useRef, useEffect } from 'react'
import type { ActivityLogEntry } from '@/lib/api'

interface LogsListProps {
  logs: ActivityLogEntry[]
  isRunning: boolean
}

const logIcons: Record<string, string> = {
  'task.created': '🆕',
  'task.started': '▶️',
  'task.progress': '📝',
  'tool.use': '🔧',
  'tool.result': '↩️',
  'task.completed': '✅',
  'task.failed': '❌',
  'task.blocked': '🚫',
  'task.stopped': '⏹️',
  'task.assigned': '📋',
  'task.reopened': '🔄',
  'task.updated': '✏️',
  'task.cancelled': '🚫',
}

const logColors: Record<string, string> = {
  'task.started': 'text-purple-400',
  'task.progress': 'text-zinc-300',
  'tool.use': 'text-cyan-400',
  'tool.result': 'text-cyan-600',
  'task.completed': 'text-green-400',
  'task.failed': 'text-red-400',
  'task.blocked': 'text-red-400',
  'task.stopped': 'text-yellow-400',
}

function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '...'
}

export function LogsList({ logs, isRunning }: LogsListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [logs.length])

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2 font-mono text-[11px]">
      {logs.length === 0 && (
        <p className="text-zinc-500 text-center py-8 font-sans text-sm">No logs yet.</p>
      )}
      {logs.map((entry, i) => {
        const isLast = i === logs.length - 1
        const isExpanded = expanded.has(entry.id)
        const color = logColors[entry.action] || 'text-zinc-400'
        const icon = logIcons[entry.action] || '📋'
        const toolLabel = entry.toolName ? ` [${entry.toolName}]` : ''
        const message = entry.message || entry.details || entry.action

        return (
          <div
            key={entry.id}
            onClick={() => toggle(entry.id)}
            className={`py-1 border-b border-zinc-800/50 cursor-pointer transition-colors ${isLast ? 'animate-slide-in' : ''} ${isExpanded ? 'bg-zinc-800/30' : 'hover:bg-zinc-800/20'}`}
          >
            <div className="flex gap-2">
              <span className="text-zinc-600 flex-shrink-0 w-[60px]">{formatLogTime(entry.createdAt)}</span>
              <span className="flex-shrink-0 w-4 text-center">{icon}</span>
              <span className={`${color} ${isExpanded ? '' : 'truncate'}`}>
                {toolLabel && <span className="text-cyan-500">{toolLabel}</span>}
                {' '}{isExpanded ? message : truncate(message, 100)}
              </span>
            </div>
            {isExpanded && (
              <div className="ml-[84px] mt-1 space-y-0.5 text-zinc-500">
                {isExpanded && message.length > 100 && (
                  <div className="whitespace-pre-wrap text-zinc-400 text-[11px]">{message}</div>
                )}
                {entry.toolName && entry.toolInput && (
                  <div className="whitespace-pre-wrap text-zinc-400">
                    <span className="text-zinc-600">Input:</span> {entry.toolInput}
                  </div>
                )}
                {(entry.inputTokens || entry.outputTokens) && (
                  <div>
                    <span className="text-zinc-600">Tokens:</span>{' '}
                    {entry.inputTokens ? `${formatTokenCount(entry.inputTokens)} in` : ''}{' '}
                    {entry.outputTokens ? `/ ${formatTokenCount(entry.outputTokens)} out` : ''}
                  </div>
                )}
                {entry.model && (
                  <div>
                    <span className="text-zinc-600">Model:</span> {entry.model}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
      {isRunning && (
        <div className="flex items-center gap-2 py-2 text-purple-400">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
          <span className="font-sans text-xs">Agent is working...</span>
        </div>
      )}
    </div>
  )
}
