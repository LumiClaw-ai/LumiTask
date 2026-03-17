type SseWriter = {
  write(data: string): void;
};

class EventBus {
  private clients = new Set<SseWriter>();

  addClient(stream: SseWriter) {
    this.clients.add(stream);
  }

  removeClient(stream: SseWriter) {
    this.clients.delete(stream);
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
  }
}

export const eventBus = new EventBus();
