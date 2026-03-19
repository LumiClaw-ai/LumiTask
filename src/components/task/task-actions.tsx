'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import {
  assignTask,
  executeTask,
  cancelTask,
  completeTask,
  blockTask,
  failTask,
  reopenTask,
  updateTask,
  deleteTask,
  fetchAgents,
  type Task,
} from '@/lib/api'

type ModalType = 'assign' | 'complete' | 'block' | 'fail' | 'edit' | 'delete' | null

export function TaskActions({ task, onDeleted }: { task: Task; onDeleted?: () => void }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [modal, setModal] = useState<ModalType>(null)
  const [input, setInput] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents, enabled: modal === 'assign' })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['task', task.id] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const executeMut = useMutation({ mutationFn: () => executeTask(task.id), onSuccess: invalidate })
  const cancelMut = useMutation({ mutationFn: () => cancelTask(task.id), onSuccess: invalidate })
  const reopenMut = useMutation({ mutationFn: () => reopenTask(task.id), onSuccess: invalidate })
  const cancelStatusMut = useMutation({
    mutationFn: () => updateTask(task.id, { status: 'cancelled' } as Partial<Task>),
    onSuccess: invalidate,
  })

  const assignMut = useMutation({
    mutationFn: () => assignTask(task.id, selectedAgent),
    onSuccess: () => { invalidate(); setModal(null); setSelectedAgent('') },
  })
  const completeMut = useMutation({
    mutationFn: () => completeTask(task.id, input),
    onSuccess: () => { invalidate(); setModal(null); setInput('') },
  })
  const blockMut = useMutation({
    mutationFn: () => blockTask(task.id, input),
    onSuccess: () => { invalidate(); setModal(null); setInput('') },
  })
  const failMut = useMutation({
    mutationFn: () => failTask(task.id, input),
    onSuccess: () => { invalidate(); setModal(null); setInput('') },
  })
  const editMut = useMutation({
    mutationFn: () => updateTask(task.id, { title: editTitle, description: editDesc || undefined } as any),
    onSuccess: () => {
      invalidate()
      setModal(null)
      addToast({ type: 'success', title: '已更新' })
    },
  })
  const deleteMut = useMutation({
    mutationFn: () => deleteTask(task.id),
    onSuccess: () => {
      invalidate()
      setModal(null)
      addToast({ type: 'success', title: '已删除' })
      onDeleted?.()
    },
  })

  const inputClass = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  const openEdit = () => {
    setEditTitle(task.title)
    setEditDesc(task.description || '')
    setModal('edit')
  }

  // Status-based action buttons
  const openButtons = [
    <Button key="start" size="sm" onClick={() => executeMut.mutate()} disabled={executeMut.isPending}>▶ 开始</Button>,
    <Button key="assign" size="sm" variant="outline" onClick={() => setModal('assign')}>分配</Button>,
  ]

  const buttons: Record<string, React.ReactNode[]> = {
    open: openButtons,
    assigned: openButtons,
    inbox: [
      <Button key="start" size="sm" onClick={() => executeMut.mutate()} disabled={executeMut.isPending}>▶ 执行</Button>,
    ],
    running: [
      <Button key="stop" size="sm" variant="destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>■ 停止</Button>,
    ],
    blocked: [
      <Button key="reopen" size="sm" onClick={() => reopenMut.mutate()}>解除阻塞</Button>,
    ],
    failed: [
      <Button key="reopen" size="sm" onClick={() => reopenMut.mutate()}>重新打开</Button>,
    ],
    done: [],
    cancelled: [],
  }

  // Edit + Delete always available (except during running)
  const showEdit = task.status !== 'running'
  const showDelete = task.status !== 'running'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {buttons[task.status] || []}

        {/* Spacer */}
        {(buttons[task.status]?.length || 0) > 0 && (showEdit || showDelete) && (
          <div className="w-px h-4 bg-zinc-800 mx-0.5" />
        )}

        {/* Edit */}
        {showEdit && (
          <button
            onClick={openEdit}
            className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-1 rounded hover:bg-zinc-800 transition-colors"
            title="编辑"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete */}
        {showDelete && (
          <button
            onClick={() => setModal('delete')}
            className="text-zinc-500 hover:text-red-400 cursor-pointer p-1 rounded hover:bg-zinc-800 transition-colors"
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Assign Dialog */}
      <Dialog open={modal === 'assign'} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>分配任务</DialogTitle></DialogHeader>
          <select className={inputClass} value={selectedAgent} onChange={(e) => setSelectedAgent(e.target.value)}>
            <option value="">选择智能体...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.displayName || a.name}</option>
            ))}
          </select>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">取消</Button></DialogClose>
            <Button disabled={!selectedAgent || assignMut.isPending} onClick={() => assignMut.mutate()}>分配</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={modal === 'edit'} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑任务</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">标题</label>
              <input className={inputClass} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">描述</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="可选" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">取消</Button></DialogClose>
            <Button disabled={!editTitle.trim() || editMut.isPending} onClick={() => editMut.mutate()}>
              {editMut.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={modal === 'delete'} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>确认删除</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-400">
            确定要删除任务 <span className="text-zinc-200 font-medium">#{task.number} {task.title}</span> 吗？
            此操作不可撤销，相关的日志和产物都会被删除。
          </p>
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">取消</Button></DialogClose>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
              {deleteMut.isPending ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Dialog */}
      <Dialog open={modal === 'complete'} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>完成任务</DialogTitle></DialogHeader>
          <textarea className={`${inputClass} min-h-[80px]`} placeholder="工作总结..." value={input} onChange={(e) => setInput(e.target.value)} />
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">取消</Button></DialogClose>
            <Button disabled={!input.trim() || completeMut.isPending} onClick={() => completeMut.mutate()}>完成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={modal === 'block'} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>阻塞任务</DialogTitle></DialogHeader>
          <textarea className={`${inputClass} min-h-[80px]`} placeholder="阻塞原因..." value={input} onChange={(e) => setInput(e.target.value)} />
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">取消</Button></DialogClose>
            <Button variant="destructive" disabled={!input.trim() || blockMut.isPending} onClick={() => blockMut.mutate()}>阻塞</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fail Dialog */}
      <Dialog open={modal === 'fail'} onOpenChange={(v) => !v && setModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>标记为失败</DialogTitle></DialogHeader>
          <textarea className={`${inputClass} min-h-[80px]`} placeholder="失败原因..." value={input} onChange={(e) => setInput(e.target.value)} />
          <DialogFooter>
            <DialogClose asChild><Button variant="ghost">取消</Button></DialogClose>
            <Button variant="destructive" disabled={!input.trim() || failMut.isPending} onClick={() => failMut.mutate()}>失败</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
