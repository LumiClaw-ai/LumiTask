'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { RefreshCw, Bot, Star } from 'lucide-react'
import { fetchAgents, detectAgents, getSettings, updateSettings, type Agent } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

const statusColors: Record<string, string> = {
  online: 'border-l-green-500',
  busy: 'border-l-purple-500',
  offline: 'border-l-zinc-600',
}

const statusDotColors: Record<string, string> = {
  online: 'bg-green-500',
  busy: 'bg-purple-500',
  offline: 'bg-zinc-500',
}

const statusLabels: Record<string, string> = {
  online: '在线',
  busy: '忙碌中',
  offline: '离线',
}

const adapterLabels: Record<string, string> = {
  'claude-code': 'Claude Code',
  'openclaw': 'OpenClaw',
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className || ''}`} />
}

function AgentCard({ agent, isDefault, onSetDefault }: { agent: Agent; isDefault: boolean; onSetDefault: (id: string) => void }) {
  const router = useRouter()
  let config: Record<string, any> = {}
  try { config = agent.adapterConfig ? JSON.parse(agent.adapterConfig) : {} } catch {}

  const isBusy = agent.status === 'busy'
  const statusText = agent.status === 'busy'
    ? '忙碌中 · 正在执行任务'
    : agent.status === 'online'
      ? '在线 · 空闲'
      : '离线'

  return (
    <div className={`rounded-lg border border-l-2 ${statusColors[agent.status] || 'border-l-zinc-600'} bg-zinc-900/50 p-4 space-y-2.5 hover:border-zinc-700 transition-colors activity-row-enter overflow-hidden ${
      isDefault ? 'border-yellow-500/40' : 'border-zinc-800'
    } ${isBusy ? 'shadow-[0_0_12px_-3px_rgba(168,85,247,0.15)]' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 flex-shrink-0">
            {isBusy && <span className="animate-ping absolute h-full w-full rounded-full bg-purple-500 opacity-75" />}
            <span className={`relative rounded-full h-2 w-2 ${statusDotColors[agent.status] || 'bg-zinc-500'}`} />
          </span>
          <h3 className="font-medium text-zinc-100 text-sm">{agent.displayName || agent.name}</h3>
          {isDefault && (
            <span className="text-yellow-500 text-[10px] font-semibold flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-yellow-500" /> 默认
            </span>
          )}
        </div>
        <Badge variant={agent.status as 'online' | 'busy' | 'offline'}>{statusLabels[agent.status] || agent.status}</Badge>
      </div>

      <p className="text-xs text-zinc-400">{statusText}</p>

      {agent.description && (
        <p className="text-xs text-zinc-400 line-clamp-2">{agent.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={agent.adapterType as 'claude-code' | 'openclaw'}>{adapterLabels[agent.adapterType] || agent.adapterType}</Badge>
        {agent.version && (
          <span className="text-xs text-zinc-600">{agent.version}</span>
        )}
      </div>

      {/* OpenClaw specific info */}
      {agent.adapterType === 'openclaw' && config.openclawAgentId && (
        <div className="text-xs text-zinc-600 space-y-0.5">
          <div className="truncate">ID: <span className="font-mono text-zinc-500">{config.openclawAgentId}</span></div>
          {config.workspace && <div className="truncate">工作目录: <span className="font-mono text-zinc-500">{config.workspace}</span></div>}
        </div>
      )}

      {/* Claude Code specific info */}
      {agent.adapterType === 'claude-code' && config.binaryPath && (
        <div className="text-xs text-zinc-600 truncate">
          <span className="font-mono text-zinc-500 text-[11px]">{config.binaryPath}</span>
        </div>
      )}

      {agent.lastDetectedAt && (
        <p className="text-[11px] text-zinc-600">{timeAgo(agent.lastDetectedAt)} 前检测到</p>
      )}

      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={() => router.push(`/tasks?agent=${agent.id}`)}
          className="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
        >
          查看任务 →
        </button>
        {!isDefault && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetDefault(agent.id); }}
            className="text-xs text-zinc-500 hover:text-yellow-400 cursor-pointer"
          >
            设为默认
          </button>
        )}
      </div>
    </div>
  )
}

export default function AgentsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })

  const defaultAgentId = settings?.defaultAgentId || ''

  const detectMut = useMutation({
    mutationFn: detectAgents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  const setDefaultMut = useMutation({
    mutationFn: (agentId: string) => updateSettings({ defaultAgentId: agentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      addToast({ type: 'success', title: '默认智能体已更新' })
    },
  })

  // Auto-detect on mount
  useEffect(() => {
    detectMut.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sort: default first, then online, then offline
  const sorted = [...agents].sort((a, b) => {
    if (a.id === defaultAgentId) return -1
    if (b.id === defaultAgentId) return 1
    const statusOrder: Record<string, number> = { busy: 0, online: 1, offline: 2 }
    return (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2)
  })

  const onlineAgents = sorted.filter((a) => a.status === 'online' || a.status === 'busy')
  const offlineAgents = sorted.filter((a) => a.status === 'offline')

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 pl-12 lg:pl-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">智能体</h2>
        <Button size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          <RefreshCw className={`h-4 w-4 ${detectMut.isPending ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{detectMut.isPending ? '检测中...' : '重新检测'}</span>
        </Button>
      </div>

      {/* Skeleton loading while detecting */}
      {detectMut.isPending && agents.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      )}

      {agents.length === 0 && !detectMut.isPending ? (
        <div className="text-center py-16 text-zinc-500">
          <Bot className="h-10 w-10 mx-auto mb-3 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">未检测到智能体</p>
          <p className="text-xs mt-1">点击重新检测</p>
        </div>
      ) : agents.length > 0 && (
        <div className="space-y-6">
          {onlineAgents.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">在线 ({onlineAgents.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {onlineAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} isDefault={agent.id === defaultAgentId} onSetDefault={(id) => setDefaultMut.mutate(id)} />
                ))}
              </div>
            </div>
          )}
          {offlineAgents.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">离线 ({offlineAgents.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {offlineAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} isDefault={agent.id === defaultAgentId} onSetDefault={(id) => setDefaultMut.mutate(id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
