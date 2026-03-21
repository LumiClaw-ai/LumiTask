/**
 * Task state machine validation + input sanitization
 */

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  'inbox':     ['open'],
  'open':      ['assigned', 'running', 'cancelled'],
  'assigned':  ['open', 'running', 'cancelled'],
  'running':   ['done', 'failed', 'blocked', 'cancelled'],
  'blocked':   ['running', 'open', 'cancelled'],
  'done':      ['open'],   // reopen
  'failed':    ['open'],   // retry/reopen
  'cancelled': ['open'],   // reopen
}

export function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getValidNextStates(current: string): string[] {
  return VALID_TRANSITIONS[current] || []
}

/**
 * Sanitize task title — remove file paths, URLs, system metadata, code blocks
 */
export function sanitizeTitle(raw: string): string {
  let t = raw.trim()
  // Remove code blocks
  t = t.replace(/```[\s\S]*?```/g, '')
  // Remove file paths
  t = t.replace(/\/Users\/\S+/g, '')
  t = t.replace(/\/home\/\S+/g, '')
  t = t.replace(/\/tmp\/\S+/g, '')
  t = t.replace(/[A-Z]:\\[\w\\]+/g, '') // Windows paths
  t = t.replace(/\.\/\S+/g, '')
  // Remove URLs
  t = t.replace(/https?:\/\/\S+/g, '')
  // Remove system metadata
  t = t.replace(/message_id\s*=\s*\S+/g, '')
  t = t.replace(/session_id\s*=\s*\S+/g, '')
  t = t.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g, '')
  // Remove JSON-like content
  t = t.replace(/\{[^}]{100,}\}/g, '')
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim()
  // Truncate
  if (t.length > 100) t = t.slice(0, 100).replace(/\s\S*$/, '') + '...'
  return t || '未命名任务'
}
