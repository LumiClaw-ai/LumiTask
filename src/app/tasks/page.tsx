'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, LayoutGrid, Calendar } from 'lucide-react'
import { fetchTasks, fetchAgents, type Task } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { KanbanBoard } from '@/components/board/kanban-board'
import { CalendarView } from '@/components/calendar-view'
import { TaskForm } from '@/components/task/task-form'
import { TaskDrawer } from '@/components/task/task-drawer'

type ViewMode = 'board' | 'calendar'
type DatePreset = 'all' | '7d' | '30d' | 'custom'

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

  const { dateFrom, dateTo } = getDateRange(datePreset, customFrom, customTo)

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', dateFrom, dateTo],
    queryFn: () => fetchTasks({ dateFrom, dateTo }),
  })

  const inputClass = 'rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between pr-4 sm:pr-6 py-3 sm:py-4 border-b border-zinc-800 bg-zinc-950 pl-12 lg:pl-6">
        <h2 className="text-lg font-semibold text-zinc-100">Tasks</h2>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* View toggle */}
          <div className="flex rounded-md border border-zinc-700 overflow-hidden">
            <button
              onClick={() => setViewMode('board')}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === 'board' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer ${viewMode === 'calendar' ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
            >
              <Calendar className="h-3.5 w-3.5" /> Calendar
            </button>
          </div>

          {/* Date filter */}
          <select
            className={`${inputClass} hidden sm:block`}
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="custom">Custom</option>
          </select>

          {datePreset === 'custom' && (
            <div className="hidden sm:flex items-center gap-1.5">
              <input type="date" className={inputClass} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="text-zinc-500 text-xs">to</span>
              <input type="date" className={inputClass} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}

          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Task</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'board' ? (
        <KanbanBoard dateFrom={dateFrom} dateTo={dateTo} />
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <CalendarView tasks={tasks} onSelectTask={(id) => setSelectedTaskId(id)} />
        </div>
      )}

      <TaskForm open={formOpen} onOpenChange={setFormOpen} />
      <TaskDrawer taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  )
}
