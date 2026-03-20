'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, LayoutGrid, Calendar, List, Search } from 'lucide-react'
import { fetchTasks, fetchAgents, type Task } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { KanbanBoard } from '@/components/board/kanban-board'
import { CalendarView } from '@/components/calendar-view'
import { TaskForm } from '@/components/task/task-form'
import { TaskDrawer } from '@/components/task/task-drawer'
import { timeAgo } from '@/lib/utils'

type ViewMode = 'board' | 'calendar' | 'list'
type DatePreset = 'all' | '7d' | '30d' | 'custom'

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-500', running: 'bg-purple-500', blocked: 'bg-red-500',
    done: 'bg-green-500', failed: 'bg-red-500', cancelled: 'bg-zinc-500',
  }
  const pulse = status === 'running'
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      {pulse && <span className={`animate-ping absolute h-full w-full rounded-full ${colors[status]} opacity-75`} />}
      <span className={`relative rounded-full h-2 w-2 ${colors[status] || 'bg-zinc-500'}`} />
    </span>
  )
}

function getDateRange(preset: DatePreset, customFrom: string, customTo: string): { dateFrom?: number; dateTo?: number } {
  const now = Date.now()
  switch (preset) {
    case '7d': return { dateFrom: now - 7 * 86400000 }
    case '30d': return { dateFrom: now - 30 * 86400000 }
    case 'custom': {
      const from = customFrom ? new Date(customFrom).getTime() : undefined
      const to = customTo ? new Date(customTo).getTime() + 86400000 - 1 : undefined
      return { dateFrom: from, dateTo: to }
    }
    default: return {}
  }
}

export default function TasksPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { dateFrom, dateTo } = getDateRange(datePreset, customFrom, customTo)

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', dateFrom, dateTo],
    queryFn: () => fetchTasks({ dateFrom, dateTo }),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.toLowerCase()
    return tasks.filter((t: Task) => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
  }, [tasks, search])

  const inputClass = 'rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  const viewBtn = (mode: ViewMode, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setViewMode(mode)}
      className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === mode ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
    >
      {icon} {label}
    </button>
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between pr-4 sm:pr-6 py-3 sm:py-4 border-b border-zinc-800 bg-zinc-950 pl-12 lg:pl-6">
        <h2 className="text-lg font-semibold text-zinc-100">任务</h2>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              className={`${inputClass} pl-8 w-48`}
              placeholder="搜索任务..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* View toggle */}
          <div className="flex rounded-md border border-zinc-700 overflow-hidden">
            {viewBtn('board', <LayoutGrid className="h-3.5 w-3.5" />, '看板')}
            {viewBtn('list', <List className="h-3.5 w-3.5" />, '列表')}
            {viewBtn('calendar', <Calendar className="h-3.5 w-3.5" />, '日历')}
          </div>

          {/* Date filter */}
          <select
            className={`${inputClass} hidden sm:block`}
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          >
            <option value="all">全部</option>
            <option value="7d">最近7天</option>
            <option value="30d">最近30天</option>
            <option value="custom">自定义</option>
          </select>

          {datePreset === 'custom' && (
            <div className="hidden sm:flex items-center gap-1.5">
              <input type="date" className={inputClass} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-zinc-500 text-xs">至</span>
              <input type="date" className={inputClass} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}

          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">新建任务</span>
          </Button>
        </div>
      </div>

      {/* Mobile search */}
      <div className="sm:hidden px-4 pt-3 pl-12 lg:pl-6">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            className={`${inputClass} pl-8 w-full`}
            placeholder="搜索任务..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      {viewMode === 'board' ? (
        <KanbanBoard dateFrom={dateFrom} dateTo={dateTo} />
      ) : viewMode === 'calendar' ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <CalendarView tasks={filtered} onSelectTask={(id) => setSelectedTaskId(id)} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-12">暂无任务</p>
          ) : (
            filtered.map((task: Task) => (
              <div key={task.id} onClick={() => setSelectedTaskId(task.id)}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4 cursor-pointer hover:border-zinc-700 transition-colors activity-row-enter">
                {/* Row 1: status + number + title + agent + cost */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <StatusDot status={task.status} />
                  <span className="text-xs text-zinc-500 font-mono">#{task.number}</span>
                  <span className="text-sm font-medium text-zinc-100 flex-1 truncate">{task.title}</span>
                  <span className="text-xs text-zinc-500 hidden sm:inline">{task.agentName || ''}</span>
                  {task.totalCostCents > 0 && (
                    <span className="text-xs text-zinc-600">${(task.totalCostCents / 100).toFixed(2)}</span>
                  )}
                  <span className="text-xs text-zinc-600">{timeAgo(task.createdAt)}</span>
                </div>
                {/* Row 2: result preview for done tasks */}
                {task.status === 'done' && task.summary && (
                  <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2 pl-7">{task.summary}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <TaskForm open={formOpen} onOpenChange={setFormOpen} />
      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  )
}
