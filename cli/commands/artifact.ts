import { Command } from 'commander'
import { post } from '../api-client'
import { findTaskByNumber } from '../helpers'

export function registerArtifact(program: Command) {
  program
    .command('artifact')
    .description('Add an artifact to a task')
    .argument('<number>', 'Task number', parseInt)
    .requiredOption('--type <type>', 'Artifact type: file|url|text|json|image')
    .requiredOption('--name <name>', 'Artifact name')
    .requiredOption('--content <content>', 'Artifact content')
    .action(async (number: number, opts: any) => {
      const task = await findTaskByNumber(number)
      await post(`/tasks/${task.id}/artifacts`, {
        type: opts.type,
        name: opts.name,
        content: opts.content,
      })
      console.log(`\uD83D\uDCCE Artifact added to task #${number}`)
    })
}
