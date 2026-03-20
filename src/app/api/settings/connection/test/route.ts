import { NextRequest, NextResponse } from 'next/server'
import { RemoteOpenClawClient, parseConnectionCode } from '@/lib/openclaw-client/remote-client'
import { LocalOpenClawClient } from '@/lib/openclaw-client/local-client'
import { saveConnectionSettings, resetOpenClawClient } from '@/lib/openclaw-client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mode, connectionCode, gatewayUrl, gatewayToken } = body

    if (mode === 'local') {
      const client = new LocalOpenClawClient()
      const available = await client.isAvailable()
      if (!available) {
        return NextResponse.json({ success: false, error: '未检测到本地 OpenClaw' })
      }
      const agents = await client.listAgents()
      await saveConnectionSettings('local')
      return NextResponse.json({ success: true, agents, mode: 'local' })
    }

    // Remote mode
    let url = gatewayUrl || ''
    let token = gatewayToken || ''

    // Parse connection code if provided
    if (connectionCode) {
      try {
        const parsed = parseConnectionCode(connectionCode)
        url = parsed.url
        token = parsed.token
      } catch {
        return NextResponse.json({ success: false, error: '连接码格式无效' })
      }
    }

    if (!url) {
      return NextResponse.json({ success: false, error: '缺少 Gateway URL' })
    }

    const client = new RemoteOpenClawClient(url, token)
    const available = await client.isAvailable()
    if (!available) {
      return NextResponse.json({ success: false, error: `无法连接到 Gateway: ${url}` })
    }

    const agents = await client.listAgents()
    await saveConnectionSettings('remote', url, token)

    return NextResponse.json({
      success: true,
      agents,
      mode: 'remote',
      gatewayUrl: url,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
