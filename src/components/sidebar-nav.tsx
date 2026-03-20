'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Menu, X } from 'lucide-react'
import { fetchInbox } from '@/lib/api'

const navItems = [
  { href: '/', label: '概览', icon: '📊' },
  { href: '/tasks', label: '任务', icon: '📋' },
  { href: '/inbox', label: '收集箱', icon: '📥', showCount: true },
  { href: '/cron', label: '定时任务', icon: '🔄' },
  { href: '/agents', label: '智能体', icon: '🤖' },
  { href: '/settings', label: '设置', icon: '⚙️' },
]

function InboxBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 animate-pulse">
      {count}
    </span>
  )
}

export function SidebarNav() {
  const pathname = usePathname()
  const { data: inboxItems } = useQuery({
    queryKey: ['inbox'],
    queryFn: fetchInbox,
    refetchInterval: 30000,
  })
  const inboxCount = inboxItems?.length || 0

  return (
    <nav className="flex-1 px-3 space-y-1">
      {navItems.map((item) => {
        const isActive = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
            {item.showCount && <InboxBadge count={inboxCount} />}
          </Link>
        )
      })}
    </nav>
  )
}

/** Mobile hamburger + slide-out sidebar */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { data: inboxItems } = useQuery({
    queryKey: ['inbox'],
    queryFn: fetchInbox,
    refetchInterval: 30000,
  })
  const inboxCount = inboxItems?.length || 0

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3.5 left-3 z-50 p-1.5 rounded-md bg-zinc-800/80 text-zinc-400 hover:text-zinc-100 cursor-pointer"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col">
            <div className="flex items-center justify-between px-5 py-5">
              <h1 className="text-lg font-bold tracking-tight text-zinc-100">LumiTask</h1>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-100 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                    {item.showCount && <InboxBadge count={inboxCount} />}
                  </Link>
                )
              })}
            </nav>
          </aside>
        </>
      )}
    </>
  )
}
