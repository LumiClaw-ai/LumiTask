'use client'

import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  ChevronRight,
  Copy,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Play,
  Inbox,
  CheckCircle,
  Clock,
  Zap,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useToast } from '@/components/ui/toast'
import {
  fetchDashboard,
  fetchActiveSessions,
  fetchTasks,
  fetchCronJobs,
  fetchInbox,
  fetchAgents,
  type Task,
  type ActiveSession,
  type Agent,
  type AgentLiveStatus,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function RunningTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [startedAt])
  const seconds = Math.floor(elapsed / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return <span className="font-mono text-xs text-purple-400">{minutes}:{secs.toString().padStart(2, '0')}</span>
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className || ''}`} />
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  value,
  label,
  description,
  icon: Icon,
  accentColor = 'zinc',
  onClick,
}: {
  value: number
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  accentColor?: 'zinc' | 'purple' | 'blue' | 'green'
  onClick?: () => void
}) {
  const colorMap = {
    zinc: 'bg-zinc-600',
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    green: 'bg-emerald-500',
  }

  return (
    <div
      onClick={onClick}
      className={`rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-4 sm:px-5 sm:py-5 hover:bg-zinc-800/50 transition-colors relative overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorMap[accentColor]}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-100">{value}</p>
          <p className="text-xs sm:text-sm font-medium text-zinc-400 mt-1">{label}</p>
          {description && <p className="text-xs text-zinc-500 mt-1.5 hidden sm:block">{description}</p>}
        </div>
        <Icon className="h-4 w-4 text-zinc-600" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NowPage() {
  const router = useRouter()
  const { addToast } = useToast()

  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 10000,
  })

  const { data: sessionData } = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchActiveSessions,
    refetchInterval: 5000,
  })

  const { data: runningTasks = [] } = useQuery({
    queryKey: ['tasks', 'running'],
    queryFn: () => fetchTasks({ status: 'running' }),
    refetchInterval: 5000,
  })

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetchTasks(),
  })

  const { data: cronJobs = [] } = useQuery({
    queryKey: ['cron'],
    queryFn: fetchCronJobs,
    staleTime: 120000,
    gcTime: 300000,
  })

  const { data: inbox = [] } = useQuery({
    queryKey: ['inbox'],
    queryFn: fetchInbox,
  })

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: fetchAgents,
  })

  // Merge running tasks + active sessions
  const activeSessions = sessionData?.activeSessions ?? []
  const agentStatuses = sessionData?.agentStatuses ?? dashboard?.agentStatuses ?? []

  const { taskItems, sessionOnlyItems } = useMemo(() => {
    const runningAgentIds = new Set(runningTasks.map(t => t.assigneeAgentId).filter(Boolean))
    const sessionOnly = activeSessions.filter(s => !runningAgentIds.has(s.agentId))
    return { taskItems: runningTasks, sessionOnlyItems: sessionOnly }
  }, [runningTasks, activeSessions])

  const hasActiveWork = taskItems.length > 0 || sessionOnlyItems.length > 0

  // Recent completed tasks from dashboard
  const recentDone = useMemo(() => {
    const tasks = dashboard?.recentTasks ?? []
    return tasks.filter(t => t.status === 'done' || t.status === 'failed').slice(0, 5)
  }, [dashboard])

  const enabledCrons = cronJobs.filter(j => j.enabled).slice(0, 3)

  // 7-Day activity chart data
  const days = useMemo(() => {
    const result = []
    for (let i = 6; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dayStr = date.toISOString().slice(0, 10)
      const dayLabel = date.toLocaleDateString('zh-CN', { weekday: 'short' })
      const dayTasks = allTasks.filter(t => {
        const created = new Date(t.createdAt).toISOString().slice(0, 10)
        return created === dayStr
      })
      result.push({
        date: dayStr,
        label: dayLabel,
        done: dayTasks.filter(t => t.status === 'done').length,
        failed: dayTasks.filter(t => t.status === 'failed').length,
        other: dayTasks.filter(t => !['done', 'failed'].includes(t.status)).length,
      })
    }
    return result
  }, [allTasks])

  const maxDayTotal = Math.max(1, ...days.map(d => d.done + d.failed + d.other))
  const barScale = 80 / maxDayTotal

  // Token & cost summary
  const totalTokens = dashboard?.usage?.totalTokens ?? 0
  const totalCost = dashboard?.usage?.totalCost ?? 0
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayTasks = allTasks.filter(t => new Date(t.createdAt).toISOString().slice(0, 10) === todayStr)
  const todayTokens = todayTasks.reduce((sum, t) => sum + t.totalInputTokens + t.totalOutputTokens, 0)
  const todayCost = todayTasks.reduce((sum, t) => sum + t.totalCostCents, 0)

  // Build agent display map
  const agentMap = useMemo(() => {
    const map = new Map<string, { agent?: Agent; status?: AgentLiveStatus; busyWith?: string }>()
    for (const a of agents) {
      map.set(a.id, { agent: a })
    }
    for (const s of agentStatuses) {
      const entry = map.get(s.agentId) || {}
      entry.status = s
      map.set(s.agentId, entry)
    }
    for (const t of runningTasks) {
      if (t.assigneeAgentId) {
        const entry = map.get(t.assigneeAgentId)
        if (entry) entry.busyWith = t.title
      }
    }
    for (const s of sessionOnlyItems) {
      const entry = map.get(s.agentId)
      if (entry && !entry.busyWith) entry.busyWith = s.lastUserMessage?.slice(0, 60) || '活跃会话'
    }
    return map
  }, [agents, agentStatuses, runningTasks, sessionOnlyItems])

  const stats = dashboard?.stats

  return (
    <div className="p-4 md:p-6 space-y-6 pl-12 lg:pl-6 max-w-7xl overflow-y-auto h-full">

      {/* -- Section 1: Stat Cards -- */}
      {!dashboard ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard value={stats?.total ?? 0} label="总任务" icon={ClipboardList} accentColor="zinc" onClick={() => router.push('/tasks')} />
          <StatCard value={stats?.running ?? 0} label="执行中" icon={Play} accentColor="purple" description="当前正在运行" onClick={() => router.push('/tasks?status=running')} />
          <StatCard value={stats?.inbox ?? 0} label="收集箱" icon={Inbox} accentColor="blue" onClick={() => router.push('/inbox')} />
          <StatCard value={stats?.done ?? 0} label="已完成" icon={CheckCircle} accentColor="green" onClick={() => router.push('/tasks?status=done')} />
        </div>
      )}

      {/* -- Section 2: Activity Chart + Token Usage -- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left: 7-Day Activity Chart */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">7日活动</h3>
            <div className="flex items-center gap-3 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> 完成</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> 失败</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-600 inline-block" /> 其他</span>
            </div>
          </div>
          <div className="flex items-end gap-[3px] h-24">
            {days.map(day => {
              const total = day.done + day.failed + day.other
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center">
                  <div className="flex flex-col-reverse w-full items-stretch flex-1">
                    {day.other > 0 && (
                      <div
                        style={{ height: `${day.other * barScale}px` }}
                        className="bg-zinc-600 rounded-t-sm min-h-[2px]"
                      />
                    )}
                    {day.failed > 0 && (
                      <div
                        style={{ height: `${day.failed * barScale}px` }}
                        className="bg-red-500 min-h-[2px]"
                      />
                    )}
                    {day.done > 0 && (
                      <div
                        style={{ height: `${day.done * barScale}px` }}
                        className="bg-emerald-500 rounded-t-sm min-h-[2px]"
                      />
                    )}
                    {total === 0 && <div className="bg-zinc-800 rounded-t-sm min-h-[2px]" style={{ height: '2px' }} />}
                  </div>
                  <span className="text-[10px] text-zinc-600 mt-1">{day.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Token & Cost Summary */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-4 sm:px-5 sm:py-5">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">消耗统计</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3.5 w-3.5 text-zinc-600" />
                <span className="text-xs text-zinc-500">总计 Tokens</span>
              </div>
              <p className="text-xl font-semibold text-zinc-100">{formatTokens(totalTokens)}</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="h-3.5 w-3.5 text-zinc-600" />
                <span className="text-xs text-zinc-500">总计费用</span>
              </div>
              <p className="text-xl font-semibold text-zinc-100">{formatCost(totalCost)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">今日 Tokens</span>
              <p className="text-lg font-medium text-zinc-200">{formatTokens(todayTokens)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">今日费用</span>
              <p className="text-lg font-medium text-zinc-200">{formatCost(todayCost)}</p>
            </div>
          </div>
          {/* Today vs average bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-1">
              <span>今日</span>
              <span>7日均值</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, totalTokens > 0 ? (todayTokens / (totalTokens / 7)) * 100 : 0)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* -- Section 3: Active Work -- */}
      <section>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">进行中</h3>
        {!hasActiveWork ? (
          <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-8 text-center">
            <p className="text-2xl mb-2 animate-quiet-pulse">一切安好 ☀️</p>
            <p className="text-sm text-zinc-500">所有智能体空闲中</p>
          </div>
        ) : (
          <div className="space-y-3">
            {taskItems.map(t => (
              <ActiveTaskCard key={t.id} task={t} session={activeSessions.find(s => s.agentId === t.assigneeAgentId)} router={router} />
            ))}
            {sessionOnlyItems.map(s => (
              <ActiveSessionCard key={s.key} session={s} />
            ))}
          </div>
        )}
      </section>

      {/* -- Section 4: Agents -- */}
      {agents.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">智能体状态</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from(agentMap.entries()).map(([id, entry]) => {
              const isBusy = entry.status?.state === 'busy' || runningTasks.some(t => t.assigneeAgentId === id)
              return (
                <div
                  key={id}
                  onClick={() => router.push(`/tasks?agent=${id}`)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                >
                  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    {isBusy && <span className="animate-ping absolute h-full w-full rounded-full bg-purple-400 opacity-75" />}
                    <span className={`relative rounded-full h-2.5 w-2.5 ${isBusy ? 'bg-purple-500' : 'bg-green-500'}`} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{entry.agent?.displayName || entry.agent?.name || id}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {isBusy && entry.busyWith ? `忙碌中 · ${entry.busyWith}` : isBusy ? '忙碌中 · 正在执行任务' : '在线 · 空闲'}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* -- Section 5: Just Completed + Upcoming/Inbox -- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left: Just Completed (2/3 width) */}
        <section className="md:col-span-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">最近完成</h3>
          {recentDone.length === 0 ? (
            <div className="rounded-lg bg-zinc-900/50 border border-zinc-800 p-4">
              <p className="text-sm text-zinc-500">暂无最近完成的任务</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDone.map(t => (
                <CompletedTaskCard key={t.id} task={t} router={router} />
              ))}
            </div>
          )}
        </section>

        {/* Right: Upcoming + Inbox */}
        <section className="space-y-4">
          {/* Upcoming Routines */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">即将执行</h3>
              <button onClick={() => router.push('/cron')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
                查看全部 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {enabledCrons.length === 0 ? (
              <p className="text-sm text-zinc-500">暂无定时任务</p>
            ) : (
              <div className="space-y-2">
                {enabledCrons.map(j => (
                  <div key={j.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-800/50">
                    <Clock className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                    <span className="text-sm text-zinc-200 flex-1 truncate">{j.name || j.message || j.description || '(未命名)'}</span>
                    {j.nextRunAt && (
                      <span className="text-xs text-zinc-500 flex-shrink-0">{new Date(j.nextRunAt).toLocaleString()}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inbox Preview */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                收集箱 {inbox.length > 0 && <span className="ml-1 text-yellow-400">({inbox.length})</span>}
              </h3>
              <button onClick={() => router.push('/inbox')} className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-1">
                查看全部 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {inbox.length === 0 ? (
              <p className="text-sm text-zinc-500">收集箱为空</p>
            ) : (
              <div className="space-y-2">
                {inbox.slice(0, 2).map(item => (
                  <div key={item.id} onClick={() => router.push('/inbox')} className="flex items-center gap-3 px-3 py-2 rounded-md bg-zinc-800/50 hover:bg-zinc-800 cursor-pointer transition-colors">
                    <span className="h-2 w-2 rounded-full bg-yellow-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-200 flex-1 truncate">{item.title}</span>
                    <span className="text-xs text-zinc-500">{timeAgo(item.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active Task Card
// ---------------------------------------------------------------------------

function ActiveTaskCard({ task, session, router }: { task: Task; session?: ActiveSession; router: ReturnType<typeof useRouter> }) {
  const latestLogs = task.activityLog?.slice(-3) ?? []
  const sessionMessages = session?.latestMessages?.slice(-3) ?? []

  return (
    <div
      onClick={() => router.push(`/tasks?id=${task.id}`)}
      className="activity-row-enter rounded-lg bg-zinc-900/50 border border-zinc-800 p-4 cursor-pointer hover:bg-zinc-800/50 transition-colors relative overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative rounded-full h-2.5 w-2.5 bg-purple-500" />
          </span>
          <span className="text-xs text-zinc-500 font-mono">#{task.number}</span>
          <span className="text-sm font-medium text-zinc-100 truncate">{task.title}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {task.agentName && <span className="text-xs text-zinc-500">{task.agentName}</span>}
          {task.startedAt && <RunningTimer startedAt={task.startedAt} />}
        </div>
      </div>

      {(latestLogs.length > 0 || sessionMessages.length > 0) && (
        <div className="space-y-1 mt-2">
          {latestLogs.length > 0
            ? latestLogs.map((log, i) => (
                <div key={i} className="text-xs text-zinc-500 truncate pl-4">
                  {log.toolName ? (
                    <span><span className="text-purple-400">{log.toolName}</span> {log.message || ''}</span>
                  ) : (
                    log.message
                  )}
                </div>
              ))
            : sessionMessages.map((msg, i) => (
                <div key={i} className="text-xs text-zinc-500 truncate pl-4">
                  {msg.toolCalls?.length ? (
                    <span><span className="text-purple-400">{msg.toolCalls[0].name}</span></span>
                  ) : msg.text ? (
                    <span>{msg.text.slice(0, 120)}</span>
                  ) : null}
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active Session Card
// ---------------------------------------------------------------------------

function ActiveSessionCard({ session }: { session: ActiveSession }) {
  const messages = session.latestMessages?.slice(-3) ?? []

  return (
    <div className="activity-row-enter rounded-lg bg-zinc-900/50 border border-zinc-800 p-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative rounded-full h-2.5 w-2.5 bg-purple-500" />
          </span>
          <span className="text-sm font-medium text-zinc-100 truncate">{session.agentName || session.agentId}</span>
          <span className="text-xs text-zinc-600">会话</span>
        </div>
        <RunningTimer startedAt={session.updatedAt - 60000} />
      </div>

      {session.lastUserMessage && (
        <p className="text-xs text-zinc-400 truncate pl-4 mb-1">&gt; {session.lastUserMessage}</p>
      )}

      {messages.length > 0 && (
        <div className="space-y-1">
          {messages.map((msg, i) => (
            <div key={i} className="text-xs text-zinc-500 truncate pl-4">
              {msg.toolCalls?.length ? (
                <span><span className="text-purple-400">{msg.toolCalls[0].name}</span></span>
              ) : msg.text ? (
                <span>{msg.text.slice(0, 120)}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Completed Task Card
// ---------------------------------------------------------------------------

function CompletedTaskCard({ task, router }: { task: Task; router: ReturnType<typeof useRouter> }) {
  const { addToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const statusIcon = task.status === 'done' ? '✅' : '❌'
  const resultPreview = task.result || task.summary || ''
  const previewLines = resultPreview.split('\n').slice(0, 2).join('\n')

  return (
    <div className="activity-row-enter rounded-lg bg-zinc-900/50 border border-zinc-800 p-4 hover:bg-zinc-800/50 transition-colors">
      <div className="flex items-center gap-3">
        <span className="flex-shrink-0">{statusIcon}</span>
        <span
          onClick={() => router.push(`/tasks?id=${task.id}`)}
          className="text-sm text-zinc-200 flex-1 truncate cursor-pointer hover:text-zinc-100"
        >
          {task.title}
        </span>
        <span className="text-xs text-zinc-500 flex-shrink-0">{timeAgo(task.completedAt || task.updatedAt)}</span>
        {task.totalCostCents > 0 && (
          <span className="text-xs text-zinc-500 flex-shrink-0">{formatCost(task.totalCostCents)}</span>
        )}
      </div>

      {resultPreview && (
        <div className="mt-2 pl-8">
          <div className="text-xs text-zinc-400 prose prose-invert prose-xs max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {expanded ? resultPreview : previewLines}
            </ReactMarkdown>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {resultPreview.split('\n').length > 2 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer flex items-center gap-0.5"
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> 收起</> : <><ChevronDown className="h-3 w-3" /> 展开</>}
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(resultPreview); addToast({ type: 'success', title: '已复制' }) }}
              className="text-xs text-zinc-500 hover:text-zinc-400 cursor-pointer flex items-center gap-0.5"
            >
              <Copy className="h-3 w-3" /> 复制
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
