'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { replyToTask } from '@/lib/api'

interface DecisionOption {
  id: string
  label: string
  description?: string
}

interface DecisionRequest {
  type: 'confirm' | 'choose' | 'input' | 'approve'
  question: string
  options?: DecisionOption[]
  defaultOption?: string
  context?: Record<string, unknown>
}

interface DecisionCardProps {
  taskId: string
  blockReason: string
}

function tryParseDecision(blockReason: string): DecisionRequest | null {
  try {
    const parsed = JSON.parse(blockReason)
    if (parsed && parsed.type && parsed.question) return parsed
  } catch {}
  return null
}

export function DecisionCard({ taskId, blockReason }: DecisionCardProps) {
  const decision = tryParseDecision(blockReason)
  const [inputValue, setInputValue] = useState('')
  const queryClient = useQueryClient()

  const replyMut = useMutation({
    mutationFn: (body: string) => replyToTask(taskId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  if (!decision) {
    // Plain text block reason — show as before
    return (
      <div className="mx-5 mb-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
        <h3 className="text-xs font-medium text-red-400 mb-1">已阻塞</h3>
        <p className="text-sm text-zinc-400">{blockReason}</p>
      </div>
    )
  }

  return (
    <div className="mx-5 mb-3 rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 space-y-3">
      <h3 className="text-sm font-medium text-amber-300">{decision.question}</h3>

      {/* Context info */}
      {decision.context && Object.keys(decision.context).length > 0 && (
        <div className="text-xs text-zinc-500 bg-zinc-900/50 rounded p-2">
          {Object.entries(decision.context).map(([k, v]) => (
            <div key={k}><span className="text-zinc-400">{k}:</span> {String(v)}</div>
          ))}
        </div>
      )}

      {/* Confirm type */}
      {decision.type === 'confirm' && (
        <div className="flex gap-2">
          <button
            onClick={() => replyMut.mutate('confirmed: yes')}
            disabled={replyMut.isPending}
            className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            确认
          </button>
          <button
            onClick={() => replyMut.mutate('confirmed: no')}
            disabled={replyMut.isPending}
            className="px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            拒绝
          </button>
        </div>
      )}

      {/* Approve type */}
      {decision.type === 'approve' && (
        <div className="flex gap-2">
          <button
            onClick={() => replyMut.mutate('approved')}
            disabled={replyMut.isPending}
            className="px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            批准
          </button>
          <button
            onClick={() => replyMut.mutate('rejected')}
            disabled={replyMut.isPending}
            className="px-3 py-1.5 rounded-md bg-red-700 hover:bg-red-600 text-white text-sm transition-colors cursor-pointer disabled:opacity-50"
          >
            驳回
          </button>
        </div>
      )}

      {/* Choose type */}
      {decision.type === 'choose' && decision.options && (
        <div className="space-y-2">
          {decision.options.map(opt => (
            <button
              key={opt.id}
              onClick={() => replyMut.mutate(`选择: ${opt.id} - ${opt.label}`)}
              disabled={replyMut.isPending}
              className="w-full text-left px-3 py-2 rounded-md border border-zinc-700 hover:border-amber-600 hover:bg-amber-950/30 transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="text-sm font-medium text-zinc-200">{opt.label}</span>
              {opt.description && (
                <span className="block text-xs text-zinc-500 mt-0.5">{opt.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Input type */}
      {decision.type === 'input' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="输入你的回复..."
            className="flex-1 px-3 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-600"
            onKeyDown={e => {
              if (e.key === 'Enter' && inputValue.trim()) {
                replyMut.mutate(inputValue.trim())
              }
            }}
          />
          <button
            onClick={() => inputValue.trim() && replyMut.mutate(inputValue.trim())}
            disabled={replyMut.isPending || !inputValue.trim()}
            className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            发送
          </button>
        </div>
      )}

      {replyMut.isPending && (
        <p className="text-xs text-zinc-500">发送中...</p>
      )}
    </div>
  )
}
