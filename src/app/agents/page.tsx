'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { fetchAgents, detectAgents, type Agent } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/utils'

const statusColors: Record<string, string> = {
  online: 'bg-green-500',
  busy: 'bg-yellow-500',
  offline: 'bg-zinc-500',
}

function AgentCard({ agent }: { agent: Agent }) {
  // Parse adapterConfig for extra details
  let config: Record<string, any> = {}
  try { config = agent.adapterConfig ? JSON.parse(agent.adapterConfig) : {} } catch {}

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColors[agent.status] || 'bg-zinc-500'}`} />
          <h3 className="font-medium text-zinc-100">{agent.displayName || agent.name}</h3>
        </div>
        <Badge variant={agent.status as 'online' | 'busy' | 'offline'}>{agent.status}</Badge>
      </div>

      {agent.description && (
        <p className="text-sm text-zinc-400">{agent.description}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={agent.adapterType as 'claude-code' | 'openclaw'}>{agent.adapterType}</Badge>
        {agent.version && (
          <span className="text-xs text-zinc-500">{agent.version}</span>
        )}
      </div>

      {/* OpenClaw specific info */}
      {agent.adapterType === 'openclaw' && config.openclawAgentId && (
        <div className="text-xs text-zinc-500 space-y-1">
          <div>Agent ID: <span className="font-mono text-zinc-400">{config.openclawAgentId}</span></div>
          {config.workspace && <div>Workspace: <span className="font-mono text-zinc-400">{config.workspace}</span></div>}
          {config.isDefault && <span className="text-yellow-500/80">★ Default agent</span>}
        </div>
      )}

      {/* Claude Code specific info */}
      {agent.adapterType === 'claude-code' && config.binaryPath && (
        <div className="text-xs text-zinc-500">
          Binary: <span className="font-mono text-zinc-400">{config.binaryPath}</span>
        </div>
      )}

      {agent.lastDetectedAt && (
        <p className="text-xs text-zinc-600">Detected {timeAgo(agent.lastDetectedAt)}</p>
      )}
    </div>
  )
}

export default function AgentsPage() {
  const queryClient = useQueryClient()

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })

  const detectMut = useMutation({
    mutationFn: detectAgents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  // Auto-detect on mount
  useEffect(() => {
    detectMut.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agents</h2>
        <Button size="sm" onClick={() => detectMut.mutate()} disabled={detectMut.isPending}>
          <RefreshCw className={`h-4 w-4 ${detectMut.isPending ? 'animate-spin' : ''}`} />
          {detectMut.isPending ? 'Detecting...' : 'Re-detect'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
        {agents.length === 0 && (
          <p className="text-sm text-zinc-500 col-span-full text-center py-12">No agents detected. Click &quot;Re-detect&quot; to scan your environment.</p>
        )}
      </div>
    </div>
  )
}
