'use client'

import { useParams, useRouter } from 'next/navigation'
import { TaskDrawer } from '@/components/task/task-drawer'
import { KanbanBoard } from '@/components/board/kanban-board'

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  return (
    <div className="flex flex-col h-full min-h-0">
      <KanbanBoard />
      <TaskDrawer taskId={taskId} onClose={() => router.push('/tasks')} />
    </div>
  )
}
