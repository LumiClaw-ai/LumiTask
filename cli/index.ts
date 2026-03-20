#!/usr/bin/env node
import { Command } from 'commander'
import { registerCreate } from './commands/create'
import { registerList } from './commands/list'
import { registerShow } from './commands/show'
import { registerAssign } from './commands/assign'
import { registerStart } from './commands/start'
import { registerComplete } from './commands/complete'
import { registerBlock } from './commands/block'
import { registerFail } from './commands/fail'
import { registerReopen } from './commands/reopen'
import { registerLog } from './commands/log'
import { registerArtifact } from './commands/artifact'
import { registerAgent } from './commands/agent'

const program = new Command()

program
  .name('lumitask')
  .description('Lightweight agent task management CLI')
  .version('0.1.0')

registerCreate(program)
registerList(program)
registerShow(program)
registerAssign(program)
registerStart(program)
registerComplete(program)
registerBlock(program)
registerFail(program)
registerReopen(program)
registerLog(program)
registerArtifact(program)
registerAgent(program)

program.parse()
