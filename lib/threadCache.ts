// Tiny per-thread cache so re-opening a chat doesn't flash a "Loading…" state.
// Mirrors writes to sessionStorage so the cache survives page reloads.
//
// Usage: read on mount, render instantly if hit, then fetch fresh data in
// the background (which writes back into the cache).

const KEY_PREFIX = "settyflow:thread:";
const memCache = new Map<number, unknown>();

export function setThreadCache<T>(id: number, data: T) {
  memCache.set(id, data);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY_PREFIX + id, JSON.stringify(data));
  } catch {
    /* quota or unavailable */
  }
}

export function getThreadCache<T>(id: number): T | null {
  if (memCache.has(id)) return memCache.get(id) as T;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    memCache.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function clearThreadCache(id: number) {
  memCache.delete(id);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_PREFIX + id);
  } catch {
    /* ignore */
  }
}
