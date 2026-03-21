'use client'

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchTask } from '@/lib/api'
import { TaskDrawer } from '@/components/task/task-drawer'

export default function TaskDetailPage() {
  const params = useParams()
  const taskId = params.id as string

  return (
    <div className="flex-1 flex items-center justify-center text-zinc-500">
      <p className="text-sm">加载任务详情...</p>
      <TaskDrawer taskId={taskId} onClose={() => window.history.back()} />
    </div>
  )
}
