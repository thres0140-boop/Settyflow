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

// ---- Inbox list cache ------------------------------------------------
// Cache the whole inbox + archived lists so the sidebar shows instantly
// on reload from sessionStorage while fresh data fetches in the
// background. Avoids the "Loading…" flash on every cold start.

const INBOX_KEY = "settyflow:inbox-lists-v1";

export interface InboxListsCache {
  inbox: any[];
  archived: any[];
  accounts: any[];
  savedAt: number;
}

export function setInboxListsCache(data: InboxListsCache) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(INBOX_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

export function getInboxListsCache(): InboxListsCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INBOX_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InboxListsCache;
  } catch {
    return null;
  }
}
