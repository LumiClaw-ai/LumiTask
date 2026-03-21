export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Write port file for CLI/Agent discovery
    const { writeFileSync, mkdirSync } = await import('fs')
    const { join } = await import('path')
    const { homedir } = await import('os')

    const port = process.env.PORT || '3179'
    const portFile = join(homedir(), '.lumitask', 'port')
    try {
      mkdirSync(join(homedir(), '.lumitask'), { recursive: true })
      writeFileSync(portFile, port)
    } catch {}

    // Start task scheduler (dependency resolution, concurrency control, cron tasks)
    const { startScheduler } = await import('@/lib/agents/task-scheduler')
    startScheduler()
  }
}
