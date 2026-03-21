'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, X, Loader2, MessageSquare, ScrollText, GitBranch, ListTree } from 'lucide-react'
import { formatTokens, timeAgo } from '@/lib/utils'
import { executeTask, pauseTask, cancelTask, type Task } from '@/lib/api'

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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tasks'] })
  const executeMut = useMutation({ mutationFn: () => executeTask(task.id), onSuccess: invalidate })
  const pauseMut = useMutation({ mutationFn: () => pauseTask(task.id), onSuccess: invalidate })
  const cancelMut = useMutation({ mutationFn: () => cancelTask(task.id), onSuccess: invalidate })

  const showQuickStart = task.scheduleType === 'manual' && task.status === 'open' && task.assigneeAgentId

  // Subtask progress
  const subtasks = task.subtasks || []
  const subtaskDone = subtasks.filter(s => s.status === 'done').length
  const subtaskTotal = subtasks.length
  const progressPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : -1

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(task.id) }}
      className={`group w-full text-left rounded-lg border p-3 cursor-pointer space-y-1.5 transition-all duration-150 hover:translate-y-[-2px] hover:shadow-[0_4px_20px_rgba(59,130,246,0.06)] ${
        isRunning
          ? 'border-purple-500/40 bg-purple-950/20 hover:border-purple-500/60'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
      }`}
    >
      {/* Row 1: status dot + number + hover actions */}
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
        <div className="flex items-center gap-1">
          {isRunning && <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />}
          {task.scheduleType === 'recurring' && <span className="text-xs">🔄</span>}

          {/* Hover quick actions */}
          <div className="hidden group-hover:flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            {showQuickStart && (
              <button type="button" onClick={() => executeMut.mutate()}
                className="text-zinc-500 hover:text-green-400 p-0.5 rounded hover:bg-zinc-800 cursor-pointer" title="执行">
                <Play className="h-3 w-3" />
              </button>
            )}
            {isRunning && (
              <button type="button" onClick={() => pauseMut.mutate()}
                className="text-zinc-500 hover:text-yellow-400 p-0.5 rounded hover:bg-zinc-800 cursor-pointer" title="暂停">
                <Pause className="h-3 w-3" />
              </button>
            )}
            {(task.status === 'open' || task.status === 'running') && (
              <button type="button" onClick={() => cancelMut.mutate()}
                className="text-zinc-500 hover:text-red-400 p-0.5 rounded hover:bg-zinc-800 cursor-pointer" title="取消">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: title */}
      <p className="text-sm font-medium text-zinc-100 line-clamp-2">{task.title}</p>

      {/* Row 3: agent + tokens */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{task.agentName || (task.assigneeAgentId ? 'Agent' : '未分配')}</span>
        {totalTokens > 0 && <span>{formatTokens(totalTokens)} tok</span>}
      </div>

      {/* Subtask progress bar */}
      {progressPct >= 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <ListTree className="h-3 w-3 flex-shrink-0" />
          <span>{subtaskDone}/{subtaskTotal}</span>
          <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <span>{progressPct}%</span>
        </div>
      )}

      {/* Row 4: indicators + time */}
      <div className="flex items-center gap-3 text-xs text-zinc-600">
        {task.dependsOn && (
          <span className="flex items-center gap-0.5 text-amber-500/70" title="有前置依赖">
            <GitBranch className="h-3 w-3" />
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
          {task.startedAt ? `${timeAgo(task.startedAt)}` : timeAgo(task.createdAt)}
        </span>
      </div>
    </div>
  )
}
