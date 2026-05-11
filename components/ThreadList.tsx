"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountBadge from "@/components/AccountBadge";
import { statusColor, statusLabel } from "@/lib/statusColors";
import { onThreadsChanged, onServerEvent } from "@/lib/events";
import {
  ensureNotificationPermission,
  notifyIfBackgrounded,
} from "@/lib/notifications";

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

  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [view, setView] = useState<"inbox" | "archive">("inbox");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const params = new URLSearchParams();
    if (accountFilter) params.set("accountId", String(accountFilter));
    if (q) params.set("q", q);
    if (view === "archive") params.set("archived", "true");
    const [t, a] = await Promise.all([
      fetch(`/api/threads?${params}`).then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    setThreads(t.threads ?? []);
    setAccounts(a.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Poll every 5s. (SSE works in dev but not Vercel serverless across function
    // instances — see lib/realtime.ts. Real fix is Pusher/Ably; until then, fast polling.)
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
  }, [accountFilter, q, view]);

  // Ask for notification permission on first mount (no-op if already decided)
  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  return (
    <>
      <header className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)] pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <h1 className="text-xl font-semibold flex-1">
            {view === "archive" ? "Archive" : "Inbox"}
          </h1>
          <Link
            href="/accounts"
            className="text-sm text-[var(--muted)] hover:text-white"
          >
            Accounts
          </Link>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              location.href = "/login";
            }}
            className="text-sm text-[var(--muted)] hover:text-white"
          >
            Sign out
          </button>
        </div>

        <div className="px-4 pb-2 flex gap-1 border-b border-[var(--border)]">
          <button
            onClick={() => setView("inbox")}
            className={`text-xs px-3 py-1.5 rounded-t-md font-medium ${
              view === "inbox"
                ? "text-white border-b-2 border-[var(--accent)] -mb-px"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Inbox
          </button>
          <button
            onClick={() => setView("archive")}
            className={`text-xs px-3 py-1.5 rounded-t-md font-medium ${
              view === "archive"
                ? "text-white border-b-2 border-[var(--accent)] -mb-px"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            Archive
          </button>
        </div>

        <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setAccountFilter(null)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border ${
              accountFilter === null
                ? "bg-white text-black border-white"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            All ({threads.length})
          </button>
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccountFilter(a.id)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${
                accountFilter === a.id
                  ? "bg-white text-black border-white"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
              style={
                accountFilter === a.id
                  ? undefined
                  : { borderColor: a.color, color: a.color }
              }
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              @{a.handle ?? a.displayName ?? "account"}
            </button>
          ))}
        </div>

        <div className="px-4 pb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads…"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>
      </header>

      <div className="divide-y divide-[var(--border)] overflow-y-auto">
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
