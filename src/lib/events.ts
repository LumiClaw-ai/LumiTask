type SseWriter = {
  write(data: string): void;
};

type InternalListener = (event: string, data: any) => void;

class EventBus {
  private clients = new Set<SseWriter>();
  private listeners: InternalListener[] = [];

  addClient(stream: SseWriter) {
    this.clients.add(stream);
  }

  removeClient(stream: SseWriter) {
    this.clients.delete(stream);
  }

  /** Register an internal listener (for scheduler, notifications, etc.) */
  on(listener: InternalListener) {
    this.listeners.push(listener);
  }

  broadcast(event: string, data: unknown) {
    // Send as unnamed message so es.onmessage receives it
    // Include event name inside the data payload
    const obj = typeof data === "object" && data !== null ? data : { value: data };
    const payload = `data: ${JSON.stringify({ event, ...obj })}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }

    // Notify internal listeners
    for (const listener of this.listeners) {
      try { listener(event, obj); } catch {}
    }
  }
}

export const eventBus = new EventBus();
