'use client'
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [{ ...toast, id }, ...prev])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const typeStyles = {
    success: 'border-l-green-500',
    error: 'border-l-red-500',
    warning: 'border-l-yellow-500',
    info: 'border-l-blue-500',
  }
  const typeIcons = {
    success: '\u2705', error: '\u274C', warning: '\u26A0\uFE0F', info: '\u2139\uFE0F',
  }

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`rounded-lg border border-zinc-800 border-l-4 ${typeStyles[toast.type]} bg-zinc-900 p-3 shadow-lg animate-in slide-in-from-right duration-200`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-sm flex-shrink-0">{typeIcons[toast.type]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{toast.title}</p>
                  {toast.message && <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{toast.message}</p>}
                </div>
              </div>
              <button onClick={() => removeToast(toast.id)} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0 cursor-pointer">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
