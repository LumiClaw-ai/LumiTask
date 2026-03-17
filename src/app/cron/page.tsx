'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Pause, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchCronJobs, fetchCronRuns, fetchAgents, createCronJob, updateCronJob, deleteCronJob, runCronJob, type CronJob } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const dowNames: Record<string, string> = { '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六' }

function cronToHuman(cron: string): string {
  if (!cron) return ''
  const parts = cron.split(' ')
  if (parts.length < 5) return cron
  const [min, hour, , , dow] = parts
  if (dow !== '*' && hour !== '*') return `每周${dowNames[dow] || dow} ${hour}:${min.padStart(2, '0')}`
  if (hour !== '*' && min !== '*') return `每天 ${hour}:${min.padStart(2, '0')}`
  if (min.startsWith('*/')) return `每 ${min.slice(2)} 分钟`
  return cron
}

function CreateCronDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const [message, setMessage] = useState('')
  const [cron, setCron] = useState('')
  const [agent, setAgent] = useState('')
  const [description, setDescription] = useState('')

  const mutation = useMutation({
    mutationFn: () => createCronJob({ cron, message, agent: agent || undefined, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron'] })
      addToast({ type: 'success', title: '定时任务已创建' })
      setMessage(''); setCron(''); setAgent(''); setDescription('')
      onClose()
    },
    onError: (err: Error) => addToast({ type: 'error', title: '创建失败', message: err.message }),
  })

  if (!open) return null

  const inputClass = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelClass = 'block text-sm font-medium text-zinc-300 mb-1'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-semibold text-zinc-100">新建定时任务</h3>
          <div>
            <label className={labelClass}>Message</label>
            <textarea className={`${inputClass} min-h-[80px]`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="任务消息..." />
          </div>
          <div>
            <label className={labelClass}>Cron Expression</label>
            <input className={inputClass} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1-5" />
            <p className="text-xs text-zinc-500 mt-1">格式: 分 时 日 月 周 (例: 0 9 * * 1-5 = 工作日9点)</p>
            {cron && <p className="text-xs text-blue-400 mt-1">{cronToHuman(cron)}</p>}
          </div>
          <div>
            <label className={labelClass}>Agent</label>
            <select className={inputClass} value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">Auto</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.displayName || a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Description (optional)</label>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !message.trim() || !cron.trim()}>
              {mutation.isPending ? '创建中...' : '创建'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function RunHistory({ jobId }: { jobId: string }) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['cron-runs', jobId],
    queryFn: () => fetchCronRuns(jobId),
  })

  if (isLoading) return <p className="text-xs text-zinc-500 py-2 px-4">加载中...</p>
  if (runs.length === 0) return <p className="text-xs text-zinc-500 py-2 px-4">暂无运行记录</p>

  return (
    <div className="space-y-1 py-2 px-4">
      {runs.slice(0, 10).map((r: any, i: number) => (
        <div key={r.id || i} className="flex items-center gap-2 text-xs text-zinc-400">
          <span className={r.status === 'done' ? 'text-green-400' : r.status === 'failed' ? 'text-red-400' : 'text-zinc-500'}>
            {r.status === 'done' ? '✓' : r.status === 'failed' ? '✗' : '●'}
          </span>
          <span className="flex-1 truncate">{r.title || r.message || `Run #${i + 1}`}</span>
          <span>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</span>
        </div>
      ))}
    </div>
  )
}

export default function CronPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const { data: jobs = [] } = useQuery({ queryKey: ['cron'], queryFn: fetchCronJobs })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateCronJob(id, { enabled }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron'] }); addToast({ type: 'success', title: '已更新' }) },
    onError: (err: Error) => addToast({ type: 'error', title: '操作失败', message: err.message }),
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => runCronJob(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron'] }); addToast({ type: 'success', title: '已触发执行' }) },
    onError: (err: Error) => addToast({ type: 'error', title: '执行失败', message: err.message }),
  })

  const delMutation = useMutation({
    mutationFn: (id: string) => deleteCronJob(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cron'] }); addToast({ type: 'success', title: '已删除' }) },
    onError: (err: Error) => addToast({ type: 'error', title: '删除失败', message: err.message }),
  })

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pl-12 lg:pl-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">定时任务</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> 新建
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p className="text-4xl mb-2">🔄</p>
          <p>暂无定时任务</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: CronJob) => (
            <div key={job.id} className="rounded-lg bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${job.enabled ? 'bg-green-400' : 'bg-zinc-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100 font-medium truncate">{job.name || job.message || job.description || '(unnamed)'}</p>
                  {job.message && job.name && (
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{job.message}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 flex-wrap">
                    {job.agent && <span>Agent: {job.agent}</span>}
                    {job.cron && (
                      <>
                        <span className="font-mono">{job.cron}</span>
                        <span className="text-blue-400">{cronToHuman(job.cron)}</span>
                      </>
                    )}
                    {job.every && <span>Every: {job.every}</span>}
                    {job.nextRunAt && <span>Next: {new Date(job.nextRunAt).toLocaleString()}</span>}
                    {job.lastRunAt && <span>Last: {new Date(job.lastRunAt).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => toggleMutation.mutate({ id: job.id, enabled: !job.enabled })} title={job.enabled ? '暂停' : '启用'}>
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => runMutation.mutate(job.id)} title="立即执行">
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)} title="历史">
                    {expandedJob === job.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => delMutation.mutate(job.id)} title="删除">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </div>
              </div>
              {expandedJob === job.id && (
                <div className="border-t border-zinc-800 bg-zinc-950">
                  <RunHistory jobId={job.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateCronDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
