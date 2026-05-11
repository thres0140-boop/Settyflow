import { EventEmitter } from "events";

// In-process pub/sub for realtime updates. Sufficient for a single Node
// instance (dev or Vercel Pro long-running). For multi-instance deploys,
// swap to Redis pub/sub or Pusher — the emit/subscribe surface stays the same.

export type RealtimeEvent =
  | {
      type: "thread.updated";
      threadId: number;
    }
  | {
      type: "message.created";
      threadId: number;
      accountId: number;
      direction: "in" | "out";
      preview: string;
      leadName: string;
      leadHandle: string | null;
      leadProfilePic: string | null;
      accountHandle: string | null;
      accountColor: string;
    };

const GLOBAL_KEY = "__settyflow_realtime__";
const g = globalThis as unknown as { [GLOBAL_KEY]?: EventEmitter };
const emitter: EventEmitter = g[GLOBAL_KEY] ?? new EventEmitter();
emitter.setMaxListeners(100);
g[GLOBAL_KEY] = emitter;

const CHANNEL = "event";

export function emitRealtime(event: RealtimeEvent) {
  emitter.emit(CHANNEL, event);
}

export function subscribeRealtime(handler: (event: RealtimeEvent) => void) {
  emitter.on(CHANNEL, handler);
  return () => {
    emitter.off(CHANNEL, handler);
  };
}
