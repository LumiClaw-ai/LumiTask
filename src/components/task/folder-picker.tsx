'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FolderOpen, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { browseFolders, getSettings } from '@/lib/api'

interface FolderPickerProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  value: string
  onChange: (path: string) => void
}

export function FolderPicker({ open, onOpenChange, value, onChange }: FolderPickerProps) {
  const [currentDir, setCurrentDir] = useState(value || '')

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings, enabled: open })

  useEffect(() => {
    if (open) {
      setCurrentDir(value || settings?.['defaultWorkingDirectory'] || '')
    }
  }, [open, value, settings])

  const { data, isLoading } = useQuery({
    queryKey: ['folders', currentDir],
    queryFn: () => browseFolders(currentDir || undefined),
    enabled: open,
  })

  const handleNavigate = (path: string) => {
    setCurrentDir(path)
  }

  const handleConfirm = () => {
    onChange(data?.current || currentDir)
    onOpenChange(false)
  }

  // Build breadcrumb segments from current path
  const breadcrumbs = (data?.current || currentDir).split('/').filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Folder</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Breadcrumb navigation */}
          <div className="flex items-center gap-1 text-sm text-zinc-400 overflow-x-auto pb-1">
            <button
              onClick={() => handleNavigate('/')}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer flex-shrink-0"
            >
              /
            </button>
            {breadcrumbs.map((segment, i) => {
              const path = '/' + breadcrumbs.slice(0, i + 1).join('/')
              return (
                <span key={path} className="flex items-center gap-1 flex-shrink-0">
                  <ChevronRight className="h-3 w-3 text-zinc-600" />
                  <button
                    onClick={() => handleNavigate(path)}
                    className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    {segment}
                  </button>
                </span>
              )
            })}
          </div>

          {/* Directory listing */}
          <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-800">
            {isLoading ? (
              <p className="p-3 text-sm text-zinc-500">Loading...</p>
            ) : data?.directories.length === 0 ? (
              <p className="p-3 text-sm text-zinc-500">No subdirectories</p>
            ) : (
              data?.directories.map((dir) => (
                <button
                  key={dir.path}
                  onClick={() => handleNavigate(dir.path)}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                >
                  <FolderOpen className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                  <span className="truncate">{dir.name}</span>
                </button>
              ))
            )}
          </div>

          {/* Bottom bar with full path */}
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2">
            <p className="text-xs text-zinc-500 truncate">{data?.current || currentDir || '/'}</p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={handleConfirm}>选择此目录</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
