import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

function discoverBaseUrl(): string {
  if (process.env.LUMITASK_API_URL) return process.env.LUMITASK_API_URL

  // Try to read port from Electron's port file
  try {
    const portFile = join(homedir(), '.lumitask', 'port')
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, 'utf-8').trim()
      if (port && /^\d+$/.test(port)) {
        return `http://127.0.0.1:${port}/api`
      }
    }
  } catch {}

  return 'http://127.0.0.1:3179/api'
}

const BASE_URL = discoverBaseUrl()

async function request(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }
  const res = await fetch(url, options)
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (data.error) msg = data.error
    } catch {}
    console.error(`Error: ${msg}`)
    process.exit(1)
  }
  return res.json()
}

export async function get(path: string) {
  return request('GET', path)
}

export async function post(path: string, body?: any) {
  return request('POST', path, body)
}

export async function patch(path: string, body?: any) {
  return request('PATCH', path, body)
}
