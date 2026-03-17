'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import {
  assignTask,
  executeTask,
  cancelTask,
  completeTask,
  blockTask,
  failTask,
  reopenTask,
  updateTask,
  fetchAgents,
  type Task,
} from '@/lib/api'

type ModalType = 'assign' | 'complete' | 'block' | 'fail' | null

export function TaskActions({ task }: { task: Task }) {
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<ModalType>(null)
  const [input, setInput] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents, enabled: modal === 'assign' })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
    queryClient.invalidateQueries({ queryKey: ['task', task.id] })
  }

  const executeMut = useMutation({ mutationFn: () => executeTask(task.id), onSuccess: invalidate })
  const cancelMut = useMutation({ mutationFn: () => cancelTask(task.id), onSuccess: invalidate })
  const reopenMut = useMutation({ mutationFn: () => reopenTask(task.id), onSuccess: invalidate })
  const cancelStatusMut = useMutation({ mutationFn: () => updateTask(task.id, { status: 'cancelled' } as Partial<Task>), onSuccess: invalidate })

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

  const inputClass = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  const openButtons = [
    <Button key="start" size="sm" onClick={() => executeMut.mutate()} disabled={executeMut.isPending}>▶ 开始</Button>,
    <Button key="assign" size="sm" variant="outline" onClick={() => setModal('assign')}>分配</Button>,
    <Button key="cancel" size="sm" variant="ghost" onClick={() => cancelStatusMut.mutate()}>取消</Button>,
  ]

  const buttons: Record<string, React.ReactNode[]> = {
    open: openButtons,
    assigned: openButtons,
    running: [
      <Button key="stop" size="sm" variant="destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>■ 停止</Button>,
    ],
    blocked: [
      <Button key="reopen" size="sm" onClick={() => reopenMut.mutate()}>解除阻塞</Button>,
      <Button key="cancel" size="sm" variant="ghost" onClick={() => cancelStatusMut.mutate()}>取消</Button>,
    ],
    failed: [
      <Button key="reopen" size="sm" onClick={() => reopenMut.mutate()}>重新打开</Button>,
    ],
    done: [],
    cancelled: [],
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {buttons[task.status] || []}
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
