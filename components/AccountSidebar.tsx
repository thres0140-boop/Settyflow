"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getInboxListsCache } from "@/lib/threadCache";

interface AccountRow {
  id: number;
  handle: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
  color: string;
}

// Beeper-style leftmost icon column. Each round avatar is one connected
// Instagram account; clicking it filters the inbox to just that account.
// The top "Inbox" icon clears the filter and shows everything. A settings
// icon sits at the bottom for the Accounts page.
export default function AccountSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeAccountId = sp.get("account");

  const [accounts, setAccounts] = useState<AccountRow[]>(() => {
    const cached = typeof window !== "undefined" ? getInboxListsCache() : null;
    return (cached?.accounts as AccountRow[]) ?? [];
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAccounts(data.accounts ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function setFilter(id: number | null) {
    const params = new URLSearchParams(sp.toString());
    if (id == null) params.delete("account");
    else params.set("account", String(id));
    const qs = params.toString();
    // Stay on /inbox root when changing filter so the list re-renders cleanly.
    router.push(`/inbox${qs ? `?${qs}` : ""}`);
  }

  const onInbox = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const onAccounts = pathname === "/accounts";

  return (
    <aside
      className="hidden md:flex flex-col items-center gap-3 py-3 px-2 bg-[var(--gutter)]"
      style={{ width: 56 }}
    >
      {/* All Inbox */}
      <button
        onClick={() => setFilter(null)}
        title="All inboxes"
        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
          onInbox && !activeAccountId
            ? "bg-[var(--accent)] text-white"
            : "bg-[var(--surface)] text-[var(--muted)] hover:text-white hover:bg-[var(--surface-2)]"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7l9 6 9-6" />
          <rect x="3" y="5" width="18" height="14" rx="2" />
        </svg>
      </button>

      <div className="w-8 h-px bg-[var(--border)]" />

      {/* One round avatar per connected coach account */}
      <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto w-full items-center pb-2">
        {accounts.map((a) => {
          const isActive = activeAccountId === String(a.id);
          const label = a.handle ? `@${a.handle}` : a.displayName ?? "Account";
          return (
            <button
              key={a.id}
              onClick={() => setFilter(a.id)}
              title={label}
              className="relative shrink-0 rounded-full"
              style={{
                outline: isActive ? `2px solid ${a.color}` : "none",
                outlineOffset: 2,
              }}
            >
              {a.profilePicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.profilePicUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: a.color }}
                >
                  {(a.handle ?? a.displayName ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <Link
        href="/accounts"
        title="Manage accounts"
        className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
          onAccounts
            ? "bg-[var(--accent)] text-white"
            : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
    </aside>
  );
}
