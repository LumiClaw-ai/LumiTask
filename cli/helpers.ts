import { get } from './api-client'

export async function findTaskByNumber(number: number) {
  const tasks = await get('/tasks')
  const task = tasks.find((t: any) => t.number === number)
  if (!task) {
    console.error(`Error: Task #${number} not found`)
    process.exit(1)
  }
  return task
}

export async function findAgentByName(name: string) {
  const agents = await get('/agents')
  const agent = agents.find((a: any) => a.name === name)
  if (!agent) {
    console.error(`Error: Agent '${name}' not found`)
    process.exit(1)
  }
  return agent
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return time
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}
