import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Providers } from './providers'
import { SidebarNav, MobileNav } from '@/components/sidebar-nav'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'LumiTask',
  description: 'AI Agent Task Management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}>
        <Providers>
          <div className="h-screen flex overflow-hidden">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex w-56 flex-shrink-0 border-r border-zinc-800 bg-zinc-900 flex-col draggable-region">
              <div className="px-5 pt-10 pb-4">
                <h1 className="text-lg font-bold tracking-tight text-zinc-100">LumiTask</h1>
              </div>
              <SidebarNav />
            </aside>

            {/* Mobile nav */}
            <MobileNav />

            {/* Main content — takes remaining space, children manage own scroll */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="h-10 flex-shrink-0 draggable-region" />
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
