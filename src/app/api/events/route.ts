import { eventBus } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const writer = {
        write(data: string) {
          controller.enqueue(encoder.encode(data));
        },
      };

      eventBus.addClient(writer);

      // Send initial heartbeat
      writer.write(": connected\n\n");

      // Heartbeat interval
      const interval = setInterval(() => {
        try {
          writer.write(": heartbeat\n\n");
        } catch {
          clearInterval(interval);
          eventBus.removeClient(writer);
        }
      }, 30000);

      // Cleanup when the connection closes
      const cleanup = () => {
        clearInterval(interval);
        eventBus.removeClient(writer);
      };

      // Store cleanup for cancel signal
      (controller as any).__cleanup = cleanup;
    },
    cancel(controller) {
      (controller as any)?.__cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
