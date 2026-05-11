"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountBadge from "@/components/AccountBadge";
import { statusColor, statusLabel } from "@/lib/statusColors";
import { onThreadsChanged, onServerEvent } from "@/lib/events";
import { notifyIfBackgrounded } from "@/lib/notifications";
import { registerPush } from "@/lib/push-client";

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
  const activeMatch = pathname.match(/\/inbox\/(\d+)/);
  const activeId = activeMatch ? parseInt(activeMatch[1]) : null;

  // We keep BOTH inbox and archive lists pre-loaded in state so toggling
  // between them is instant — no fetch wait, no flash of stale data.
  const [inboxThreads, setInboxThreads] = useState<ThreadRow[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ThreadRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [view, setView] = useState<"inbox" | "archive">("inbox");
  const [onlyUnanswered, setOnlyUnanswered] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const threads = view === "archive" ? archivedThreads : inboxThreads;
  const archivedCount = archivedThreads.length;

  async function load() {
    // Build shared filter params (apply consistently to inbox + archive)
    function buildParams(archived: boolean) {
      const params = new URLSearchParams();
      if (accountFilter) params.set("accountId", String(accountFilter));
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
    setInboxThreads(inboxList);
    setArchivedThreads(archList);
    setAccounts(a.accounts ?? []);
    setLoading(false);

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
    const id = setInterval(load, 5000);
    const offChange = onThreadsChanged(load);
    const offServer = onServerEvent((e) => {
      if (e.type === "message.created" || e.type === "thread.updated") {
        load();
        if (e.type === "message.created" && e.direction === "in") {
          notifyIfBackgrounded({
            title: `${e.leadName}${e.leadHandle ? ` (@${e.leadHandle})` : ""}`,
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
  }, [accountFilter, q, onlyUnanswered]);

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

  async function enablePush() {
    const status = await registerPush();
    if (status === "ok") setPushState("ok");
    else if (status === "denied") setPushState("denied");
    else if (status === "unsupported") setPushState("unsupported");
    else alert(`Push setup failed: ${status}`);
  }

  // Close the dropdown menu when clicking outside it
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const activeAccount = accounts.find((a) => a.id === accountFilter) ?? null;

  return (
    <>
      <header className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)] pt-safe">
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

          {/* 3-dot menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]"
              aria-label="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl shadow-2xl z-20 overflow-hidden">
                <div className="px-3 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                  Filter accounts
                </div>
                <button
                  onClick={() => {
                    setAccountFilter(null);
                    setMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--surface)] ${
                    accountFilter === null ? "text-white" : "text-[var(--muted)]"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white/40" />
                  <span className="flex-1 text-left">All accounts</span>
                  {accountFilter === null && <span>✓</span>}
                </button>
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setAccountFilter(a.id);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-[var(--surface)] ${
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
                <div className="border-t border-[var(--border)] mt-1">
                  <Link
                    href="/accounts"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2.5 text-sm hover:bg-[var(--surface)]"
                  >
                    Manage accounts
                  </Link>
                  <button
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST" });
                      location.href = "/login";
                    }}
                    className="block w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-[var(--surface)]"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
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
      </header>

      <div className="overflow-y-auto">
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
          <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>
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
          return (
            <Link
              key={t.id}
              href={`/inbox/${t.id}`}
              className={`flex items-start gap-3 px-4 py-3 border-l-2 ${
                isActive
                  ? "bg-[var(--surface-2)] border-[var(--accent)]"
                  : "border-transparent hover:bg-[var(--surface)]"
              }`}
            >
              <div className="relative shrink-0">
                {t.leadProfilePic ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.leadProfilePic}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium"
                    style={{ backgroundColor: t.account.color }}
                  >
                    {t.leadName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[var(--background)]"
                  style={{ backgroundColor: statusColor(t.status) }}
                  title={`Status: ${statusLabel(t.status)}`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium truncate">{t.leadName}</span>
                  {t.leadHandle && (
                    <span className="text-xs text-[var(--muted)] truncate">
                      @{t.leadHandle}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-[var(--muted)] shrink-0">
                    {timeAgo(t.lastMessageAt)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <AccountBadge
                    handle={t.account.handle}
                    displayName={t.account.displayName}
                    profilePicUrl={t.account.profilePicUrl}
                    color={t.account.color}
                  />
                  <p
                    className={`flex-1 text-sm truncate ${
                      t.unreadCount > 0 && !t.lastMessageFromMe
                        ? "text-white"
                        : "text-[var(--muted)]"
                    }`}
                  >
                    {t.lastMessageFromMe && "↗ "}
                    {t.lastMessagePreview ?? ""}
                  </p>
                  {t.unreadCount > 0 && (
                    <span className="shrink-0 text-[10px] bg-[var(--accent)] text-white rounded-full px-1.5 py-0.5">
                      {t.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
