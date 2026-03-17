'use client'

import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addComment, replyToTask } from '@/lib/api'
import type { ActivityLogEntry } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface CommentsListProps {
  taskId: string
  comments: ActivityLogEntry[]
  status: string
}

export function CommentsList({ taskId, comments, status }: CommentsListProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const queryClient = useQueryClient()

  const isBlocked = status === 'blocked'
  const isRunning = status === 'running'
  const isDoneOrFailed = status === 'done' || status === 'failed'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [comments.length])

  useEffect(() => {
    if (isBlocked) inputRef.current?.focus()
  }, [isBlocked])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['task', taskId] })
    queryClient.invalidateQueries({ queryKey: ['tasks'] })
  }

  const commentMutation = useMutation({
    mutationFn: () => addComment(taskId, input),
    onSuccess: () => { setInput(''); invalidate() },
  })

  const replyMutation = useMutation({
    mutationFn: () => replyToTask(taskId, input),
    onSuccess: () => { setInput(''); invalidate() },
  })

  const handleComment = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim()) return
    commentMutation.mutate()
  }

  const handleReplyAndContinue = () => {
    if (!input.trim()) return
    replyMutation.mutate()
  }

  const isPending = commentMutation.isPending || replyMutation.isPending

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {comments.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-8">No comments yet.</p>
        )}
        {comments.map((c) => {
          if (c.action === 'task.blocked') {
            return (
              <div key={c.id} className="flex justify-center">
                <div className="text-xs text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-3 py-1">
                  ⚠️ {c.message || c.details || 'Task blocked'}
                </div>
              </div>
            )
          }

          const isAgent = c.actorType === 'agent'
          const isUser = c.actorType === 'user'

          if (isUser) {
            return (
              <div key={c.id} className="flex justify-end">
                <div className="max-w-[80%] flex items-end gap-2">
                  <div className="rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2">
                    <p className="text-sm text-white whitespace-pre-wrap break-words">{c.message || c.details}</p>
                    <p className="text-[10px] text-blue-200 mt-1">{formatTime(c.createdAt)}</p>
                  </div>
                  <span className="text-sm flex-shrink-0">👤</span>
                </div>
              </div>
            )
          }

          if (isAgent) {
            return (
              <div key={c.id} className="flex justify-start">
                <div className="max-w-[80%] flex items-end gap-2">
                  <span className="text-sm flex-shrink-0">🤖</span>
                  <div className="rounded-2xl rounded-bl-sm bg-zinc-800 px-3 py-2">
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words">{c.message || c.details}</p>
                    <p className="text-[10px] text-zinc-500 mt-1">{formatTime(c.createdAt)}</p>
                  </div>
                </div>
              </div>
            )
          }

          // system
          return (
            <div key={c.id} className="flex justify-center">
              <div className="text-xs text-zinc-500 bg-zinc-800/50 rounded-full px-3 py-1">
                {c.message || c.details || c.action}
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleComment() }} className="flex-shrink-0 border-t border-zinc-800 px-4 py-3 space-y-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isRunning}
          placeholder={isRunning ? 'Agent 执行中...' : isBlocked ? 'Reply to unblock agent...' : 'Add a comment...'}
          rows={2}
          className={`w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 transition-colors resize-none ${
            isBlocked ? 'border-yellow-500 focus:ring-yellow-500' : 'border-zinc-700 focus:ring-blue-500'
          } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
        <div className="flex gap-2 justify-end">
          {/* Plain comment button (except when running) */}
          {!isRunning && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleComment()}
              disabled={!input.trim() || isPending}
            >
              评论
            </Button>
          )}

          {/* Continue button for done/failed/blocked */}
          {(isDoneOrFailed || isBlocked) && (
            <Button
              type="button"
              size="sm"
              onClick={handleReplyAndContinue}
              disabled={!input.trim() || isPending}
            >
              {isBlocked ? '回复并继续 ▶' : '评论并继续 ▶'}
            </Button>
          )}

          {/* Running state indicator */}
          {isRunning && (
            <span className="text-xs text-purple-400 flex items-center gap-1">
              <span className="animate-pulse">●</span> Agent 执行中...
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
}
