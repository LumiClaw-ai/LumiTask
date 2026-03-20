'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Bell, CheckCircle, Link2, Wifi } from 'lucide-react'
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

  // Connection mode state
  const [connectionMode, setConnectionMode] = useState<'local' | 'remote'>('local')
  const [connectionCode, setConnectionCode] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [manualToken, setManualToken] = useState('')
  const [connectionResult, setConnectionResult] = useState<{ success: boolean; error?: string; agents?: any[] } | null>(null)
  const [connectionTesting, setConnectionTesting] = useState(false)

  // Notification channel state
  const [notifyEnabled, setNotifyEnabled] = useState(false)
  const [notifyAgentChannel, setNotifyAgentChannel] = useState('') // "agentId:channel:accountId"
  const [notifyEvents, setNotifyEvents] = useState<string[]>(['task.failed', 'task.blocked'])
  const [notifyTestResult, setNotifyTestResult] = useState<string | null>(null)

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings })
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents })
  const { data: channelData } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/channels')
      return res.json()
    },
  })

  useEffect(() => {
    if (settings) {
      setDefaultWorkingDir(settings['defaultWorkingDirectory'] || '')
      setDefaultAgentId(settings['defaultAgentId'] || '')
      setToastNotifications(settings['toastNotifications'] !== 'false')
      setBrowserNotifications(settings['browserNotifications'] !== 'false')
      setInboxReminderEnabled(settings['inboxReminderEnabled'] !== 'false')
      setInboxReminderDays(settings['inboxReminderDays'] || '3')
      if (settings['openclaw_connection_mode']) {
        setConnectionMode(settings['openclaw_connection_mode'] as 'local' | 'remote')
      }
      if (settings['openclaw_gateway_url']) setManualUrl(settings['openclaw_gateway_url'])
    }
  }, [settings])

  // Load notification config from API response
  useEffect(() => {
    if (channelData?.config) {
      const c = channelData.config
      setNotifyEnabled(c.enabled || false)
      setNotifyAgentChannel(`${c.agentId}:${c.channel}:${c.accountId}`)
      setNotifyEvents(c.events || ['task.failed', 'task.blocked'])
    }
  }, [channelData])

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
      <div className="px-6 py-6 space-y-6 max-w-2xl pl-12 lg:pl-6 overflow-y-auto h-full">
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

          {/* Agent Connection Mode */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
              <Link2 className="h-4 w-4" /> Agent 连接模式
            </h3>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="connMode" checked={connectionMode === 'local'} onChange={() => setConnectionMode('local')} className="accent-blue-500" />
                <span className="text-sm text-zinc-400">本地模式</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="connMode" checked={connectionMode === 'remote'} onChange={() => setConnectionMode('remote')} className="accent-blue-500" />
                <span className="text-sm text-zinc-400">远程模式</span>
              </label>
            </div>

            {connectionMode === 'remote' && (
              <div className="space-y-3 pl-1">
                <div>
                  <label className={labelClass}>粘贴连接码</label>
                  <p className="text-xs text-zinc-600 mb-1">
                    在远程服务器运行 <code className="bg-zinc-800 px-1 rounded text-zinc-400">openclaw qr --setup-code-only</code> 获取
                  </p>
                  <textarea
                    value={connectionCode}
                    onChange={e => setConnectionCode(e.target.value)}
                    placeholder="eyJ1cmwiOiJ3czovLy4uLiIs..."
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-16 font-mono"
                  />
                </div>

                <details className="text-xs text-zinc-600">
                  <summary className="cursor-pointer hover:text-zinc-400">或手动填写 URL + Token</summary>
                  <div className="mt-2 space-y-2">
                    <input
                      value={manualUrl}
                      onChange={e => setManualUrl(e.target.value)}
                      placeholder="ws://192.168.1.100:18789"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      placeholder="Token"
                      type="password"
                      className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </details>
              </div>
            )}

            <button
              type="button"
              disabled={connectionTesting}
              onClick={async () => {
                setConnectionTesting(true)
                setConnectionResult(null)
                try {
                  const res = await fetch('/api/settings/connection/test', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      mode: connectionMode,
                      connectionCode: connectionCode || undefined,
                      gatewayUrl: manualUrl || undefined,
                      gatewayToken: manualToken || undefined,
                    }),
                  })
                  const data = await res.json()
                  setConnectionResult(data)
                  if (data.success) {
                    queryClient.invalidateQueries({ queryKey: ['agents'] })
                    queryClient.invalidateQueries({ queryKey: ['settings'] })
                  }
                } catch (e: any) {
                  setConnectionResult({ success: false, error: e.message })
                } finally {
                  setConnectionTesting(false)
                }
              }}
              className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 cursor-pointer disabled:opacity-50"
            >
              <Wifi className="h-3.5 w-3.5" />
              {connectionTesting ? '测试中...' : '测试连接'}
            </button>

            {connectionResult && (
              <div className={`text-xs rounded p-2 ${connectionResult.success ? 'bg-green-950/30 text-green-400' : 'bg-red-950/30 text-red-400'}`}>
                {connectionResult.success
                  ? `已连接，发现 ${connectionResult.agents?.length || 0} 个 Agent`
                  : connectionResult.error || '连接失败'
                }
              </div>
            )}
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

          {/* Agent Channel Notifications */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
              <Bell className="h-4 w-4" /> Agent 频道通知
            </h3>
            <p className="text-xs text-zinc-500">通过 Agent 已接入的消息频道（飞书、Discord 等）接收任务通知</p>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyEnabled}
                onChange={(e) => setNotifyEnabled(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-sm text-zinc-400">启用频道通知</span>
            </label>

            {notifyEnabled && (
              <>
                <div>
                  <label className={labelClass}>选择通知频道</label>
                  <select
                    className={selectClass}
                    value={notifyAgentChannel}
                    onChange={(e) => setNotifyAgentChannel(e.target.value)}
                  >
                    <option value="">-- 选择 Agent 频道 --</option>
                    {(channelData?.channels || []).map((ch: any) => (
                      <option key={`${ch.agentId}:${ch.channel}:${ch.accountId}`} value={`${ch.agentId}:${ch.channel}:${ch.accountId}`}>
                        {ch.agentName} → {ch.channel} ({ch.accountId})
                      </option>
                    ))}
                  </select>
                  {(channelData?.channels || []).length === 0 && (
                    <p className="text-xs text-zinc-600 mt-1">未发现可用频道。请确保 OpenClaw 已配置消息频道。</p>
                  )}
                </div>

                <div>
                  <label className={labelClass}>通知事件</label>
                  <div className="space-y-1.5">
                    {[
                      { id: 'task.completed', label: '任务完成' },
                      { id: 'task.failed', label: '任务失败' },
                      { id: 'task.blocked', label: '任务阻塞（需决策）' },
                      { id: 'task.dependencies_met', label: '依赖就绪' },
                    ].map(evt => (
                      <label key={evt.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifyEvents.includes(evt.id)}
                          onChange={(e) => {
                            if (e.target.checked) setNotifyEvents([...notifyEvents, evt.id])
                            else setNotifyEvents(notifyEvents.filter(e => e !== evt.id))
                          }}
                          className="accent-blue-500"
                        />
                        <span className="text-sm text-zinc-400">{evt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {notifyAgentChannel && (
                  <button
                    type="button"
                    onClick={async () => {
                      setNotifyTestResult(null)
                      const [agentId, channel, accountId] = notifyAgentChannel.split(':')
                      const res = await fetch('/api/notifications/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          config: { enabled: true, agentId, channel, accountId, events: notifyEvents },
                        }),
                      })
                      const data = await res.json()
                      setNotifyTestResult(data.success ? 'success' : 'failed')
                    }}
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 cursor-pointer"
                  >
                    测试发送
                    {notifyTestResult === 'success' && <CheckCircle className="h-3.5 w-3.5 text-green-400" />}
                    {notifyTestResult === 'failed' && <span className="text-red-400 text-xs">失败</span>}
                  </button>
                )}
              </>
            )}
          </div>

          <Button onClick={() => {
            // Save notification config along with other settings
            if (notifyEnabled && notifyAgentChannel) {
              const [agentId, channel, accountId] = notifyAgentChannel.split(':')
              fetch('/api/notifications/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  config: { enabled: true, agentId, channel, accountId, events: notifyEvents },
                }),
              }).catch(() => {})
            } else if (!notifyEnabled) {
              fetch('/api/notifications/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  config: { enabled: false, agentId: '', channel: '', accountId: '', events: [] },
                }),
              }).catch(() => {})
            }
            mutation.mutate()
          }} disabled={mutation.isPending}>
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
