'use client'
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/toast'

export function useSSE(onTaskEvent?: (data: any) => void) {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const onTaskEventRef = useRef(onTaskEvent)
  onTaskEventRef.current = onTaskEvent

  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let closed = false

    const connect = () => {
      if (closed) return
      es = new EventSource('/api/events')

      es.onopen = () => { reconnectAttempt = 0 }

      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          const { event, taskId } = data

          // Precise invalidation
          queryClient.invalidateQueries({ queryKey: ['tasks'] })
          if (taskId) {
            queryClient.invalidateQueries({ queryKey: ['task', taskId] })
          }

          // Forward to callback
          onTaskEventRef.current?.(data)

          // Toast notifications
          if (event === 'task.completed') {
            addToast({ type: 'success', title: `Task #${data.number} completed`, message: data.summary })
            sendBrowserNotification('Task Completed', data.summary || `Task #${data.number}`)
          } else if (event === 'task.failed') {
            addToast({ type: 'error', title: `Task #${data.number} failed`, message: data.error })
          } else if (event === 'task.blocked') {
            addToast({ type: 'warning', title: `Task #${data.number} needs input`, message: data.blockReason })
            sendBrowserNotification('Task needs input', `Task #${data.number}`)
          }
        } catch {}
      }

      es.onerror = () => {
        es?.close()
        if (!closed) scheduleReconnect()
      }
    }

    const scheduleReconnect = () => {
      reconnectAttempt++
      const delay = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempt - 1, 4))
      reconnectTimer = setTimeout(connect, delay)
    }

    // Request notification permission
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    connect()

    return () => {
      closed = true
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [queryClient, addToast])
}

function sendBrowserNotification(title: string, body?: string) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: body || '', icon: '/favicon.ico' })
  }
}
