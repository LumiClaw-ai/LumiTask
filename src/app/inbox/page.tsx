'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, ClipboardList, Trash2, Inbox, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchInbox, fetchAgents, createInboxItem, promoteInbox, deleteInboxItem, getSettings, type Task } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { timeAgo } from '@/lib/utils'

export default function InboxPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [title, setTitle] = useState('')
  const [agentId, setAgentId] = useState('')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)

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
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: '已提升为任务' }) },
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">收集箱</h2>
        <span className="text-xs text-zinc-500">{items.length} 条待处理</span>
      </div>

      {/* Quick add */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">快速添加</p>
        <div className="flex items-center gap-2">
          <input
            className={`${inputClass} flex-1 min-w-0`}
            placeholder="添加任务到收集箱..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) addMutation.mutate() }}
          />
          <select className={`${inputClass} w-32 hidden sm:block`} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">自动分配</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName || a.name}</option>
            ))}
          </select>
          <Button size="sm" onClick={() => { if (title.trim()) addMutation.mutate() }} disabled={addMutation.isPending || !title.trim()}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">添加</span>
          </Button>
        </div>
      </div>

      {/* Section header */}
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">待处理</p>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Inbox className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">收集箱为空</p>
          <p className="text-xs mt-1">在上方添加任务即可开始</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: Task) => (
            <div key={item.id} className="rounded-lg bg-zinc-900/50 border border-zinc-800 border-l-2 border-l-blue-500/60 hover:border-zinc-700 hover:bg-zinc-900 transition-colors activity-row-enter">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div
                    className="flex items-center gap-2 cursor-pointer"
                    onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                  >
                    <p className="text-sm text-zinc-100 font-medium truncate">{item.title}</p>
                    {item.description && (
                      expandedItem === item.id
                        ? <ChevronUp className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.agentName && <span className="text-xs text-zinc-500">{item.agentName}</span>}
                    <span className="text-xs text-zinc-600">{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    onClick={() => promoteMutation.mutate({ id: item.id, scheduleType: 'immediate' })}
                    disabled={promoteMutation.isPending}
                    title="立即执行"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                    onClick={() => promoteMutation.mutate({ id: item.id, scheduleType: 'manual' })}
                    disabled={promoteMutation.isPending}
                    title="提升为任务"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    onClick={() => deleteMutation.mutate(item.id)}
                    disabled={deleteMutation.isPending}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {expandedItem === item.id && item.description && (
                <div className="px-4 pb-3 border-t border-zinc-800 pt-2">
                  <p className="text-xs text-zinc-400 whitespace-pre-wrap">{item.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reminder info */}
      {reminderEnabled && (
        <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-4 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500/50" />
          提醒：每 {reminderDays} 天
        </div>
      )}
    </div>
  )
}
