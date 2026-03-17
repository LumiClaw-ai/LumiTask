'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, ClipboardList, Trash2 } from 'lucide-react'
import { fetchInbox, fetchAgents, createInboxItem, promoteInbox, deleteInboxItem, getSettings, type Task } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

export default function InboxPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [title, setTitle] = useState('')
  const [agentId, setAgentId] = useState('')

  const { data: items = [] } = useQuery({ queryKey: ['inbox'], queryFn: fetchInbox, refetchInterval: 30000 })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const reminderEnabled = settings?.inboxReminderEnabled !== 'false'
  const reminderDays = settings?.inboxReminderDays || '3'

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inbox'] })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const addMutation = useMutation({
    mutationFn: () => createInboxItem({ title, assigneeAgentId: agentId || undefined }),
    onSuccess: () => { setTitle(''); invalidate(); addToast({ type: 'success', title: '已添加到收集箱' }) },
    onError: (err: Error) => addToast({ type: 'error', title: '添加失败', message: err.message }),
  })

  const promoteMutation = useMutation({
    mutationFn: ({ id, scheduleType }: { id: string; scheduleType: string }) => promoteInbox(id, { scheduleType }),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: '操作成功' }) },
    onError: (err: Error) => addToast({ type: 'error', title: '操作失败', message: err.message }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInboxItem(id),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: '已删除' }) },
    onError: (err: Error) => addToast({ type: 'error', title: '删除失败', message: err.message }),
  })

  const inputClass = 'rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pl-12 lg:pl-6 space-y-6">
      <h2 className="text-lg font-semibold text-zinc-100">Inbox</h2>

      {/* Quick add */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          className={`${inputClass} flex-1 min-w-[200px]`}
          placeholder="快速添加任务..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) addMutation.mutate() }}
        />
        <select className={inputClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
          <option value="">Auto agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.displayName || a.name}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => { if (title.trim()) addMutation.mutate() }} disabled={addMutation.isPending || !title.trim()}>
          添加
        </Button>
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-4xl mb-2">📥</p>
          <p>收集箱为空</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: Task) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-100 truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  {item.agentName && <span className="text-xs text-zinc-500">{item.agentName}</span>}
                  <span className="text-xs text-zinc-600">{timeAgo(item.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => promoteMutation.mutate({ id: item.id, scheduleType: 'immediate' })}
                  disabled={promoteMutation.isPending}
                  title="立即执行"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">执行</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => promoteMutation.mutate({ id: item.id, scheduleType: 'manual' })}
                  disabled={promoteMutation.isPending}
                  title="转为任务"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">转为任务</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(item.id)}
                  disabled={deleteMutation.isPending}
                  title="删除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reminder info */}
      {reminderEnabled && (
        <div className="text-xs text-zinc-500 border-t border-zinc-800 pt-4">
          下次提醒: 每{reminderDays}天
        </div>
      )}
    </div>
  )
}
