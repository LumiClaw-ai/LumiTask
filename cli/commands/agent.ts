import { Command } from 'commander'
import { get, post } from '../api-client'
import { findAgentByName } from '../helpers'

export function registerAgent(program: Command) {
  const agent = program
    .command('agent')
    .description('Manage agents')

  agent
    .command('register')
    .description('Register a new agent')
    .requiredOption('--name <name>', 'Agent name')
    .option('--display <display>', 'Display name')
    .option('--description <desc>', 'Agent description')
    .option('--adapter-type <type>', 'Adapter type: claude-code|openclaw', 'claude-code')
    .action(async (opts: any) => {
      const body: any = { name: opts.name, adapterType: opts.adapterType }
      if (opts.display) body.displayName = opts.display
      if (opts.description) body.description = opts.description
      await post('/agents', body)
      console.log(`Agent '${opts.name}' registered`)
    })

  agent
    .command('list')
    .description('List all agents')
    .action(async () => {
      const agents = await get('/agents')
      if (agents.length === 0) {
        console.log('No agents found.')
        return
      }

      const rows = agents.map((a: any) => ({
        name: a.name,
        display: a.displayName || '-',
        status: a.status || '-',
        adapter: a.adapterType || '-',
        lastDetected: a.lastDetectedAt ? new Date(a.lastDetectedAt).toLocaleString() : '-',
      }))

      const cols = {
        name: Math.max(4, ...rows.map((r: any) => r.name.length)),
        display: Math.max(7, ...rows.map((r: any) => r.display.length)),
        status: Math.max(6, ...rows.map((r: any) => r.status.length)),
        adapter: Math.max(7, ...rows.map((r: any) => r.adapter.length)),
      }

      const header = [
        'Name'.padEnd(cols.name),
        'Display'.padEnd(cols.display),
        'Status'.padEnd(cols.status),
        'Adapter'.padEnd(cols.adapter),
        'Last Detected',
      ].join('   ')

      console.log(header)
      for (const r of rows) {
        console.log([
          r.name.padEnd(cols.name),
          r.display.padEnd(cols.display),
          r.status.padEnd(cols.status),
          r.adapter.padEnd(cols.adapter),
          r.lastDetected,
        ].join('   '))
      }
    })

  agent
    .command('checkin')
    .description('Check in an agent')
    .requiredOption('--name <name>', 'Agent name')
    .action(async (opts: any) => {
      const a = await findAgentByName(opts.name)
      await post(`/agents/${a.id}/checkin`)
      console.log(`Agent '${opts.name}' checked in`)
    })
}
