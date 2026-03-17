'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/toast'
import { useSSE } from '@/hooks/use-sse'

function SSEProvider({ children }: { children: ReactNode }) {
  useSSE()
  return <>{children}</>
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            refetchOnWindowFocus: true,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SSEProvider>
          {children}
        </SSEProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
