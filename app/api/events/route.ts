import type { NextRequest } from "next/server";
import { subscribeRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";

// SSE stream for realtime thread + message events.
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* ignore writes after close */
        }
      };

      // Initial hello so the client knows the stream is alive.
      send({ type: "hello", at: Date.now() });

      const unsub = subscribeRealtime((event) => send(event));

      // Heartbeat every 25s to keep proxies / iOS Safari from dropping us.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 25_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
