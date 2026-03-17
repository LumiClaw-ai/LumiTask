const BASE_URL = process.env.CLAWTASK_API_URL || 'http://127.0.0.1:3000/api'

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
