"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { statusColor, statusLabel } from "@/lib/statusColors";
import { onThreadsChanged, onServerEvent, notifyThreadsChanged } from "@/lib/events";
import { notifyIfBackgrounded } from "@/lib/notifications";
import { registerPush } from "@/lib/push-client";
import SwipeToArchive from "@/components/SwipeToArchive";
import { STATUS_META, STATUS_ORDER } from "@/lib/statusColors";
import { leadLabel, leadInitial } from "@/lib/leadLabel";
import { getInboxListsCache, setInboxListsCache, setThreadCache } from "@/lib/threadCache";

interface ThreadRow {
  id: number;
  account: {
    id: number;
    handle: string | null;
    displayName: string | null;
    profilePicUrl: string | null;
    color: string;
  };
  leadName: string;
  leadHandle: string | null;
  leadProfilePic: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromMe: boolean;
  markedReadAt: string | null;
}

interface AccountRow {
  id: number;
  handle: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
  color: string;
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export default function ThreadList() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeMatch = pathname.match(/\/inbox\/(\d+)/);
  const activeId = activeMatch ? parseInt(activeMatch[1]) : null;
  // Account filter driven by ?account=ID URL param (set by AccountSidebar).
  const urlAccount = sp.get("account");
  const urlAccountId = urlAccount ? parseInt(urlAccount) : null;

  // We keep BOTH inbox and archive lists pre-loaded in state so toggling
  // between them is instant — no fetch wait, no flash of stale data.
  // Hydrate from sessionStorage on first mount so the sidebar appears
  // instantly on reload while fresh data fetches in the background.
  const cachedInbox = typeof window !== "undefined" ? getInboxListsCache() : null;
  const [inboxThreads, setInboxThreads] = useState<ThreadRow[]>(
    (cachedInbox?.inbox as ThreadRow[]) ?? [],
  );
  const [archivedThreads, setArchivedThreads] = useState<ThreadRow[]>(
    (cachedInbox?.archived as ThreadRow[]) ?? [],
  );
  const [accounts, setAccounts] = useState<AccountRow[]>(
    (cachedInbox?.accounts as AccountRow[]) ?? [],
  );
  // accountFilter is now driven by the URL ?account= param so the leftmost
  // AccountSidebar and the dropdown menu both write/read the same source
  // of truth. setAccountFilter pushes to URL; the read above re-derives.
  const router = useRouter();
  const accountFilter = urlAccountId;
  function setAccountFilter(id: number | null) {
    const params = new URLSearchParams(sp.toString());
    if (id == null) params.delete("account");
    else params.set("account", String(id));
    const qs = params.toString();
    router.push(`/inbox${qs ? `?${qs}` : ""}`);
  }
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [view, setView] = useState<"inbox" | "archive">("inbox");
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const [q, setQ] = useState("");
  // Only show the loading placeholder when we have NO cached data at all
  // (true cold start). With a cache hit we render the stale list and let
  // the background fetch update it silently.
  const [loading, setLoading] = useState(() => !cachedInbox);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Animated dismiss so the mobile bottom sheet slides down before unmounting.
  function closeMenu() {
    if (!menuOpen) return;
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 220);
  }

  const threads = view === "archive" ? archivedThreads : inboxThreads;
  const archivedCount = archivedThreads.length;

  async function load() {
    // Build shared filter params (apply consistently to inbox + archive)
    function buildParams(archived: boolean) {
      const params = new URLSearchParams();
      if (accountFilter) params.set("accountId", String(accountFilter));
      if (statusFilter) params.set("status", statusFilter);
      if (q) params.set("q", q);
      if (onlyUnanswered) params.set("unanswered", "true");
      if (archived) params.set("archived", "true");
      params.set("take", "200");
      return params;
    }

    const [inboxRes, archRes, a] = await Promise.all([
      fetch(`/api/threads?${buildParams(false)}`).then((r) => r.json()),
      fetch(`/api/threads?${buildParams(true)}`).then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    const inboxList: ThreadRow[] = inboxRes.threads ?? [];
    const archList: ThreadRow[] = archRes.threads ?? [];

    // Skip re-render if the inbox + archive lists are unchanged in any
    // way that affects the UI. Cheap signature compare avoids the every-
    // few-seconds full re-render of every row.
    function sig(rows: ThreadRow[]) {
      return rows
        .map(
          (r) =>
            `${r.id}:${r.lastMessageAt ?? ""}:${r.unreadCount}:${r.status}:${r.lastMessageFromMe ? 1 : 0}:${r.markedReadAt ?? ""}`,
        )
        .join("|");
    }
    setInboxThreads((prev) => (sig(prev) === sig(inboxList) ? prev : inboxList));
    setArchivedThreads((prev) => (sig(prev) === sig(archList) ? prev : archList));
    setAccounts((prev) =>
      prev.length === (a.accounts ?? []).length &&
      prev.every((p, i) => p.id === a.accounts[i].id && p.profilePicUrl === a.accounts[i].profilePicUrl)
        ? prev
        : a.accounts ?? [],
    );
    setLoading(false);

    // Persist the latest snapshot so the next page load hydrates instantly.
    setInboxListsCache({
      inbox: inboxList,
      archived: archList,
      accounts: a.accounts ?? [],
      savedAt: Date.now(),
    });

    // Keep the iOS app icon badge in sync with total unread (inbox only).
    if (typeof navigator !== "undefined" && "setAppBadge" in navigator) {
      const total = inboxList.reduce(
        (sum: number, x: ThreadRow) => sum + (x.unreadCount || 0),
        0,
      );
      const nav = navigator as Navigator & {
        setAppBadge?: (n: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      if (total > 0) nav.setAppBadge?.(total).catch(() => {});
      else nav.clearAppBadge?.().catch(() => {});
    }
  }

  useEffect(() => {
    load();
    // Fallback poll for cross-instance scenarios where SSE doesn't reach
    // this client. Real realtime comes via onServerEvent below + the
    // notifyThreadsChanged custom-event bus.
    const id = setInterval(load, 15000);
    const offChange = onThreadsChanged(load);
    const offServer = onServerEvent((e) => {
      if (e.type === "message.created" || e.type === "thread.updated") {
        load();
        if (e.type === "message.created" && e.direction === "in") {
          notifyIfBackgrounded({
            title: e.leadHandle ? `@${e.leadHandle}` : e.leadName,
            body: `${e.accountHandle ? `via @${e.accountHandle} · ` : ""}${e.preview}`,
            icon: e.leadProfilePic ?? "/icon-192.png",
            tag: `thread-${e.threadId}`,
            onClick: () => {
              window.location.href = `/inbox/${e.threadId}`;
            },
          });
        }
      }
    });
    return () => {
      clearInterval(id);
      offChange();
      offServer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountFilter, statusFilter, q, onlyUnanswered]);

  // Push notification state — drives the "Enable notifications" banner below.
  const [pushState, setPushState] = useState<
    "unknown" | "needs_gesture" | "ok" | "denied" | "unsupported"
  >("unknown");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushState("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "granted") {
      // Already granted — silently ensure the subscription is current.
      registerPush().then((s) => setPushState(s === "ok" ? "ok" : "denied"));
    } else if (perm === "denied") {
      setPushState("denied");
    } else {
      // iOS requires a user gesture before showing the permission prompt.
      setPushState("needs_gesture");
    }
  }, []);

  // Optimistic archive / unarchive — pull the row out of its source list
  // immediately (so the swipe animation reads as a clean disappear), then
  // fire the PATCH. If it fails we reload from the source of truth.
  async function setThreadArchived(threadId: number, archived: boolean) {
    if (archived) {
      setInboxThreads((prev) => prev.filter((t) => t.id !== threadId));
    } else {
      setArchivedThreads((prev) => prev.filter((t) => t.id !== threadId));
    }
    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) throw new Error(`patch failed: ${res.status}`);
      // Refresh both lists so the other view picks up the moved thread.
      notifyThreadsChanged();
    } catch (e) {
      console.warn("[archive-toggle] failed, reloading:", e);
      load();
    }
  }

  async function enablePush() {
    const status = await registerPush();
    if (status === "ok") setPushState("ok");
    else if (status === "denied") setPushState("denied");
    else if (status === "unsupported") setPushState("unsupported");
    else alert(`Push setup failed: ${status}`);
  }

  // Close the dropdown menu when clicking outside the panel AND outside the
  // toggle button (otherwise outside-click would race the button's own
  // toggle and the menu would never open). Only applied to the desktop
  // dropdown — the mobile bottom sheet has its own scrim that handles close.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      const insidePanel = menuPanelRef.current?.contains(t);
      const insideButton = menuButtonRef.current?.contains(t);
      if (!insidePanel && !insideButton) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen]);

  const activeAccount = accounts.find((a) => a.id === accountFilter) ?? null;

  // Shared menu content rendered in both the desktop dropdown and the
  // mobile bottom sheet. All actions call closeMenu() for animated dismissal.
  function renderMenuContents() {
    return (
      <>
        <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
          Filter accounts
        </div>
        <button
          onClick={() => setAccountFilter(null)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface)] ${
            accountFilter === null ? "text-white" : "text-[var(--muted)]"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 shrink-0" />
          <span className="flex-1 text-left">All accounts</span>
          {accountFilter === null && <span>✓</span>}
        </button>
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setAccountFilter(a.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface)] ${
              accountFilter === a.id ? "text-white" : "text-[var(--muted)]"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: a.color }}
            />
            <span className="flex-1 text-left truncate">
              @{a.handle ?? a.displayName ?? "account"}
            </span>
            {accountFilter === a.id && <span>✓</span>}
          </button>
        ))}

        <div className="border-t border-[var(--border)] mt-1 px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
          Filter by status
        </div>
        <button
          onClick={() => setStatusFilter(null)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface)] ${
            statusFilter === null ? "text-white" : "text-[var(--muted)]"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white/40 shrink-0" />
          <span className="flex-1 text-left">All statuses</span>
          {statusFilter === null && <span>✓</span>}
        </button>
        {STATUS_ORDER.map((key) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface)] ${
              statusFilter === key ? "text-white" : "text-[var(--muted)]"
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: STATUS_META[key].color }}
            />
            <span className="flex-1 text-left">
              {STATUS_META[key].label}
            </span>
            {statusFilter === key && <span>✓</span>}
          </button>
        ))}

        <div className="border-t border-[var(--border)] mt-1">
          <Link
            href="/accounts"
            onClick={closeMenu}
            className="block px-4 py-3 text-sm hover:bg-[var(--surface)]"
          >
            Manage accounts
          </Link>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.href = "/login";
            }}
            className="block w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-[var(--surface)]"
          >
            Sign out
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-10 bg-[var(--panel)]/95 backdrop-blur pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          {view === "archive" && (
            <button
              onClick={() => setView("inbox")}
              className="text-[var(--muted)] hover:text-white text-xl leading-none -ml-1 pr-1"
              aria-label="Back to inbox"
            >
              ←
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-none">
              {view === "archive" ? "Archive" : "Inbox"}
            </h1>
            {activeAccount && view === "inbox" && (
              <div
                className="text-xs mt-0.5 truncate"
                style={{ color: activeAccount.color }}
              >
                @{activeAccount.handle ?? activeAccount.displayName ?? "account"}
              </div>
            )}
          </div>

          {/* Menu trigger — the panel itself drops down full-width below the
              entire header (see further down). Keeping the button here so it
              stays in the top-right corner. */}
          <button
            ref={menuButtonRef}
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
            className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]"
            aria-label="Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>

        <div className="px-4 pb-3 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads…"
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-4 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => setOnlyUnanswered((v) => !v)}
            title={onlyUnanswered ? "Showing unanswered only" : "Show only unanswered"}
            className={`shrink-0 w-9 h-9 rounded-full border flex items-center justify-center text-sm transition-colors ${
              onlyUnanswered
                ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:text-white"
            }`}
            aria-label="Toggle unanswered filter"
            aria-pressed={onlyUnanswered}
          >
            {/* envelope-with-dot icon — represents unread/unanswered */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16v12H4z" />
              <path d="M4 6l8 7 8-7" />
            </svg>
          </button>
        </div>

        {pushState === "needs_gesture" && (
          <button
            onClick={enablePush}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--accent)]/15 border-t border-b border-[var(--accent)]/30 hover:bg-[var(--accent)]/25 text-sm"
          >
            <span>🔔</span>
            <span className="flex-1 text-left text-white">
              Enable notifications for new DMs
            </span>
            <span className="text-[var(--accent)]">Enable →</span>
          </button>
        )}

        {/* Desktop: full-width dropdown anchored to the header */}
        {menuOpen && (
          <div
            ref={menuPanelRef}
            className="hidden md:block absolute left-0 right-0 top-full bg-[var(--surface-2)] border-t border-b border-[var(--border)] shadow-2xl z-20 max-h-[70vh] overflow-y-auto"
            style={{ animation: "sheet-down-rev 180ms ease-out" }}
          >
            {renderMenuContents()}
          </div>
        )}
      </header>

      {/* Mobile: bottom-sheet variant — slides up from the bottom with a
          scrim, matching the thread-info sheet on the chat page. */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col">
          <button
            aria-label="Close menu"
            onClick={closeMenu}
            className="flex-1 backdrop-blur-sm"
            style={{
              background: "rgba(0,0,0,0.6)",
              animation: menuClosing
                ? "scrim-fade-out 220ms ease forwards"
                : "scrim-fade-in 220ms ease forwards",
            }}
          />
          <div
            className="bg-[var(--background)] rounded-t-2xl shadow-2xl border-t border-[var(--border)] overflow-hidden flex flex-col"
            style={{
              maxHeight: "85dvh",
              animation: menuClosing
                ? "sheet-down 220ms cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "sheet-up 220ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex items-center justify-center py-2 relative shrink-0">
              <span className="w-9 h-1 rounded-full bg-[var(--border)]" />
              <button
                onClick={closeMenu}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-white hover:bg-[var(--surface)] text-base"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
              }}
            >
              {renderMenuContents()}
            </div>
          </div>
        </div>
      )}

      <div
        className="overflow-y-auto"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" }}
      >
        {/* Archived row — only on inbox view, only if there's anything archived */}
        {view === "inbox" && archivedCount > 0 && (
          <button
            onClick={() => setView("archive")}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface)] text-left"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[var(--surface-2)] text-[var(--muted)]">
              {/* archive icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7h18v4H3z" />
                <path d="M5 11v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
                <path d="M10 15h4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">Archived</div>
              <div className="text-xs text-[var(--muted)]">
                {archivedCount} {archivedCount === 1 ? "thread" : "threads"}
              </div>
            </div>
            <span className="text-[var(--muted)] text-lg">›</span>
          </button>
        )}

        {loading && (
          /* Skeleton rows — same shape as real thread rows so the
              layout doesn't jump when data arrives. Mirrors the
              avatar circle + two text lines + timestamp. */
          <div aria-busy>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 px-4 py-3 border-l-2 border-transparent"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--surface)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-3 bg-[var(--surface)] rounded w-2/3 mb-2" />
                  <div className="h-2.5 bg-[var(--surface)] rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && threads.length === 0 && (
          <div className="p-6 text-sm text-[var(--muted)]">
            {view === "archive"
              ? "No archived threads."
              : (
                <>
                  No threads yet. Go to{" "}
                  <Link href="/accounts" className="underline">
                    Accounts
                  </Link>{" "}
                  to connect an Instagram account.
                </>
              )}
          </div>
        )}
        {threads.map((t) => {
          const isActive = activeId === t.id;
          const isArchiveView = view === "archive";
          // Eagerly fetch the thread payload on the first user signal
          // (hover on desktop, touchstart on mobile) so by the time the
          // click resolves the data is in sessionStorage and the thread
          // page renders without a network round-trip.
          const prefetchThread = () => {
            fetch(`/api/threads/${t.id}`)
              .then((r) => r.json())
              .then((d) => {
                if (d?.thread) setThreadCache(t.id, d.thread);
              })
              .catch(() => {});
          };
          // Beeper-style compact row: ~62px tall, no left-border accent,
          // active state is just a subtle fill, account-tinted status dot
          // overlaid bottom-right of the avatar (no verbose chip).
          const lastTs = t.lastMessageAt ? new Date(t.lastMessageAt).getTime() : 0;
          const markedTs = t.markedReadAt ? new Date(t.markedReadAt).getTime() : 0;
          const manuallyHandled = markedTs >= lastTs;
          const needsAttention = !t.lastMessageFromMe && !manuallyHandled;
          const row = (
            <Link
              href={`/inbox/${t.id}`}
              onMouseEnter={prefetchThread}
              onTouchStart={prefetchThread}
              // Beeper-density rows: tighter padding (py-2), edge-to-edge
              // inactive with a hairline border-bottom to separate them,
              // active row becomes a pill (side margins + rounded + lifted).
              className={
                isActive
                  ? "flex items-center gap-3 px-3 py-2 mx-2 my-0.5 rounded-lg bg-[var(--surface-2)]"
                  : "flex items-center gap-3 px-3 py-2 transition-colors hover:bg-white/[0.04] border-b border-white/[0.04]"
              }
            >
              <div className="relative shrink-0">
                {t.leadProfilePic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.leadProfilePic}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-medium"
                    style={{ backgroundColor: t.account.color }}
                  >
                    {leadInitial(t)}
                  </div>
                )}
                {/* Tiny coloured dot in the corner = pipeline status. Only
                    shown when status != "new" to avoid clutter on default. */}
                {t.status !== "new" && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--panel)]"
                    style={{ backgroundColor: statusColor(t.status) }}
                    title={`Status: ${statusLabel(t.status)}`}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-medium text-[14px] truncate text-[var(--foreground)]">
                    {leadLabel(t)}
                  </span>
                  <span className="ml-auto text-[11px] text-[var(--muted)] shrink-0">
                    {timeAgo(t.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <p
                    className={`flex-1 text-[13px] truncate ${
                      needsAttention ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {t.lastMessageFromMe && "↗ "}
                    {t.lastMessagePreview ?? ""}
                  </p>
                  {t.unreadCount > 0 && (
                    <span className="shrink-0 min-w-[18px] h-[18px] text-[10px] font-semibold bg-[var(--accent)] text-white rounded-full flex items-center justify-center px-1">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
          // Swipe-right archives on inbox view, unarchives on archive view —
          // same gesture, opposite direction in the data model.
          return (
            <SwipeToArchive
              key={t.id}
              mode={isArchiveView ? "unarchive" : "archive"}
              onArchive={() => setThreadArchived(t.id, !isArchiveView)}
            >
              {row}
            </SwipeToArchive>
          );
        })}
      </div>
    </>
  );
}
