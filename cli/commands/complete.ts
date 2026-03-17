import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerComplete(program: Command) {
  program
    .command('complete')
    .description('Complete a task')
    .argument('<number>', 'Task number', parseInt)
    .requiredOption('--summary <summary>', 'Completion summary')
    .option('--result <result>', 'Result data')
    .action(async (number: number, opts: any) => {
      const task = await findTaskByNumber(number)
      const body: any = { summary: opts.summary }
      if (opts.result) body.result = opts.result
      await post(`/tasks/${task.id}/complete`, body)
      console.log(`\u2705 Task #${number} completed`)
    })
}
