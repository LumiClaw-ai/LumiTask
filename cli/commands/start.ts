import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerStart(program: Command) {
  program
    .command('start')
    .description('Start a task')
    .argument('<number>', 'Task number', parseInt)
    .action(async (number: number) => {
      const task = await findTaskByNumber(number)
      await post(`/tasks/${task.id}/start`)
      console.log(`\u25B6\uFE0F Task #${number} started`)
    })
}
