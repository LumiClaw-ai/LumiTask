'use client'

import { useState, useMemo, useCallback, useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { fetchTasks, fetchAgents, type Task } from '@/lib/api'
import { useSSE } from '@/hooks/use-sse'
import { Column } from './column'
import { TaskDrawer } from '@/components/task/task-drawer'

const COLUMNS = [
  { key: 'open', title: 'Open', color: 'blue', statuses: ['open', 'assigned'] },
  { key: 'running', title: 'Running', color: 'purple', statuses: ['running'] },
  { key: 'done', title: 'Done', color: 'green', statuses: ['done', 'failed', 'cancelled'] },
  { key: 'blocked', title: 'Blocked', color: 'red', statuses: ['blocked'] },
] as const

interface KanbanBoardProps {
  dateFrom?: number
  dateTo?: number
}

export function KanbanBoard({ dateFrom, dateTo }: KanbanBoardProps) {
  const searchParams = useSearchParams()
  const [agentFilter, setAgentFilter] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Read ?agent= from URL
  useEffect(() => {
    const agentParam = searchParams.get('agent')
    if (agentParam) setAgentFilter(agentParam)
  }, [searchParams])

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', dateFrom, dateTo],
    queryFn: () => fetchTasks({ dateFrom, dateTo }),
  })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })

  useSSE(useCallback((data: any) => {
    if (data.taskId && data.event === 'task.completed') {
      // Could auto-select the task to show result
    }
  }, []))

  const filtered = useMemo(() => {
    if (!agentFilter) return tasks
    return tasks.filter((t) => t.assigneeAgentId === agentFilter)
  }, [tasks, agentFilter])

  const grouped = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const col of COLUMNS) map[col.key] = []
    for (const t of filtered) {
      const col = COLUMNS.find(c => (c.statuses as readonly string[]).includes(t.status))
      if (col) map[col.key].push(t)
    }
    if (map.done.length > 10) map.done = map.done.slice(0, 10)
    return map
  }, [filtered])

  const handleCloseDrawer = useCallback(() => setSelectedTaskId(null), [])
  const handleSelectTask = useCallback((id: string) => setSelectedTaskId(id), [])

  const inputClass = 'rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      {/* Agent filter bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-800/50">
        <select
          className={`${inputClass} text-xs`}
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName || a.name}</option>
          ))}
        </select>
      </div>

      {/* Kanban — fills remaining height, scrolls horizontally */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-4 h-full">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              title={col.title}
              color={col.color}
              tasks={grouped[col.key] || []}
              count={(grouped[col.key] || []).length}
              onSelectTask={handleSelectTask}
            />
          ))}
        </div>
      </div>

      <TaskDrawer taskId={selectedTaskId} onClose={handleCloseDrawer} />
    </>
  )
}
