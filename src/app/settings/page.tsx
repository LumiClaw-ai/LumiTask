'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSettings, updateSettings, fetchAgents } from '@/lib/api'
import { FolderPicker } from '@/components/task/folder-picker'
import { useToast } from '@/components/ui/toast'

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [defaultWorkingDir, setDefaultWorkingDir] = useState('')
  const [defaultAgentId, setDefaultAgentId] = useState('')
  const [toastNotifications, setToastNotifications] = useState(true)
  const [browserNotifications, setBrowserNotifications] = useState(true)
  const [inboxReminderEnabled, setInboxReminderEnabled] = useState(true)
  const [inboxReminderDays, setInboxReminderDays] = useState('3')
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })

  useEffect(() => {
    if (settings) {
      setDefaultWorkingDir(settings['defaultWorkingDirectory'] || '')
      setDefaultAgentId(settings['defaultAgentId'] || '')
      setToastNotifications(settings['toastNotifications'] !== 'false')
      setBrowserNotifications(settings['browserNotifications'] !== 'false')
      setInboxReminderEnabled(settings['inboxReminderEnabled'] !== 'false')
      setInboxReminderDays(settings['inboxReminderDays'] || '3')
    }
  }, [settings])

  const mutation = useMutation({
    mutationFn: () =>
      updateSettings({
        defaultWorkingDirectory: defaultWorkingDir,
        defaultAgentId: defaultAgentId,
        toastNotifications: String(toastNotifications),
        browserNotifications: String(browserNotifications),
        inboxReminderEnabled: String(inboxReminderEnabled),
        inboxReminderDays: inboxReminderDays,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      addToast({ type: 'success', title: 'Settings saved' })
    },
    onError: (err: Error) => {
      addToast({ type: 'error', title: 'Failed to save settings', message: err.message })
    },
  })

  const labelClass = 'block text-sm font-medium text-zinc-300 mb-1'
  const selectClass = 'w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <>
      <div className="px-6 py-6 space-y-6 max-w-2xl pl-12 lg:pl-6">
        <h2 className="text-lg font-semibold">Settings</h2>

        <div className="space-y-5">
          {/* Default Agent */}
          <div>
            <label className={labelClass}>Default Agent</label>
            <p className="text-xs text-zinc-500 mb-2">创建任务时未指定 agent，自动使用此 agent</p>
            <select
              className={selectClass}
              value={defaultAgentId}
              onChange={(e) => setDefaultAgentId(e.target.value)}
            >
              <option value="">Auto (first online agent)</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName || a.name} ({a.adapterType}) {a.status === 'online' ? '● online' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Default Working Directory */}
          <div>
            <label className={labelClass}>Default Working Directory</label>
            <p className="text-xs text-zinc-500 mb-2">创建任务时未指定目录，默认使用此目录</p>
            <div
              onClick={() => setFolderPickerOpen(true)}
              className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2.5 cursor-pointer hover:border-zinc-600 transition-colors"
            >
              <FolderOpen className="h-4 w-4 text-zinc-400" />
              {defaultWorkingDir ? (
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-zinc-100 truncate block">{defaultWorkingDir}</span>
                </div>
              ) : (
                <span className="text-sm text-zinc-500">Click to select</span>
              )}
              {defaultWorkingDir && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setDefaultWorkingDir('') }}
                  className="text-zinc-500 hover:text-zinc-300 cursor-pointer">✕</button>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Notifications</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={toastNotifications}
                onChange={(e) => setToastNotifications(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm text-zinc-400">In-app toast notifications</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={browserNotifications}
                onChange={(e) => setBrowserNotifications(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm text-zinc-400">Browser notifications</span>
            </label>
          </div>

          {/* Inbox Reminder */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">收集箱提醒</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={inboxReminderEnabled}
                onChange={(e) => setInboxReminderEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm text-zinc-400">开启提醒</span>
            </label>
            {inboxReminderEnabled && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400">频率: 每</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={inboxReminderDays}
                  onChange={(e) => setInboxReminderDays(e.target.value)}
                  className="w-16 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-zinc-400">天</span>
              </div>
            )}
          </div>

          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>

      <FolderPicker
        open={folderPickerOpen}
        onOpenChange={setFolderPickerOpen}
        value={defaultWorkingDir}
        onChange={setDefaultWorkingDir}
      />
    </>
  )
}
