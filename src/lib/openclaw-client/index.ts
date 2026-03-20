import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { LocalOpenClawClient } from './local-client'
import { RemoteOpenClawClient } from './remote-client'
import type { OpenClawClient } from './types'

export type { OpenClawClient } from './types'
export { parseConnectionCode } from './remote-client'

const CONNECTION_MODE_KEY = 'openclaw_connection_mode'  // 'local' | 'remote'
const GATEWAY_URL_KEY = 'openclaw_gateway_url'
const GATEWAY_TOKEN_KEY = 'openclaw_gateway_token'

let _client: OpenClawClient | null = null

/** Get or create the OpenClaw client based on settings */
export async function getOpenClawClient(): Promise<OpenClawClient> {
  if (_client) return _client

  try {
    const [modeRow] = await db.select().from(settings).where(eq(settings.key, CONNECTION_MODE_KEY))
    const mode = modeRow?.value || 'local'

    if (mode === 'remote') {
      const [urlRow] = await db.select().from(settings).where(eq(settings.key, GATEWAY_URL_KEY))
      const [tokenRow] = await db.select().from(settings).where(eq(settings.key, GATEWAY_TOKEN_KEY))
      if (urlRow?.value) {
        _client = new RemoteOpenClawClient(urlRow.value, tokenRow?.value || '')
        return _client
      }
    }
  } catch {}

  _client = new LocalOpenClawClient()
  return _client
}

/** Reset the cached client (call after changing connection settings) */
export function resetOpenClawClient(): void {
  _client = null
}

/** Save connection settings */
export async function saveConnectionSettings(
  mode: 'local' | 'remote',
  gatewayUrl?: string,
  gatewayToken?: string
): Promise<void> {
  const upsert = async (key: string, value: string) => {
    const existing = await db.select().from(settings).where(eq(settings.key, key))
    if (existing.length > 0) {
      await db.update(settings).set({ value }).where(eq(settings.key, key))
    } else {
      await db.insert(settings).values({ key, value })
    }
  }

  await upsert(CONNECTION_MODE_KEY, mode)
  if (gatewayUrl) await upsert(GATEWAY_URL_KEY, gatewayUrl)
  if (gatewayToken) await upsert(GATEWAY_TOKEN_KEY, gatewayToken)

  resetOpenClawClient()
}
