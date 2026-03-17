'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Activity, Inbox, CheckCircle, Zap, ChevronRight } from 'lucide-react'
import { fetchDashboard, fetchCronJobs, fetchAgents, type Task } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

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

function formatCost(cents: number): string {
  if (cents < 1) return '$0.00'
  return `$${(cents / 100).toFixed(2)}`
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'done') return <span className="text-green-400">✓</span>
  if (status === 'failed') return <span className="text-red-400">✗</span>
  if (status === 'cancelled') return <span className="text-zinc-500">⊘</span>
  return <span className="text-blue-400">●</span>
}

export default function DashboardPage() {
  const router = useRouter()
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  const { data: cronJobs = [], isLoading: cronLoading } = useQuery({ queryKey: ['cron'], queryFn: fetchCronJobs, staleTime: 120000, gcTime: 300000 })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })

  const stats = dashboard?.stats || { total: 0, running: 0, inbox: 0, done: 0 }
  const recentTasks = dashboard?.recentTasks || []
  const usage = dashboard?.usage || { totalTokens: 0, totalCost: 0 }
  const enabledCrons = cronJobs.filter(j => j.enabled)

  const statCards = [
    { label: 'Total Tasks', value: stats.total, color: 'border-blue-500', icon: Activity },
    { label: 'Running', value: stats.running, color: 'border-purple-500', icon: Zap },
    { label: 'Inbox', value: stats.inbox, color: 'border-yellow-500', icon: Inbox },
    { label: 'Done', value: stats.done, color: 'border-green-500', icon: CheckCircle },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pl-12 lg:pl-6 space-y-6">
      <h2 className="text-lg font-semibold text-zinc-100">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((s) => (
          <div key={s.label} className={`border-l-4 ${s.color} rounded-lg bg-zinc-900 border border-zinc-800 p-4`}>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-zinc-100">{s.value}</span>
              <s.icon className="h-5 w-5 text-zinc-500" />
            </div>
            <p className="text-sm text-zinc-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent tasks */}
      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-300">最近执行任务</h3>
          <button onClick={() => router.push('/tasks')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
            查看全部 <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {recentTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无最近执行的任务</p>
        ) : (
          <div className="space-y-2">
            {recentTasks.slice(0, 10).map((t: Task) => (
              <div
                key={t.id}
                onClick={() => router.push('/tasks')}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-800 cursor-pointer transition-colors"
              >
                <StatusIcon status={t.status} />
                <span className="text-xs text-zinc-500 font-mono">#{t.number}</span>
                <span className="text-sm text-zinc-200 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-zinc-500">{timeAgo(t.completedAt || t.updatedAt)}</span>
                {t.totalCostCents > 0 && (
                  <span className="text-xs text-zinc-500">{formatCost(t.totalCostCents)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cron schedule */}
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300">定时任务日程</h3>
            <button onClick={() => router.push('/cron')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
              查看全部 <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {cronLoading ? (
            <p className="text-sm text-zinc-500 animate-pulse">加载中...</p>
          ) : enabledCrons.length === 0 ? (
            <p className="text-sm text-zinc-500">暂无定时任务</p>
          ) : (
            <div className="space-y-2">
              {enabledCrons.slice(0, 5).map((j) => (
                <div key={j.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-800/50">
                  <span className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-sm text-zinc-200 flex-1 truncate">{j.name || j.message || j.description || '(unnamed)'}</span>
                  {j.nextRunAt && (
                    <span className="text-xs text-zinc-500">{new Date(j.nextRunAt).toLocaleString()}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage + Agents */}
        <div className="space-y-4">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Usage</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-lg font-bold text-zinc-100">{usage.totalTokens.toLocaleString()}</p>
                <p className="text-xs text-zinc-500">Total Tokens</p>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">${(usage.totalCost / 100).toFixed(2)}</p>
                <p className="text-xs text-zinc-500">Total Cost</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Agents</h3>
            {agents.length === 0 ? (
              <p className="text-sm text-zinc-500">No agents detected</p>
            ) : (
              <div className="space-y-2">
                {agents.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-800/50">
                    <span className="text-sm text-zinc-200 flex-1">{a.displayName || a.name}</span>
                    <Badge variant={a.status}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
