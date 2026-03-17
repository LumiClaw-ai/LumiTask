export interface TaskContext {
  taskId: string
  taskNumber: number
  title: string
  description: string | null
  workingDirectory: string | null
  agentConfig?: string | null  // JSON string of agent's adapterConfig
}

export interface ExecutionEvent {
  type: 'started' | 'progress' | 'tool_use' | 'tool_result' | 'completed' | 'failed' | 'blocked'
  message: string
  toolName?: string
  toolInput?: string
  inputTokens?: number
  outputTokens?: number
  model?: string
  timestamp: number
}

export interface ExecutionResult {
  success: boolean
  summary: string
  result?: string
  error?: string
  totalInputTokens: number
  totalOutputTokens: number
  costCents?: number
  model?: string
}

export interface AgentAdapter {
  type: string
  detect(): Promise<boolean>
  execute(context: TaskContext, onEvent: (event: ExecutionEvent) => void): Promise<ExecutionResult>
  cancel(taskId: string): Promise<void>
  reply(taskId: string, text: string): Promise<boolean>
}
