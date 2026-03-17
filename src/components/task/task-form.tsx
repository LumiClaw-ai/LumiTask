'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { createTask, fetchAgents } from '@/lib/api'
import { FolderPicker } from './folder-picker'

export function TaskForm({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [agentId, setAgentId] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [scheduleType, setScheduleType] = useState<'manual' | 'immediate' | 'scheduled' | 'recurring'>('manual')
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduleCron, setScheduleCron] = useState('')
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const onlineAgents = agents?.filter(a => a.status === 'online' || a.status === 'busy') || []

  const mutation = useMutation({
    mutationFn: async () => {
      const data: Parameters<typeof createTask>[0] = {
        title,
        description: description || undefined,
        assigneeAgentId: agentId || undefined,
        workingDirectory: workingDirectory || undefined,
        scheduleType,
      }
      if (scheduleType === 'scheduled' && scheduleAt) {
        data.scheduleAt = new Date(scheduleAt).getTime()
      }
      if (scheduleType === 'recurring' && scheduleCron) {
        data.scheduleCron = scheduleCron
      }
      return createTask(data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setTitle('')
      setDescription('')
      setAgentId('')
      setWorkingDirectory('')
      setScheduleType('manual')
      setScheduleAt('')
      setScheduleCron('')
      onOpenChange(false)
    },
  })

  const inputClass = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-zinc-300 mb-1'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
            className="space-y-4"
          >
            <div>
              <label className={labelClass}>Title *</label>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Task title" />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Agent</label>
                <select className={inputClass} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {onlineAgents.map((a) => (
                    <option key={a.id} value={a.id}>{a.displayName || a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Working Directory</label>
                <div
                  onClick={() => setFolderPickerOpen(true)}
                  className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2.5 cursor-pointer hover:border-zinc-600 transition-colors"
                >
                  <FolderOpen className="h-4 w-4 text-zinc-400" />
                  {workingDirectory ? (
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-zinc-100 truncate block">{workingDirectory}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-zinc-500">点击选择工作目录</span>
                  )}
                  {workingDirectory && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setWorkingDirectory('') }}
                      className="text-zinc-500 hover:text-zinc-300">✕</button>
                  )}
                </div>
              </div>
            </div>

            {/* Schedule Type */}
            <div>
              <label className={labelClass}>Schedule</label>
              <div className="flex gap-3">
                {(['manual', 'immediate', 'scheduled', 'recurring'] as const).map((type) => (
                  <label key={type} className="flex items-center gap-1.5 text-sm text-zinc-300 cursor-pointer">
                    <input
                      type="radio"
                      name="scheduleType"
                      value={type}
                      checked={scheduleType === type}
                      onChange={() => setScheduleType(type)}
                      className="accent-blue-500"
                    />
                    <span className="capitalize">{type}</span>
                  </label>
                ))}
              </div>
            </div>

            {scheduleType === 'scheduled' && (
              <div>
                <label className={labelClass}>Run at</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </div>
            )}

            {scheduleType === 'recurring' && (
              <div>
                <label className={labelClass}>Cron Expression</label>
                <input
                  className={inputClass}
                  value={scheduleCron}
                  onChange={(e) => setScheduleCron(e.target.value)}
                  placeholder="*/30 * * * *"
                />
                <p className="text-xs text-zinc-500 mt-1">e.g. &quot;*/30 * * * *&quot; = every 30 minutes, &quot;0 9 * * 1-5&quot; = weekdays at 9am</p>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={!title.trim() || mutation.isPending}>
                {mutation.isPending ? 'Creating...' : 'Create Task'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FolderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        value={workingDirectory}
        onChange={setWorkingDirectory}
      />
    </>
  )
}
