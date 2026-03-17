import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber, findAgentByName } from '../helpers'

export function registerAssign(program: Command) {
  program
    .command('assign')
    .description('Assign a task to an agent')
    .argument('<number>', 'Task number', parseInt)
    .requiredOption('--agent <agent>', 'Agent name')
    .action(async (number: number, opts: any) => {
      const task = await findTaskByNumber(number)
      const agent = await findAgentByName(opts.agent)
      await post(`/tasks/${task.id}/assign`, { agentId: agent.id })
      console.log(`\uD83D\uDCCB Task #${number} assigned to ${opts.agent}`)
    })
}
