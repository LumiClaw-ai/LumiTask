'use client'

import { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Copy, Check, GitBranch, ListTree } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchTask } from '@/lib/api'
import type { ActivityLogEntry } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { formatTokens, formatCost, timeAgo } from '@/lib/utils'
import { TaskActions } from './task-actions'
import { CommentsList } from './comments-list'
import { LogsList } from './logs-list'
import { DecisionCard } from './decision-card'

function formatDate(ts?: number | null) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const scheduleLabels: Record<string, string> = {
  manual: '手动',
  immediate: '\u26A1 立即执行',
  scheduled: '\u{1F550} 定时',
  recurring: '\u{1F504} 循环',
}

interface TaskDrawerProps {
  taskId: string | null
  onClose: () => void
}

type Tab = 'logs' | 'comments'

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className || ''}`} />
}

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const [resultExpanded, setResultExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('logs')

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => fetchTask(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const t = query.state.data
      return t?.status === 'running' ? 5000 : false
    },
  })

  useEffect(() => {
    setResultExpanded(false)
  }, [taskId])

  // Auto-switch tab based on status
  useEffect(() => {
    if (task?.status === 'blocked') setActiveTab('comments')
    else setActiveTab('logs')
  }, [task?.status])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Split activity log into comments vs logs
  const { comments, logs } = useMemo(() => {
    const all = task?.activityLog || []
    const comments: ActivityLogEntry[] = []
    const logs: ActivityLogEntry[] = []
    for (const entry of all) {
      if (entry.action.startsWith('comment.') || entry.action === 'comment' || entry.action === 'task.blocked') {
        comments.push(entry)
      } else {
        logs.push(entry)
      }
    }
    return { comments, logs }
  }, [task?.activityLog])

  if (!taskId) return null

  const statusVariant = task?.status as 'open' | 'assigned' | 'running' | 'blocked' | 'done' | 'failed' | 'cancelled' | undefined
  const isBlocked = task?.status === 'blocked'
  const isRunning = task?.status === 'running'

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl flex flex-col bg-zinc-950 border-l border-zinc-800 shadow-2xl animate-in slide-in-from-right duration-200 pt-10">
        {isLoading ? (
          <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-48" />
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : !task ? (
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <span className="text-sm text-zinc-500">未找到任务</span>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            {/* Fixed top bar — only title + close + status + actions */}
            <div className="flex-shrink-0 border-b border-zinc-800">
              <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-zinc-100 leading-snug">
                    <span className="text-zinc-500 font-mono text-sm">#{task.number}</span>{' '}
                    {task.title}
                  </h2>
                </div>
                <button onClick={onClose} className="flex-shrink-0 text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer mt-0.5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-5 pb-2 flex items-center gap-2 flex-wrap">
                {statusVariant && <Badge variant={statusVariant}>{task.status}</Badge>}
                {task.scheduleType && task.scheduleType !== 'manual' && (
                  <Badge variant={task.scheduleType as 'immediate' | 'scheduled' | 'recurring'}>{scheduleLabels[task.scheduleType]}</Badge>
                )}
                {task.assigneeAgentId && (
                  <span className="text-xs text-zinc-400">
                    智能体: {task.agent ? (task.agent.displayName || task.agent.name) : task.assigneeAgentId}
                  </span>
                )}
                {((task.totalInputTokens || 0) + (task.totalOutputTokens || 0)) > 0 && (
                  <span className="text-xs text-zinc-500 ml-auto">
                    {formatTokens(task.totalInputTokens || 0)} / {formatTokens(task.totalOutputTokens || 0)}
                    {task.totalCostCents ? ` (~${formatCost(task.totalCostCents)})` : ''}
                  </span>
                )}
              </div>

              {/* Workflow stage visualization */}
              <div className="px-5 pb-2 flex items-center gap-1 overflow-x-auto">
                {[
                  { key: 'created', label: '创建', match: () => true },
                  { key: 'running', label: '执行', match: () => ['running', 'blocked', 'done', 'failed'].includes(task.status) },
                  { key: 'done', label: '完成', match: () => task.status === 'done' },
                ].map((stage, i, arr) => {
                  const active = stage.match()
                  const isCurrent =
                    (stage.key === 'created' && ['open', 'assigned'].includes(task.status)) ||
                    (stage.key === 'running' && ['running', 'blocked'].includes(task.status)) ||
                    (stage.key === 'done' && task.status === 'done')
                  const isFailed = stage.key === 'running' && task.status === 'failed'
                  return (
                    <div key={stage.key} className="flex items-center gap-1">
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                        isFailed ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                        isCurrent ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.15)]' :
                        active ? 'bg-green-500/10 text-green-400' :
                        'text-zinc-600'
                      }`}>
                        {isFailed ? '✗' : active && !isCurrent ? '✓' : '●'} {stage.label}
                      </div>
                      {i < arr.length - 1 && <span className={`text-[10px] ${active ? 'text-zinc-500' : 'text-zinc-700'}`}>→</span>}
                    </div>
                  )
                })}
              </div>

              <div className="px-5 pb-2">
                <TaskActions task={task} onDeleted={onClose} />
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* Timestamps */}
              <div className="px-5 py-2 flex gap-4 text-xs text-zinc-500">
                <span>创建于 {formatDate(task.createdAt)}</span>
                {task.startedAt && <span>开始于 {formatDate(task.startedAt)}</span>}
                {task.completedAt && <span>完成于 {formatDate(task.completedAt)}</span>}
              </div>

              {task.workingDirectory && (
                <div className="px-5 pb-2">
                  <span className="text-xs text-zinc-500">📁 {task.workingDirectory}</span>
                </div>
              )}

              {task.description && (
                <div className="mx-5 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <h3 className="text-xs font-medium text-zinc-400 mb-1.5">描述</h3>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Dependencies */}
              {task.dependencies && task.dependencies.length > 0 && (
                <div className="mx-5 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <h3 className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                    <GitBranch className="h-3 w-3" /> 前置依赖
                  </h3>
                  <div className="space-y-1.5">
                    {task.dependencies.map(dep => (
                      <div key={dep.id} className="flex items-center gap-2 text-sm">
                        <span className={
                          dep.status === 'done' ? 'text-green-400' :
                          dep.status === 'failed' ? 'text-red-400' :
                          dep.status === 'running' ? 'text-blue-400' :
                          'text-zinc-500'
                        }>
                          {dep.status === 'done' ? '✓' : dep.status === 'failed' ? '✗' : dep.status === 'running' ? '◉' : '○'}
                        </span>
                        <span className="text-zinc-500 font-mono text-xs">#{dep.number}</span>
                        <span className="text-zinc-300 truncate">{dep.title}</span>
                        <Badge variant={dep.status as any} className="ml-auto text-[10px] py-0">{dep.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtasks */}
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="mx-5 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <h3 className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                    <ListTree className="h-3 w-3" /> 子任务 ({task.subtasks.filter(s => s.status === 'done').length}/{task.subtasks.length})
                  </h3>
                  <div className="space-y-1.5">
                    {task.subtasks.map(sub => (
                      <div key={sub.id} className="flex items-center gap-2 text-sm">
                        <span className={
                          sub.status === 'done' ? 'text-green-400' :
                          sub.status === 'failed' ? 'text-red-400' :
                          sub.status === 'running' ? 'text-blue-400' :
                          'text-zinc-500'
                        }>
                          {sub.status === 'done' ? '✓' : sub.status === 'failed' ? '✗' : sub.status === 'running' ? '◉' : '○'}
                        </span>
                        <span className="text-zinc-500 font-mono text-xs">#{sub.number}</span>
                        <span className="text-zinc-300 truncate">{sub.title}</span>
                        <Badge variant={sub.status as any} className="ml-auto text-[10px] py-0">{sub.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Retry info */}
              {(task.retryCount ?? 0) > 0 && (
                <div className="mx-5 mb-3">
                  <span className="text-xs text-zinc-500">重试 {task.retryCount}/{task.maxRetries ?? 0}</span>
                </div>
              )}

              {(task.summary || task.result) && (
                <div className="mx-5 mb-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-medium text-zinc-400">执行结果</h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(task.result || task.summary || '')
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                      className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-1 rounded hover:bg-zinc-800 transition-colors"
                      title="复制"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className={`max-w-none overflow-x-auto ${resultExpanded ? '' : 'max-h-48 overflow-hidden relative'}`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="text-sm text-zinc-300 mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="text-sm text-zinc-300 list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        ol: ({ children }) => <ol className="text-sm text-zinc-300 list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm text-zinc-300">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-semibold text-zinc-100 mb-2 mt-3">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-semibold text-zinc-100 mb-1.5 mt-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-medium text-zinc-200 mb-1 mt-2">{children}</h3>,
                        strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-')
                          return isBlock
                            ? <code className="block bg-zinc-950 rounded p-2 text-xs text-zinc-300 overflow-x-auto">{children}</code>
                            : <code className="bg-zinc-800 rounded px-1 py-0.5 text-xs text-zinc-300">{children}</code>
                        },
                        pre: ({ children }) => <pre className="bg-zinc-950 rounded p-3 overflow-x-auto mb-2">{children}</pre>,
                        a: ({ href, children }) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
                        blockquote: ({ children }) => <blockquote className="border-l-2 border-zinc-700 pl-3 text-zinc-400 italic">{children}</blockquote>,
                        table: ({ children }) => (
                          <div className="overflow-x-auto mb-2">
                            <table className="text-sm text-zinc-300 border-collapse w-full">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="border-b border-zinc-700">{children}</thead>,
                        tbody: ({ children }) => <tbody>{children}</tbody>,
                        tr: ({ children }) => <tr className="border-b border-zinc-800">{children}</tr>,
                        th: ({ children }) => <th className="text-left px-2 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-800/50">{children}</th>,
                        td: ({ children }) => <td className="px-2 py-1.5 text-xs text-zinc-300">{children}</td>,
                      }}
                    >
                      {task.result || task.summary || ''}
                    </ReactMarkdown>
                    {task.result && task.result.length > 300 && (
                      <div
                        onClick={() => setResultExpanded(!resultExpanded)}
                        className={`${resultExpanded ? '' : 'absolute bottom-0 left-0 right-0'} flex items-end justify-center cursor-pointer ${
                          resultExpanded ? 'pt-1' : 'h-16 bg-gradient-to-t from-zinc-900 via-zinc-900/95 to-transparent'
                        }`}
                      >
                        <span className="text-xs text-blue-400 hover:text-blue-300 pb-1.5">
                          {resultExpanded ? '▲ 收起' : '▼ 展开全部'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {task.blockReason && (
                <DecisionCard taskId={task.id} blockReason={task.blockReason} />
              )}

              {task.failReason && (
                <div className="mx-5 mb-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
                  <h3 className="text-xs font-medium text-red-400 mb-1">失败原因</h3>
                  <p className="text-sm text-zinc-400">{task.failReason}</p>
                </div>
              )}

              {task.artifacts && task.artifacts.length > 0 && (
                <div className="mx-5 mb-3 space-y-2">
                  <h3 className="text-xs font-medium text-zinc-400">产物</h3>
                  {task.artifacts.map((a) => (
                    <div key={a.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 flex items-center gap-2">
                      <Badge variant="default">{a.type}</Badge>
                      <span className="text-sm text-zinc-300 truncate">{a.name || '未命名'}</span>
                      <span className="text-xs text-zinc-600 ml-auto flex-shrink-0">{timeAgo(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tab bar — sticky within scroll */}
              <div className="flex border-t border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === 'logs'
                      ? 'text-zinc-100 border-b-2 border-blue-500'
                      : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
                  }`}
                >
                  日志 {logs.length > 0 && `(${logs.length})`}
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                    activeTab === 'comments'
                      ? 'text-zinc-100 border-b-2 border-blue-500'
                      : 'text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent'
                  }`}
                >
                  评论 {comments.length > 0 && `(${comments.length})`}
                </button>
              </div>

              {/* Tab content */}
              <div className="min-h-[300px]">
                {activeTab === 'comments' ? (
                  <CommentsList taskId={task.id} comments={comments} status={task.status} />
                ) : (
                  <LogsList logs={logs} isRunning={isRunning} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
