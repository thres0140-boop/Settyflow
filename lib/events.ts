// Tiny cross-component event bus. Used to notify the sidebar thread list when
// a thread changes (status, notes, tags, new message) so the dot color and
// preview update instantly instead of waiting for the next 15s poll.

export const THREADS_CHANGED = "settyflow:threads-changed";

export function notifyThreadsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(THREADS_CHANGED));
}

export function onThreadsChanged(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(THREADS_CHANGED, handler);
  return () => window.removeEventListener(THREADS_CHANGED, handler);
}

export const INSERT_TEXT = "settyflow:insert-text";

export function notifyInsertText(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INSERT_TEXT, { detail: { text } }));
}

export function onInsertText(handler: (text: string) => void) {
  if (typeof window === "undefined") return () => {};
  const listener = (e: Event) => {
    const detail = (e as CustomEvent<{ text: string }>).detail;
    if (detail?.text != null) handler(detail.text);
  };
  window.addEventListener(INSERT_TEXT, listener);
  return () => window.removeEventListener(INSERT_TEXT, listener);
}

// ---- SSE realtime subscription -----------------------------------------

export interface ServerEvent {
  type: string;
  [k: string]: any;
}

let eventSource: EventSource | null = null;
const listeners = new Set<(e: ServerEvent) => void>();

function ensureEventSource() {
  if (typeof window === "undefined") return;
  if (eventSource) return;
  try {
    eventSource = new EventSource("/api/events");
    eventSource.onmessage = (msg) => {
      try {
        const parsed: ServerEvent = JSON.parse(msg.data);
        for (const l of listeners) l(parsed);
      } catch {
        /* ignore */
      }
    };
    eventSource.onerror = () => {
      // Browser will auto-reconnect; no-op
    };
  } catch (e) {
    console.warn("[sse] failed to connect:", e);
  }
}

export function onServerEvent(handler: (e: ServerEvent) => void) {
  if (typeof window === "undefined") return () => {};
  ensureEventSource();
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

// ---- Dismiss the mobile info sheet ----------------------------------

export const DISMISS_INFO_SHEET = "settyflow:dismiss-info-sheet";

export function notifyDismissInfoSheet() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DISMISS_INFO_SHEET));
}

export function onDismissInfoSheet(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DISMISS_INFO_SHEET, handler);
  return () => window.removeEventListener(DISMISS_INFO_SHEET, handler);
}
