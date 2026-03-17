'use client'

import { useState } from 'react'
import type { ActivityLogEntry } from '@/lib/api'
import { formatTokens } from '@/lib/utils'

const actionConfig: Record<string, { icon: string; label: string; color?: string }> = {
  'task.created': { icon: '🆕', label: 'Created' },
  'task.assigned': { icon: '📋', label: 'Assigned' },
  'task.started': { icon: '▶️', label: 'Started', color: 'text-purple-400' },
  'task.progress': { icon: '📝', label: 'Progress' },
  'task.completed': { icon: '✅', label: 'Completed', color: 'text-green-400' },
  'task.failed': { icon: '❌', label: 'Failed', color: 'text-red-400' },
  'task.blocked': { icon: '🚫', label: 'Blocked', color: 'text-red-400' },
  'task.reopened': { icon: '🔄', label: 'Reopened' },
  'task.updated': { icon: '✏️', label: 'Updated' },
  'task.stopped': { icon: '⏹️', label: 'Stopped', color: 'text-yellow-400' },
  'task.cancelled': { icon: '🚫', label: 'Cancelled', color: 'text-zinc-400' },
  'tool.use': { icon: '🔧', label: 'Tool' },
  'tool.result': { icon: '↩️', label: 'Result' },
  'comment': { icon: '💬', label: 'Comment' },
}

const toolIcons: Record<string, string> = {
  'Read': '📖', 'Write': '📝', 'Edit': '✏️', 'Bash': '💻',
  'Glob': '🔍', 'Grep': '🔎', 'Agent': '🤖',
}

const actionIcons: Record<string, string> = Object.fromEntries(
  Object.entries(actionConfig).map(([k, v]) => [k, v.icon])
)

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isToolEntry(action: string) {
  return action === 'tool.use' || action === 'tool.result'
}

interface ToolGroup {
  entries: ActivityLogEntry[]
}

/** Group consecutive tool entries that follow a non-tool entry */
function groupActivities(activities: ActivityLogEntry[]): Array<{ type: 'entry'; entry: ActivityLogEntry; toolGroup?: ToolGroup }> {
  const result: Array<{ type: 'entry'; entry: ActivityLogEntry; toolGroup?: ToolGroup }> = []

  let i = 0
  while (i < activities.length) {
    const entry = activities[i]
    if (isToolEntry(entry.action)) {
      // Collect consecutive tool entries
      const toolEntries: ActivityLogEntry[] = []
      while (i < activities.length && isToolEntry(activities[i].action)) {
        toolEntries.push(activities[i])
        i++
      }
      // Attach to previous entry or create standalone
      if (result.length > 0 && !result[result.length - 1].toolGroup) {
        result[result.length - 1].toolGroup = { entries: toolEntries }
      } else {
        // Standalone tool group - use first as parent
        result.push({ type: 'entry', entry: toolEntries[0], toolGroup: { entries: toolEntries.slice(1) } })
      }
    } else {
      result.push({ type: 'entry', entry })
      i++
    }
  }

  return result
}

function ToolEntries({ group }: { group: ToolGroup }) {
  const [expanded, setExpanded] = useState(group.entries.length <= 5)
  const entries = expanded ? group.entries : group.entries.slice(0, 3)
  const hiddenCount = group.entries.length - 3

  return (
    <div className="ml-6 mt-1 border-l-2 border-zinc-800 pl-3 space-y-1">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-2 py-1">
          <span className="text-xs flex-shrink-0">{actionIcons[entry.action] || '\u{1F527}'}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {entry.toolName && (
                <span className="text-xs font-mono text-zinc-500">{entry.toolName}</span>
              )}
              <span className="text-xs text-zinc-600 ml-auto whitespace-nowrap">{formatTimestamp(entry.createdAt)}</span>
            </div>
            {entry.toolInput && (
              <p className="text-xs text-zinc-600 truncate mt-0.5">{entry.toolInput}</p>
            )}
            {entry.message && (
              <p className="text-xs text-zinc-500 whitespace-pre-wrap break-words mt-0.5 line-clamp-2">{entry.message}</p>
            )}
          </div>
        </div>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer py-1"
        >
          Show {hiddenCount} more tool calls...
        </button>
      )}
    </div>
  )
}

export function ActivityTimeline({ activities }: { activities: ActivityLogEntry[] }) {
  if (!activities.length) {
    return <p className="text-sm text-zinc-500">No activity yet.</p>
  }

  const grouped = groupActivities(activities)

  return (
    <div className="relative space-y-0">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-zinc-800" />
      {grouped.map((item, i) => {
        const entry = item.entry
        const isTool = isToolEntry(entry.action)
        const hasTokens = (entry.inputTokens || 0) > 0 || (entry.outputTokens || 0) > 0

        return (
          <div key={entry.id}>
            <div
              className={`relative flex gap-3 py-3 px-2 rounded-md ${i % 2 === 0 ? 'bg-zinc-900/50' : ''}`}
            >
              <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs">
                {actionIcons[entry.action] || '\u{1F4CB}'}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-medium ${isTool ? 'text-zinc-500' : (actionConfig[entry.action]?.color || 'text-zinc-300')}`}>
                    {actionConfig[entry.action]?.label || entry.action}
                  </span>
                  {entry.toolName && (
                    <span className="font-mono text-zinc-500">{(toolIcons[entry.toolName] || '🔧')} {entry.toolName}</span>
                  )}
                  {entry.actorId && (
                    <span className="text-zinc-500">by {entry.actorId}</span>
                  )}
                  {hasTokens && (
                    <span className="text-zinc-600">
                      ({formatTokens(entry.inputTokens || 0)}/{formatTokens(entry.outputTokens || 0)} tokens)
                    </span>
                  )}
                  <span className="ml-auto text-zinc-600 whitespace-nowrap">{formatTimestamp(entry.createdAt)}</span>
                </div>
                {entry.message && (
                  <p className={`text-sm whitespace-pre-wrap break-words ${isTool ? 'text-zinc-500' : 'text-zinc-400'}`}>{entry.message}</p>
                )}
                {isTool && entry.toolInput && (
                  <p className="text-xs text-zinc-600 truncate">{entry.toolInput}</p>
                )}
              </div>
            </div>
            {item.toolGroup && item.toolGroup.entries.length > 0 && (
              <ToolEntries group={item.toolGroup} />
            )}
          </div>
        )
      })}
    </div>
  )
}
