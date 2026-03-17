import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerLog(program: Command) {
  program
    .command('log')
    .description('Log a progress message to a task')
    .argument('<number>', 'Task number', parseInt)
    .argument('<message>', 'Log message')
    .option('--tokens-in <n>', 'Input tokens', parseInt)
    .option('--tokens-out <n>', 'Output tokens', parseInt)
    .option('--model <name>', 'Model name')
    .option('--provider <name>', 'Provider name')
    .option('--actor-type <type>', 'Actor type', 'agent')
    .option('--actor-id <id>', 'Actor ID')
    .action(async (number: number, message: string, opts: any) => {
      const task = await findTaskByNumber(number)
      const body: any = { message }
      if (opts.tokensIn) body.tokensIn = opts.tokensIn
      if (opts.tokensOut) body.tokensOut = opts.tokensOut
      if (opts.model) body.model = opts.model
      if (opts.provider) body.provider = opts.provider
      if (opts.actorType) body.actorType = opts.actorType
      if (opts.actorId) body.actorId = opts.actorId
      await post(`/tasks/${task.id}/log`, body)
      console.log(`\uD83D\uDCDD Logged to task #${number}`)
    })
}
