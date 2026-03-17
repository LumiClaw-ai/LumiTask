'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Play, Pause, Trash2, ChevronDown, ChevronUp, Clock, Timer } from 'lucide-react'
import { fetchCronJobs, fetchCronRuns, fetchAgents, createCronJob, updateCronJob, deleteCronJob, runCronJob, type CronJob } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { timeAgo } from '@/lib/utils'

const dowNames: Record<string, string> = { '0': '周日', '1': '周一', '2': '周二', '3': '周三', '4': '周四', '5': '周五', '6': '周六' }

function cronToHuman(cron: string): string {
  if (!cron) return ''
  const parts = cron.split(' ')
  if (parts.length < 5) return cron
  const [min, hour, , , dow] = parts
  if (dow !== '*' && hour !== '*') return `每${dowNames[dow] || dow} ${hour}:${min.padStart(2, '0')}`
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
  const labelClass = 'block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-5 shadow-2xl">
          <h3 className="text-lg font-semibold text-zinc-100">新建定时任务</h3>
          <div>
            <label className={labelClass}>任务内容</label>
            <textarea className={`${inputClass} min-h-[80px] resize-none`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="任务描述..." />
          </div>
          <div>
            <label className={labelClass}>Cron 表达式</label>
            <input className={inputClass} value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * 1-5" />
            <p className="text-xs text-zinc-600 mt-1.5">格式：分 时 日 月 周（如 0 9 * * 1-5 = 工作日 9:00）</p>
            {cron && <p className="text-xs text-blue-400 mt-1 font-medium">{cronToHuman(cron)}</p>}
          </div>
          <div>
            <label className={labelClass}>智能体</label>
            <select className={inputClass} value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">自动</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.displayName || a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>描述（可选）</label>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !message.trim() || !cron.trim()}>
              {mutation.isPending ? '创建中...' : '新建'}
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

  if (isLoading) return <p className="text-xs text-zinc-500 py-3 px-4">加载中...</p>
  if (runs.length === 0) return <p className="text-xs text-zinc-500 py-3 px-4">暂无执行记录</p>

  return (
    <div className="space-y-1 py-3 px-4">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">执行历史</p>
      {runs.slice(0, 10).map((r: any, i: number) => (
        <div key={r.id || i} className="flex items-center gap-2 text-xs text-zinc-400 activity-row-enter">
          <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${r.status === 'done' ? 'bg-green-500' : r.status === 'failed' ? 'bg-red-500' : 'bg-zinc-500'}`} />
          <span className="flex-1 truncate">{r.title || r.message || `执行 #${i + 1}`}</span>
          <span className="text-zinc-600">{r.createdAt ? timeAgo(r.createdAt) : ''}</span>
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

  const enabledJobs = jobs.filter((j: CronJob) => j.enabled)
  const disabledJobs = jobs.filter((j: CronJob) => !j.enabled)

  const renderJob = (job: CronJob) => (
    <div key={job.id} className={`rounded-lg bg-zinc-900/50 border border-zinc-800 overflow-hidden border-l-2 ${job.enabled ? 'border-l-green-500/60' : 'border-l-zinc-600/60'} hover:border-zinc-700 transition-colors activity-row-enter`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
        >
          <p className="text-sm text-zinc-100 font-medium truncate">{job.name || job.message || job.description || '(未命名)'}</p>
          {job.message && job.name && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">{job.message}</p>
          )}
          {/* Human-readable schedule - prominent */}
          {job.cron && (
            <p className="text-sm text-blue-400 font-medium mt-1.5">{cronToHuman(job.cron)}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-600 flex-wrap">
            {job.agent && <span>智能体: {job.agent}</span>}
            {job.cron && <span className="font-mono text-zinc-600">{job.cron}</span>}
            {job.every && <span>频率: {job.every}</span>}
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-zinc-600">
            {job.nextRunAt && (
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" /> 下次: {timeAgo(new Date(job.nextRunAt).getTime())}
              </span>
            )}
            {job.lastRunAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> 上次: {timeAgo(new Date(job.lastRunAt).getTime())}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            className={`p-1.5 rounded-md transition-colors ${job.enabled ? 'text-green-400 hover:text-yellow-400 hover:bg-zinc-800' : 'text-zinc-500 hover:text-green-400 hover:bg-zinc-800'}`}
            onClick={() => toggleMutation.mutate({ id: job.id, enabled: !job.enabled })}
            title={job.enabled ? '暂停' : '启用'}
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            onClick={() => runMutation.mutate(job.id)}
            title="立即执行"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
            title="历史"
          >
            {expandedJob === job.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            onClick={() => delMutation.mutate(job.id)}
            title="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expandedJob === job.id && (
        <div className="border-t border-zinc-800 bg-zinc-950/50">
          <RunHistory jobId={job.id} />
        </div>
      )}
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pl-12 lg:pl-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">定时任务</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">新建</span>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">
          <Clock className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">暂无定时任务</p>
          <p className="text-xs mt-1">创建定时任务来自动化执行</p>
        </div>
      ) : (
        <div className="space-y-6">
          {enabledJobs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">运行中 ({enabledJobs.length})</p>
              {enabledJobs.map(renderJob)}
            </div>
          )}
          {disabledJobs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">已暂停 ({disabledJobs.length})</p>
              {disabledJobs.map(renderJob)}
            </div>
          )}
        </div>
      )}

      <CreateCronDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
