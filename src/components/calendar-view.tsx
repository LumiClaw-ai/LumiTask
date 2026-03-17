'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { type Task } from '@/lib/api'

interface CalendarViewProps {
  tasks: Task[]
  onSelectTask: (id: string) => void
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getStatusColor(status: string): string {
  switch (status) {
    case 'done': return 'bg-green-400'
    case 'failed': return 'bg-red-400'
    case 'running': return 'bg-purple-400'
    default: return 'bg-blue-400'
  }
}

function isSameDay(ts: number, year: number, month: number, day: number): boolean {
  const d = new Date(ts)
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
}

export function CalendarView({ tasks, onSelectTask }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1))

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    let startDow = firstDay.getDay() - 1 // Monday=0
    if (startDow < 0) startDow = 6
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const days: (number | null)[] = []
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    while (days.length % 7 !== 0) days.push(null)
    return days
  }, [year, month])

  // Map day -> tasks
  const tasksByDay = useMemo(() => {
    const map: Record<number, Task[]> = {}
    for (const t of tasks) {
      const timestamps = [t.createdAt, t.startedAt, t.completedAt].filter(Boolean) as number[]
      for (const ts of timestamps) {
        const d = new Date(ts)
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate()
          if (!map[day]) map[day] = []
          if (!map[day].find(x => x.id === t.id)) map[day].push(t)
        }
      }
    }
    return map
  }, [tasks, year, month])

  const selectedTasks = selectedDay ? (tasksByDay[selectedDay] || []) : []
  const today = new Date()
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-sm font-semibold text-zinc-200">{monthName}</h3>
        <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs text-zinc-500 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, i) => {
          if (day === null) return <div key={i} className="aspect-square" />
          const dayTasks = tasksByDay[day] || []
          const isSelected = selectedDay === day

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={`aspect-square rounded-md flex flex-col items-center justify-center gap-0.5 text-sm cursor-pointer transition-colors
                ${isSelected ? 'bg-blue-600/30 border border-blue-500' : 'hover:bg-zinc-800 border border-transparent'}
                ${isToday(day) ? 'text-blue-400 font-bold' : 'text-zinc-300'}`}
            >
              <span>{day}</span>
              {dayTasks.length > 0 && (
                <div className="flex gap-0.5">
                  {dayTasks.slice(0, 4).map((t) => (
                    <span key={t.id} className={`h-1.5 w-1.5 rounded-full ${getStatusColor(t.status)}`} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day tasks */}
      {selectedDay !== null && (
        <div className="border-t border-zinc-800 pt-4 space-y-2">
          <h4 className="text-sm font-medium text-zinc-300">{month + 1}月{selectedDay}日 ({selectedTasks.length} tasks)</h4>
          {selectedTasks.length === 0 ? (
            <p className="text-xs text-zinc-500">当天无任务</p>
          ) : (
            selectedTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTask(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-700 cursor-pointer text-left transition-colors"
              >
                <span className={`h-2 w-2 rounded-full flex-shrink-0 ${getStatusColor(t.status)}`} />
                <span className="text-xs text-zinc-500 font-mono">#{t.number}</span>
                <span className="text-sm text-zinc-200 flex-1 truncate">{t.title}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
