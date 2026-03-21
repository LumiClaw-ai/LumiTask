import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agents } from '@/lib/db/schema'
import { findClaudeCodeBinary, getClaudeCodeVersion } from './claude-code-detect'
import { findOpenClawBinary, checkOpenClawGateway, listOpenClawAgents } from './openclaw-detect'

export interface DetectedAgent {
  type: 'claude-code' | 'openclaw'
  name: string
  displayName: string
  description?: string
  available: boolean
  version?: string | null
  config: Record<string, any>
}

export async function detectLocalAgents(): Promise<DetectedAgent[]> {
  const detected: DetectedAgent[] = []

  // Claude Code
  const claudePath = await findClaudeCodeBinary()
  if (claudePath) {
    const version = await getClaudeCodeVersion(claudePath)
    detected.push({
      type: 'claude-code',
      name: 'claude-code',
      displayName: 'Claude Code',
      available: true,
      version,
      config: { binaryPath: claudePath },
    })
  }

  // OpenClaw — list all agents
  const openclawPath = await findOpenClawBinary()
  if (openclawPath) {
    const gatewayAvailable = await checkOpenClawGateway()
    const openclawAgents = await listOpenClawAgents(openclawPath)

    if (openclawAgents.length > 0) {
      // Register each OpenClaw agent individually
      for (const oa of openclawAgents) {
        const agentName = `openclaw-${oa.id}` // unique name per agent
        const displayName = [oa.identityEmoji, oa.identityName].filter(Boolean).join(' ') || oa.id
        detected.push({
          type: 'openclaw',
          name: agentName,
          displayName,
          description: `Model: ${oa.model || 'default'}${oa.isDefault ? ' (default)' : ''}`,
          available: gatewayAvailable, // online only if gateway is running
          version: oa.model || null,
          config: {
            binaryPath: openclawPath,
            gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
            gatewayAvailable,
            openclawAgentId: oa.id,
            identityName: oa.identityName,
            identityEmoji: oa.identityEmoji,
            workspace: oa.workspace,
            agentDir: oa.agentDir,
            isDefault: oa.isDefault,
          },
        })
      }
    } else {
      // Fallback: no agents listed, register a generic one
      detected.push({
        type: 'openclaw',
        name: 'openclaw',
        displayName: 'OpenClaw',
        available: gatewayAvailable,
        config: {
          binaryPath: openclawPath,
          gatewayUrl: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
          gatewayAvailable,
        },
      })
    }
  }

  return detected
}

// Sync detected agents with database
export async function syncDetectedAgents(): Promise<typeof agents.$inferSelect[]> {
  const detected = await detectLocalAgents()
  const now = Date.now()
  const existing = await db.select().from(agents)
  const existingNames = new Set(existing.map(a => a.name))
  const detectedNames = new Set(detected.map(d => d.name))

  for (const d of detected) {
    if (existingNames.has(d.name)) {
      await db.update(agents).set({
        displayName: d.displayName,
        description: d.description || null,
        status: d.available ? 'online' as const : 'offline' as const,
        version: d.version || null,
        adapterConfig: JSON.stringify(d.config),
        lastDetectedAt: now,
      }).where(eq(agents.name, d.name))
    } else {
      await db.insert(agents).values({
        id: nanoid(),
        name: d.name,
        displayName: d.displayName,
        description: d.description || null,
        adapterType: d.type,
        adapterConfig: JSON.stringify(d.config),
        status: d.available ? 'online' as const : 'offline' as const,
        version: d.version || null,
        lastDetectedAt: now,
        createdAt: now,
      })
    }
  }

  // Mark agents that are no longer detected as offline
  for (const e of existing) {
    if (!detectedNames.has(e.name)) {
      await db.update(agents).set({ status: 'offline' as const, lastDetectedAt: now }).where(eq(agents.id, e.id))
    }
  }

  return db.select().from(agents)
}
