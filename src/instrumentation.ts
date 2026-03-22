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

    // Recover orphaned "running" tasks on startup (no process is running for them)
    try {
      const { db } = await import('@/lib/db')
      const { tasks } = await import('@/lib/db/schema')
      const { eq } = await import('drizzle-orm')
      const stuck = await db.select({ id: tasks.id, number: tasks.number })
        .from(tasks).where(eq(tasks.status, 'running'))
      if (stuck.length > 0) {
        for (const t of stuck) {
          await db.update(tasks).set({
            status: 'open',
            scheduleType: 'immediate',
            startedAt: null,
            updatedAt: Date.now(),
          }).where(eq(tasks.id, t.id))
        }
        console.log(`[Startup] Recovered ${stuck.length} orphaned running tasks`)
      }
    } catch {}

    // Start task scheduler (dependency resolution, concurrency control, cron tasks)
    const { startScheduler } = await import('@/lib/agents/task-scheduler')
    startScheduler()
  }
}
