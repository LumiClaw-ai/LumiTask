import type { AgentAdapter } from './adapter'

class AdapterManager {
  private adapters = new Map<string, AgentAdapter>()

  register(adapter: AgentAdapter) {
    this.adapters.set(adapter.type, adapter)
  }

  get(type: string): AgentAdapter | undefined {
    return this.adapters.get(type)
  }

  getAll(): AgentAdapter[] {
    return Array.from(this.adapters.values())
  }
}

export const adapterManager = new AdapterManager()
