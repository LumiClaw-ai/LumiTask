'use client'

import { useParams, useRouter } from 'next/navigation'
import { TaskDrawer } from '@/components/task/task-drawer'

export default function TaskDetailPage() {
  const params = useParams()
  const router = useRouter()
  const taskId = params.id as string

  return (
    <>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-zinc-600">任务详情</p>
      </div>
      <TaskDrawer taskId={taskId} onClose={() => router.push('/tasks')} />
    </>
  )
}
