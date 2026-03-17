import { Command } from 'commander'
import { get } from '../api-client'
import { findAgentByName } from '../helpers'

export function registerList(program: Command) {
  program
    .command('list')
    .description('List tasks')
    .option('--status <status>', 'Filter by status')
    .option('--agent <agent>', 'Filter by agent name')
    .option('--unassigned', 'Show only unassigned tasks')
    .action(async (opts) => {
      const params = new URLSearchParams()
      if (opts.status) params.set('status', opts.status)
      if (opts.unassigned) params.set('unassigned', 'true')
      if (opts.agent) {
        const agent = await findAgentByName(opts.agent)
        params.set('agent', agent.id)
      }

      const qs = params.toString()
      const tasks = await get(`/tasks${qs ? '?' + qs : ''}`)

      if (tasks.length === 0) {
        console.log('No tasks found.')
        return
      }

      // Fetch agents for name resolution
      const agents = await get('/agents')
      const agentMap = new Map(agents.map((a: any) => [a.id, a.name]))

      // Calculate column widths
      const rows = tasks.map((t: any) => ({
        num: String(t.number),
        status: t.status,
        schedule: t.scheduleType || 'manual',
        agent: t.assigneeAgentId ? (agentMap.get(t.assigneeAgentId) || '?') : '-',
        title: t.title,
      }))

      const cols = {
        num: Math.max(1, ...rows.map((r: any) => r.num.length)),
        status: Math.max(6, ...rows.map((r: any) => r.status.length)),
        schedule: Math.max(8, ...rows.map((r: any) => r.schedule.length)),
        agent: Math.max(5, ...rows.map((r: any) => r.agent.length)),
      }

      const header = [
        '#'.padEnd(cols.num),
        'Status'.padEnd(cols.status),
        'Schedule'.padEnd(cols.schedule),
        'Agent'.padEnd(cols.agent),
        'Title',
      ].join('   ')

      console.log(header)
      for (const r of rows) {
        console.log([
          r.num.padEnd(cols.num),
          r.status.padEnd(cols.status),
          r.schedule.padEnd(cols.schedule),
          r.agent.padEnd(cols.agent),
          r.title,
        ].join('   '))
      }
    })
}
