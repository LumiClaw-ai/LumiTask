import { NextResponse } from 'next/server'
import { discoverChannels } from '@/lib/notifications/openclaw-channel'
import { getNotificationConfig } from '@/lib/notifications/manager'

export async function GET() {
  try {
    const [channels, config] = await Promise.all([
      discoverChannels(),
      getNotificationConfig(),
    ])
    return NextResponse.json({ channels, config })
  } catch {
    return NextResponse.json({ channels: [], config: null })
  }
}
