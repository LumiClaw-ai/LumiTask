'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Loader2, MessageSquare, ScrollText, GitBranch, ListTree } from 'lucide-react'
import { formatTokens, timeAgo } from '@/lib/utils'
import { executeTask, type Task } from '@/lib/api'

const statusIndicators: Record<string, { color: string; pulse?: boolean }> = {
  open: { color: 'bg-blue-500' },
  assigned: { color: 'bg-yellow-500' },
  running: { color: 'bg-purple-500', pulse: true },
  blocked: { color: 'bg-red-500' },
  done: { color: 'bg-green-500' },
  failed: { color: 'bg-red-500' },
  cancelled: { color: 'bg-zinc-500' },
}

interface TaskCardProps {
  task: Task
  onSelect: (taskId: string) => void
}

export function TaskCard({ task, onSelect }: TaskCardProps) {
  const queryClient = useQueryClient()
  const totalTokens = (task.totalInputTokens || 0) + (task.totalOutputTokens || 0)
  const statusInfo = statusIndicators[task.status] || statusIndicators.open
  const isRunning = task.status === 'running'

  const executeMut = useMutation({
    mutationFn: () => executeTask(task.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const showQuickStart = task.scheduleType === 'manual' && task.status === 'open' && task.assigneeAgentId

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(task.id) }}
      className={`w-full text-left rounded-lg border p-3 hover:border-zinc-700 transition-colors cursor-pointer space-y-1.5 ${
        isRunning ? 'border-purple-500/40 bg-purple-950/20' : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      {/* Row 1: status dot + number + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {statusInfo.pulse && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${statusInfo.color} opacity-75`} />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${statusInfo.color}`} />
          </span>
          <span className="text-xs text-zinc-500 font-mono">#{task.number}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isRunning && <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />}
          {task.scheduleType === 'recurring' && <span className="text-xs">🔄</span>}
          {showQuickStart && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); executeMut.mutate() }}
              className="text-zinc-400 hover:text-green-400 transition-colors cursor-pointer p-0.5 rounded hover:bg-zinc-800"
              title="Start"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: title */}
      <p className="text-sm font-medium text-zinc-100 line-clamp-2">{task.title}</p>

      {/* Row 3: agent + tokens */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{task.agentName || (task.assigneeAgentId ? 'Agent' : 'Unassigned')}</span>
        {totalTokens > 0 && <span>{formatTokens(totalTokens)} tok</span>}
      </div>

      {/* Row 4: counts + deps + time */}
      <div className="flex items-center gap-3 text-xs text-zinc-600">
        {task.dependsOn && (
          <span className="flex items-center gap-0.5 text-amber-500/70" title="有前置依赖">
            <GitBranch className="h-3 w-3" />
          </span>
        )}
        {task.parentTaskId && (
          <span className="flex items-center gap-0.5 text-blue-500/70" title="子任务">
            <ListTree className="h-3 w-3" />
          </span>
        )}
        {(task.commentCount || 0) > 0 && (
          <span className="flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {task.commentCount}
          </span>
        )}
        {(task.logCount || 0) > 0 && (
          <span className="flex items-center gap-0.5">
            <ScrollText className="h-3 w-3" />
            {task.logCount}
          </span>
        )}
        <span className="ml-auto">
          {task.startedAt ? `Started ${timeAgo(task.startedAt)}` : timeAgo(task.createdAt)}
        </span>
      </div>
    </div>
  )
}
