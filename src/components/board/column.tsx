import type { Task } from '@/lib/api'
import { TaskCard } from './task-card'

const colorMap: Record<string, string> = {
  blue: 'border-t-blue-500',
  yellow: 'border-t-yellow-500',
  purple: 'border-t-purple-500',
  red: 'border-t-red-500',
  green: 'border-t-green-500',
}

export function Column({
  title,
  color,
  tasks,
  count,
  onSelectTask,
}: {
  title: string
  color: string
  tasks: Task[]
  count: number
  onSelectTask: (taskId: string) => void
}) {
  return (
    <div className={`flex flex-col min-w-[260px] w-[260px] sm:min-w-[280px] sm:w-[280px] rounded-lg border border-zinc-800 bg-zinc-950 border-t-2 ${colorMap[color] || ''}`}>
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 flex-shrink-0">
        <span className="text-sm font-medium text-zinc-300">{title}</span>
        <span className="text-xs text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-zinc-600">
            暂无任务
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} onSelect={onSelectTask} />
          ))
        )}
      </div>
    </div>
  )
}
