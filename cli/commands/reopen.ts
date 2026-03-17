import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerReopen(program: Command) {
  program
    .command('reopen')
    .description('Reopen a task')
    .argument('<number>', 'Task number', parseInt)
    .action(async (number: number) => {
      const task = await findTaskByNumber(number)
      await post(`/tasks/${task.id}/reopen`)
      console.log(`\uD83D\uDD04 Task #${number} reopened`)
    })
}
