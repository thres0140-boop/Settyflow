"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Account {
  id: number;
  unipileAccountId: string;
  handle: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
  color: string;
  status: string;
  lastSyncedAt: string | null;
}

export default function AccountsPage() {
  const sp = useSearchParams();
  const connectStatus = sp.get("connect");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const res = await fetch("/api/accounts");
    const data = await res.json();
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setConnecting(true);
    const res = await fetch("/api/unipile/auth-link", { method: "POST" });
    const data = await res.json();
    setConnecting(false);
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(`Failed to get auth link: ${data.error ?? "unknown"}`);
    }
  }

  async function sync(id: number) {
    setSyncing(id);
    await fetch("/api/unipile/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: id }),
    });
    setSyncing(null);
    load();
  }

  async function importExisting() {
    setImporting(true);
    const res = await fetch("/api/unipile/import", { method: "POST" });
    const data = await res.json();
    setImporting(false);
    if (data.imported != null) {
      alert(`Imported ${data.imported} account(s) from Unipile.`);
      load();
    } else {
      alert(`Import failed: ${data.error ?? "unknown"}`);
    }
  }

  // Per-account hidden file input refs so we can wire one "Edit pic" button
  // per row to its own native picker.
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploadingPic, setUploadingPic] = useState<number | null>(null);

  async function uploadAvatar(id: number, file: File) {
    setUploadingPic(id);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/accounts/${id}/avatar`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Upload failed: ${data.error ?? "unknown"}`);
      } else {
        await load();
      }
    } finally {
      setUploadingPic(null);
    }
  }

  async function cleanupOld(id: number) {
    const ok = confirm(
      "Delete all threads on this account with no activity since you connected it?\n\n" +
        "Useful right after connecting an IG account that has years of old DMs. " +
        "Threads with new messages going forward (from webhooks) are unaffected.",
    );
    if (!ok) return;
    const res = await fetch(`/api/accounts/${id}/cleanup-old`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      alert(`Deleted ${data.deletedThreads} old threads. Kept ${data.keptThreads}.`);
      load();
    } else {
      alert(`Cleanup failed: ${data.error ?? "unknown"}`);
    }
  }

  async function disconnect(id: number) {
    const ok = confirm(
      "Remove this account from Settyflow?\n\n" +
        "• Its threads and message history in THIS app will be deleted.\n" +
        "• The Unipile connection stays active (so any other app you use, " +
        "e.g. ClientFlow, keeps working).\n\n" +
        "If you want to fully disconnect the IG account, also delete it from " +
        "the Unipile dashboard.",
    );
    if (!ok) return;
    await fetch("/api/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)] pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link href="/inbox" className="text-[var(--muted)] hover:text-white">
            ←
          </Link>
          <h1 className="text-xl font-semibold flex-1">Accounts</h1>
          <button
            onClick={importExisting}
            disabled={importing}
            title="Pull in accounts already connected via Unipile"
            className="text-sm border border-[var(--border)] rounded-lg px-3 py-1.5 hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import from Unipile"}
          </button>
          <button
            onClick={connect}
            disabled={connecting}
            className="bg-[var(--accent)] disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
          >
            {connecting ? "…" : "+ Connect Instagram"}
          </button>
        </div>
      </header>

      {connectStatus === "success" && (
        <div className="mx-4 mt-4 text-sm rounded-lg px-3 py-2 bg-green-950/40 border border-green-900/60 text-green-300">
          Account connected. Click <em>Sync now</em> to backfill conversations.
        </div>
      )}
      {connectStatus === "failed" && (
        <div className="mx-4 mt-4 text-sm rounded-lg px-3 py-2 bg-red-950/40 border border-red-900/60 text-red-300">
          Connection failed. Try again or check the Unipile dashboard.
        </div>
      )}

      <main className="p-4 space-y-2">
        {loading && (
          <div className="text-sm text-[var(--muted)]">Loading…</div>
        )}
        {!loading && accounts.length === 0 && (
          <div className="text-sm text-[var(--muted)] border border-dashed border-[var(--border)] rounded-xl p-8 text-center">
            No accounts connected yet. Click{" "}
            <span className="text-white">+ Connect Instagram</span> above to
            start.
          </div>
        )}
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3"
          >
            <button
              type="button"
              onClick={() => fileInputs.current[a.id]?.click()}
              className="relative group shrink-0"
              title="Upload profile picture for this coach"
              disabled={uploadingPic === a.id}
            >
              {a.profilePicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.profilePicUrl}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: a.color }}
                >
                  {(a.handle ?? a.displayName ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              {/* Hover/click overlay — tap target to change the pic */}
              <span className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-medium">
                {uploadingPic === a.id ? "…" : "Edit"}
              </span>
              <input
                ref={(el) => {
                  fileInputs.current[a.id] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(a.id, f);
                  e.target.value = ""; // allow re-selecting the same file
                }}
              />
            </button>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">
                {a.handle ? `@${a.handle}` : a.displayName ?? "Unknown account"}
              </div>
              <div className="text-xs text-[var(--muted)]">
                {a.status}
                {a.lastSyncedAt && (
                  <> · synced {new Date(a.lastSyncedAt).toLocaleString()}</>
                )}
              </div>
            </div>
            <button
              onClick={() => sync(a.id)}
              disabled={syncing === a.id}
              className="text-xs border border-[var(--border)] rounded-lg px-2.5 py-1.5 hover:bg-[var(--surface-2)]"
            >
              {syncing === a.id ? "Syncing…" : "Sync now"}
            </button>
            <button
              onClick={() => cleanupOld(a.id)}
              className="text-xs border border-[var(--border)] rounded-lg px-2.5 py-1.5 hover:bg-[var(--surface-2)]"
              title="Delete old threads imported before this account was connected"
            >
              Clean old
            </button>
            <button
              onClick={() => disconnect(a.id)}
              className="text-xs text-red-400 hover:text-red-300 px-1"
              aria-label="Disconnect"
            >
              ✕
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}
