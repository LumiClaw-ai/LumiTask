import { Command } from 'commander'
import { get, post } from '../api-client'
import { findAgentByName } from '../helpers'

export function registerCreate(program: Command) {
  program
    .command('create')
    .description('Create a new task')
    .requiredOption('--title <title>', 'Task title')
    .option('--description <desc>', 'Task description')
    .option('--assign <agent>', 'Assign to agent by name')
    .option('--source <source>', 'Source: chat|web|cli', 'cli')
    .option('--schedule <type>', 'Schedule type: manual|immediate|scheduled|recurring', 'manual')
    .option('--cron <expression>', 'Cron expression for recurring tasks')
    .option('--working-dir <dir>', 'Working directory')
    .option('--schedule-at <timestamp>', 'Scheduled execution time (ms timestamp)')
    .action(async (opts) => {
      const body: any = {
        title: opts.title,
        source: opts.source,
        scheduleType: opts.schedule,
      }
      if (opts.description) body.description = opts.description
      if (opts.cron) body.scheduleCron = opts.cron
      if (opts.workingDir) body.workingDirectory = opts.workingDir
      if (opts.scheduleAt) body.scheduleAt = parseInt(opts.scheduleAt, 10)

      // Resolve agent name to ID before creating
      if (opts.assign) {
        const agent = await findAgentByName(opts.assign)
        body.assigneeAgentId = agent.id
      }

      const task = await post('/tasks', body)
      const agentName = opts.assign || task.agentName || ''

      if (agentName) {
        console.log(`Task #${task.number} created, assigned to ${agentName}`)
      } else {
        console.log(`Task #${task.number} created (status: ${task.status})`)
      }
    })
}
