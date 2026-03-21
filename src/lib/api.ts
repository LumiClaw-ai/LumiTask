const API_BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

// Types
export interface Task {
  id: string
  number: number
  title: string
  description?: string | null
  status: 'inbox' | 'open' | 'assigned' | 'running' | 'blocked' | 'done' | 'failed' | 'cancelled'
  assigneeAgentId?: string | null
  workingDirectory?: string | null
  scheduleType?: 'manual' | 'immediate' | 'scheduled' | 'recurring' | null
  scheduleCron?: string | null
  scheduleAt?: number | null
  scheduleNextAt?: number | null
  scheduleLastAt?: number | null
  // Dependencies & structure
  dependsOn?: string | null
  parentTaskId?: string | null
  // Structured I/O
  inputContext?: string | null
  outputResult?: string | null
  // Concurrency & retry
  concurrencyKey?: string | null
  retryCount?: number
  maxRetries?: number
  // Results
  summary?: string | null
  result?: string | null
  blockReason?: string | null
  failReason?: string | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCostCents: number
  dueAt?: number | null
  startedAt?: number | null
  completedAt?: number | null
  createdAt: number
  updatedAt: number
  source?: string | null
  sortOrder?: number
  agentName?: string | null
  commentCount?: number
  logCount?: number
  agent?: Agent | null
  activityLog?: ActivityLogEntry[]
  artifacts?: Artifact[]
  // Resolved relations (from GET /api/tasks/:id)
  dependencies?: { id: string; number: number; title: string; status: string }[]
  subtasks?: { id: string; number: number; title: string; status: string; assigneeAgentId?: string | null }[]
}

export interface Agent {
  id: string
  name: string
  displayName?: string | null
  description?: string | null
  adapterType: string
  adapterConfig?: string | null
  status: 'online' | 'busy' | 'offline'
  version?: string | null
  lastDetectedAt?: number | null
  createdAt: number
}

export interface ActivityLogEntry {
  id: string
  taskId: string
  action: string
  actorType: 'user' | 'agent' | 'system'
  actorId?: string | null
  message?: string | null
  details?: string | null
  toolName?: string | null
  toolInput?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  model?: string | null
  provider?: string | null
  createdAt: number
}

export interface Artifact {
  id: string
  taskId: string
  type: 'file' | 'url' | 'text' | 'json' | 'image'
  name?: string | null
  content?: string | null
  mimeType?: string | null
  createdAt: number
}

// Tasks
export async function fetchTasks(params?: {
  status?: string; agent?: string; unassigned?: boolean;
  dateFrom?: number; dateTo?: number
}): Promise<Task[]> {
  const sp = new URLSearchParams()
  if (params?.status) sp.set('status', params.status)
  if (params?.agent) sp.set('agent', params.agent)
  if (params?.unassigned) sp.set('unassigned', 'true')
  if (params?.dateFrom) sp.set('dateFrom', String(params.dateFrom))
  if (params?.dateTo) sp.set('dateTo', String(params.dateTo))
  const qs = sp.toString()
  return request<Task[]>(`/tasks${qs ? `?${qs}` : ''}`)
}

export async function fetchTask(id: string) {
  return request<Task>(`/tasks/${id}`)
}

export async function createTask(data: {
  title: string
  description?: string
  assigneeAgentId?: string
  workingDirectory?: string
  scheduleType?: string
  scheduleCron?: string
  scheduleAt?: number
}) {
  return request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTask(id: string, data: Partial<Task>) {
  return request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function assignTask(id: string, agentId: string) {
  return request<Task>(`/tasks/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  })
}

export async function startTask(id: string) {
  return request<Task>(`/tasks/${id}/start`, { method: 'POST' })
}

export async function executeTask(id: string): Promise<void> {
  await request<void>(`/tasks/${id}/execute`, { method: 'POST' })
}

export async function cancelTask(id: string): Promise<void> {
  await request<void>(`/tasks/${id}/cancel`, { method: 'POST' })
}

export async function pauseTask(id: string, reason?: string): Promise<void> {
  await request<void>(`/tasks/${id}/pause`, { method: 'POST', body: JSON.stringify({ reason }) })
}

export async function resumeTask(id: string): Promise<void> {
  await request<void>(`/tasks/${id}/resume`, { method: 'POST' })
}

export async function advanceTask(id: string, summary?: string): Promise<void> {
  await request<void>(`/tasks/${id}/advance`, { method: 'POST', body: JSON.stringify({ summary }) })
}

export async function completeTask(id: string, summary: string, result?: string) {
  return request<Task>(`/tasks/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ summary, result }),
  })
}

export async function blockTask(id: string, reason: string) {
  return request<Task>(`/tasks/${id}/block`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function failTask(id: string, reason: string) {
  return request<Task>(`/tasks/${id}/fail`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function reopenTask(id: string) {
  return request<Task>(`/tasks/${id}/reopen`, { method: 'POST' })
}

export async function deleteTask(id: string) {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' })
}

export async function logTask(id: string, message: string) {
  return request<ActivityLogEntry>(`/tasks/${id}/log`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

// Comments & Reply
export async function fetchComments(taskId: string): Promise<ActivityLogEntry[]> {
  return request<ActivityLogEntry[]>(`/tasks/${taskId}/comments`)
}

export async function addComment(taskId: string, body: string): Promise<ActivityLogEntry> {
  return request<ActivityLogEntry>(`/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, authorType: 'user' }),
  })
}

export async function replyToTask(taskId: string, body: string): Promise<{ fallback?: boolean }> {
  return request(`/tasks/${taskId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
}

// Agents
export async function fetchAgents() {
  return request<Agent[]>('/agents')
}

export async function detectAgents(): Promise<Agent[]> {
  return request<Agent[]>('/agents/detect')
}

// Folders
export async function browseFolders(dir?: string): Promise<{ current: string; parent: string; directories: { name: string; path: string }[] }> {
  const sp = new URLSearchParams()
  if (dir) sp.set('dir', dir)
  const qs = sp.toString()
  return request(`/files/browse${qs ? `?${qs}` : ''}`)
}

// Session Observer types
export interface SessionMessage {
  id: string
  timestamp: string
  role: string
  text?: string
  thinking?: string
  toolCalls?: { name: string; input: string }[]
  toolResult?: { name: string; content: string }
}

export interface ActiveSession {
  key: string
  sessionId: string
  agentId: string
  agentName?: string
  state: 'active' | 'idle'
  updatedAt: number
  latestMessages: SessionMessage[]
  lastUserMessage?: string
}

export interface AgentLiveStatus {
  agentId: string
  state: 'idle' | 'busy'
  currentSession?: string
  lastActivity: number
}

// Dashboard
export interface DashboardData {
  stats: { total: number; running: number; blocked: number; inbox: number; done: number }
  recentTasks: Task[]
  usage: { totalTokens: number; totalCost: number }
  activeSessions?: ActiveSession[]
  agentStatuses?: AgentLiveStatus[]
}

export async function fetchDashboard(): Promise<DashboardData> {
  return request<DashboardData>('/dashboard')
}

// Sessions
export async function fetchActiveSessions(): Promise<{ activeSessions: ActiveSession[]; agentStatuses: AgentLiveStatus[] }> {
  return request('/openclaw/sessions')
}

export async function fetchSessionTail(sessionId: string, agentId: string, lines?: number): Promise<SessionMessage[]> {
  const params = new URLSearchParams({ agentId })
  if (lines) params.set('lines', String(lines))
  return request(`/openclaw/sessions/${sessionId}/tail?${params}`)
}

// Inbox
export async function fetchInbox(): Promise<Task[]> {
  return request<Task[]>('/inbox')
}

export async function createInboxItem(data: { title: string; description?: string; assigneeAgentId?: string }): Promise<Task> {
  return request<Task>('/inbox', { method: 'POST', body: JSON.stringify(data) })
}

export async function promoteInbox(id: string, data?: { scheduleType?: string; workingDirectory?: string }): Promise<Task> {
  return request<Task>(`/inbox/${id}/promote`, { method: 'POST', body: JSON.stringify(data ?? {}) })
}

export async function deleteInboxItem(id: string): Promise<void> {
  await request<void>(`/inbox/${id}`, { method: 'DELETE' })
}

// Cron
export interface CronJob {
  id: string
  name?: string
  description?: string
  cron?: string
  every?: string
  agent?: string
  message?: string
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
}

export async function fetchCronJobs(): Promise<CronJob[]> {
  return request<CronJob[]>('/cron')
}

export async function createCronJob(data: { cron: string; message: string; agent?: string; description?: string }): Promise<any> {
  return request('/cron', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateCronJob(id: string, data: any): Promise<any> {
  return request(`/cron/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteCronJob(id: string): Promise<void> {
  await request<void>(`/cron/${id}`, { method: 'DELETE' })
}

export async function runCronJob(id: string): Promise<void> {
  await request<void>(`/cron/${id}/run`, { method: 'POST' })
}

export async function fetchCronRuns(id: string): Promise<any[]> {
  return request<any[]>(`/cron/${id}/runs`)
}

// Settings
export async function getSettings(): Promise<Record<string, string>> {
  return request('/settings')
}

export async function updateSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  return request('/settings', { method: 'PATCH', body: JSON.stringify(settings) })
}
