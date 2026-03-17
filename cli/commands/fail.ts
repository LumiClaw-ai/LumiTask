import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerFail(program: Command) {
  program
    .command('fail')
    .description('Fail a task')
    .argument('<number>', 'Task number', parseInt)
    .requiredOption('--reason <reason>', 'Failure reason')
    .action(async (number: number, opts: any) => {
      const task = await findTaskByNumber(number)
      await post(`/tasks/${task.id}/fail`, { reason: opts.reason })
      console.log(`\u274C Task #${number} failed: ${opts.reason}`)
    })
}
