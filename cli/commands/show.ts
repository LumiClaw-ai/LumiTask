import { Command } from 'commander'
import { get } from '../api-client'
import { findTaskByNumber, formatTimestamp } from '../helpers'

export function registerShow(program: Command) {
  program
    .command('show')
    .description('Show task details')
    .argument('<number>', 'Task number', parseInt)
    .action(async (number: number) => {
      const brief = await findTaskByNumber(number)
      const task = await get(`/tasks/${brief.id}`)

      // Resolve agent name
      let agentName = '-'
      if (task.assigneeAgentId) {
        try {
          const agents = await get('/agents')
          const agent = agents.find((a: any) => a.id === task.assigneeAgentId)
          if (agent) agentName = agent.displayName || agent.name
        } catch {}
      }

      console.log(`Task #${task.number}: ${task.title}`)
      console.log(`Status: ${task.status} | Agent: ${agentName} | Schedule: ${task.scheduleType || 'manual'}`)
      if (task.workingDirectory) console.log(`Working Directory: ${task.workingDirectory}`)
      if (task.scheduleCron) console.log(`Cron: ${task.scheduleCron}`)

      if (task.totalInputTokens || task.totalOutputTokens) {
        const tokIn = (task.totalInputTokens || 0).toLocaleString()
        const tokOut = (task.totalOutputTokens || 0).toLocaleString()
        const costCents = task.totalCostCents || 0
        const costStr = costCents > 0 ? ` (~$${(costCents / 100).toFixed(2)})` : ''
        console.log(`Tokens: ${tokIn} in / ${tokOut} out${costStr}`)
      }

      const times: string[] = []
      if (task.createdAt) times.push(`Created: ${formatTimestamp(task.createdAt)}`)
      if (task.startedAt) times.push(`Started: ${formatTimestamp(task.startedAt)}`)
      if (task.completedAt) times.push(`Completed: ${formatTimestamp(task.completedAt)}`)
      if (times.length) console.log(times.join(' | '))

      if (task.summary) {
        console.log(`\nSummary: ${task.summary}`)
      }
      if (task.result) {
        console.log(`\nResult:\n${task.result}`)
      }
      if (task.blockReason) {
        console.log(`\nBlocked: ${task.blockReason}`)
      }
      if (task.failReason) {
        console.log(`\nFail reason: ${task.failReason}`)
      }

      if (task.activityLog && task.activityLog.length > 0) {
        console.log('\nActivity:')
        const icons: Record<string, string> = {
          'task.created': '🆕',
          'task.assigned': '📋',
          'task.started': '▶️ ',
          'task.progress': '📝',
          'task.completed': '✅',
          'task.failed': '❌',
          'task.blocked': '🚫',
          'task.reopened': '🔄',
          'task.updated': '✏️',
          'comment': '💬',
        }
        for (const log of task.activityLog) {
          const time = formatTimestamp(log.createdAt)
          const icon = icons[log.action] || '🔹'
          let line = `  [${time}] ${icon} ${log.action}`
          if (log.actorId) line += ` by ${log.actorId}`
          if (log.inputTokens || log.outputTokens) {
            const ti = log.inputTokens >= 1000 ? `${(log.inputTokens / 1000).toFixed(1)}k` : String(log.inputTokens || 0)
            const to = log.outputTokens >= 1000 ? `${(log.outputTokens / 1000).toFixed(1)}k` : String(log.outputTokens || 0)
            line += ` (${ti}/${to} tokens)`
          }
          console.log(line)
          if (log.message) {
            console.log(`          "${log.message}"`)
          }
        }
      }

      if (task.artifacts && task.artifacts.length > 0) {
        console.log('\nArtifacts:')
        const artIcons: Record<string, string> = {
          file: '📄',
          url: '🔗',
          text: '📄',
          json: '📄',
          image: '🖼️',
        }
        for (const art of task.artifacts) {
          const icon = artIcons[art.type] || '📎'
          const display = art.type === 'url' ? art.content : (art.name || art.content)
          console.log(`  ${icon} ${display}`)
        }
      }
    })
}
