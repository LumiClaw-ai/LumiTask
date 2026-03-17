import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerBlock(program: Command) {
  program
    .command('block')
    .description('Block a task')
    .argument('<number>', 'Task number', parseInt)
    .requiredOption('--reason <reason>', 'Block reason')
    .action(async (number: number, opts: any) => {
      const task = await findTaskByNumber(number)
      await post(`/tasks/${task.id}/block`, { reason: opts.reason })
      console.log(`\uD83D\uDEAB Task #${number} blocked: ${opts.reason}`)
    })
}
