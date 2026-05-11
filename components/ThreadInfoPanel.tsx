"use client";

import { useEffect, useState } from "react";
import { STATUS_META, STATUS_ORDER } from "@/lib/statusColors";
import { notifyThreadsChanged, notifyInsertText, notifyDismissInfoSheet } from "@/lib/events";
import { leadLabel, leadInitial } from "@/lib/leadLabel";

interface ThreadDetailLike {
  id: number;
  leadName: string;
  leadHandle: string | null;
  leadProfilePic: string | null;
  notes: string | null;
  tags?: string;
  status: string;
  archived?: boolean;
  account: {
    id: number;
    handle: string | null;
    displayName: string | null;
    profilePicUrl: string | null;
    color: string;
  };
}

interface SavedReply {
  id: number;
  accountId: number | null;
  label: string;
  body: string;
}

interface VoiceClip {
  id: number;
  accountId: number;
  label: string;
  contentType: string;
  sizeBytes: number;
  durationMs: number | null;
}

const STATUSES = STATUS_ORDER.map((key) => ({
  key,
  label: STATUS_META[key].label,
  dot: STATUS_META[key].color,
}));

export default function ThreadInfoPanel({
  thread,
  onUpdate,
}: {
  thread: ThreadDetailLike & { id: number };
  onUpdate: () => void;
}) {
  const [notes, setNotes] = useState(thread.notes ?? "");
  const [tagInput, setTagInput] = useState("");
  const initialTags: string[] = (() => {
    try {
      return thread.tags ? JSON.parse(thread.tags) : [];
    } catch {
      return [];
    }
  })();
  const [tags, setTags] = useState<string[]>(initialTags);
  const [savingNotes, setSavingNotes] = useState(false);

  // Reset local state when thread changes
  useEffect(() => {
    setNotes(thread.notes ?? "");
    try {
      setTags(thread.tags ? JSON.parse(thread.tags) : []);
    } catch {
      setTags([]);
    }
  }, [thread.id, thread.notes, thread.tags]);

  async function saveNotes() {
    if (notes === (thread.notes ?? "")) return;
    setSavingNotes(true);
    await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSavingNotes(false);
    notifyThreadsChanged();
    onUpdate();
  }

  async function saveTags(next: string[]) {
    setTags(next);
    await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    });
    notifyThreadsChanged();
    onUpdate();
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    saveTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    saveTags(tags.filter((x) => x !== t));
  }

  const igUrl = thread.leadHandle
    ? `https://www.instagram.com/${thread.leadHandle}`
    : null;

  return (
    <aside className="md:w-80 w-full md:shrink-0 md:border-l border-[var(--border)] bg-[var(--background)] md:overflow-y-auto">
      {/* Compact header: avatar on the left, name/handle/IG-link stacked next to it */}
      <div className="p-4 flex items-center gap-3 border-b border-[var(--border)]">
        {thread.leadProfilePic ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thread.leadProfilePic}
            alt=""
            className="w-14 h-14 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-medium shrink-0"
            style={{ backgroundColor: thread.account.color }}
          >
            {leadInitial(thread)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{leadLabel(thread)}</div>
          {igUrl && (
            <a
              href={igUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-1 text-[11px] text-[var(--accent)] hover:underline"
            >
              Open on Instagram ↗
            </a>
          )}
        </div>
      </div>

      <Section title="Chatting via">
        <div className="flex items-center gap-2.5">
          {thread.account.profilePicUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thread.account.profilePicUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
              style={{ backgroundColor: thread.account.color }}
            >
              {(thread.account.handle ?? thread.account.displayName ?? "?")
                .charAt(0)
                .toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              @{thread.account.handle ?? thread.account.displayName ?? "account"}
            </div>
            <div
              className="text-xs"
              style={{ color: thread.account.color }}
            >
              coach account
            </div>
          </div>
        </div>
      </Section>

      <TemplatesSection accountId={thread.account.id} />

      <VoiceClipsSection accountId={thread.account.id} threadId={thread.id} />

      <Section title="Actions">
        <button
          onClick={async () => {
            await fetch(`/api/threads/${thread.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ archived: !thread.archived }),
            });
            notifyThreadsChanged();
            onUpdate();
          }}
          className="w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-white"
        >
          {thread.archived ? "↩ Unarchive thread" : "🗄  Archive thread"}
        </button>
      </Section>

      <Section title="Status">
        <div className="space-y-1">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={async () => {
                await fetch(`/api/threads/${thread.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: s.key }),
                });
                notifyThreadsChanged();
                onUpdate();
              }}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
                thread.status === s.key
                  ? "bg-[var(--surface)] text-white"
                  : "text-[var(--muted)] hover:bg-[var(--surface)]"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: s.dot }}
              />
              {s.label}
              {thread.status === s.key && (
                <span className="ml-auto text-[10px]">✓</span>
              )}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Tags">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.length === 0 && (
            <span className="text-xs text-[var(--muted)]">None</span>
          )}
          {tags.map((t) => (
            <span
              key={t}
              className="text-xs px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center gap-1"
            >
              {t}
              <button
                onClick={() => removeTag(t)}
                className="text-[var(--muted)] hover:text-red-400"
                aria-label="Remove tag"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder="Add tag…"
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
        />
      </Section>

      <Section
        title="Notes"
        right={savingNotes ? <span className="text-[10px] text-[var(--muted)]">saving…</span> : null}
      >
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          placeholder="Add notes about this lead…"
          rows={6}
          className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--accent)] resize-y min-h-[100px]"
        />
      </Section>
    </aside>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 border-b border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function TemplatesSection({ accountId }: { accountId: number }) {
  const [items, setItems] = useState<SavedReply[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function load() {
    const res = await fetch(`/api/saved-replies?accountId=${accountId}`);
    const data = await res.json();
    setItems(data.items ?? []);
  }

  useEffect(() => {
    load();
  }, [accountId]);

  async function save() {
    if (!label.trim() || !body.trim()) return;
    await fetch("/api/saved-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, label, body }),
    });
    setLabel("");
    setBody("");
    setAdding(false);
    load();
  }

  async function remove(id: number) {
    await fetch(`/api/saved-replies/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="px-5 py-4 border-b border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Templates
        </h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <div className="space-y-2 mb-3 pb-3 border-b border-[var(--border)]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Pitch)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body…"
            rows={4}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)] resize-y"
          />
          <button
            onClick={save}
            disabled={!label.trim() || !body.trim()}
            className="w-full bg-[var(--accent)] disabled:opacity-50 text-white text-xs rounded-lg py-1.5 font-medium"
          >
            Save template
          </button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <div className="text-xs text-[var(--muted)]">
          No templates yet. Add one to quickly fill the chatbox.
        </div>
      )}

      <div className="space-y-1.5">
        {items.map((t) => {
          const isExpanded = expandedId === t.id;
          return (
            <div
              key={t.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
            >
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    notifyInsertText(t.body);
                    notifyDismissInfoSheet();
                  }}
                  className="flex-1 text-left text-sm px-3 py-2 hover:bg-[var(--surface-2)]"
                  title={t.body}
                >
                  <div className="font-medium truncate">{t.label}</div>
                  <div className="text-[10px] text-[var(--muted)] truncate">
                    {t.body.slice(0, 60)}
                    {t.body.length > 60 ? "…" : ""}
                  </div>
                </button>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  className="px-2 py-2 text-[var(--muted)] hover:text-white"
                  aria-label="Edit"
                  title="Edit"
                >
                  ✎
                </button>
                <button
                  onClick={() => remove(t.id)}
                  className="px-2 py-2 text-[var(--muted)] hover:text-red-400"
                  aria-label="Delete"
                  title="Delete"
                >
                  ×
                </button>
              </div>
              {isExpanded && (
                <InlineEdit
                  reply={t}
                  onSaved={() => {
                    setExpandedId(null);
                    load();
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VoiceClipsSection({
  accountId,
  threadId,
}: {
  accountId: number;
  threadId: number;
}) {
  const [items, setItems] = useState<VoiceClip[]>([]);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/voice-clips?accountId=${accountId}`);
    const data = await res.json();
    setItems(data.items ?? []);
  }

  useEffect(() => {
    load();
  }, [accountId]);

  async function upload() {
    if (!file || !label.trim()) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("accountId", String(accountId));
    fd.append("label", label.trim());
    const res = await fetch("/api/voice-clips", { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "upload_failed");
      return;
    }
    setLabel("");
    setFile(null);
    setAdding(false);
    load();
  }

  async function sendClip(id: number) {
    setSendingId(id);
    setError(null);
    const res = await fetch(`/api/voice-clips/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    });
    setSendingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "send_failed");
      return;
    }
    notifyThreadsChanged();
    notifyDismissInfoSheet();
  }

  async function remove(id: number) {
    if (!confirm("Delete this voice clip?")) return;
    await fetch(`/api/voice-clips/${id}`, { method: "DELETE" });
    load();
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="px-5 py-4 border-b border-[var(--border)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Voice clips
        </h3>
        <button
          onClick={() => {
            setAdding((v) => !v);
            setError(null);
          }}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          {adding ? "Cancel" : "+ Upload"}
        </button>
      </div>

      {adding && (
        <div className="space-y-2 mb-3 pb-3 border-b border-[var(--border)]">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. Pitch voice)"
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
          />
          <label className="block text-[10px] text-[var(--muted)]">
            Audio file (.m4a recommended, max 10MB)
            <input
              type="file"
              accept="audio/*,.m4a,.mp3,.ogg,.wav"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-xs text-[var(--muted)] file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-[var(--border)] file:bg-[var(--surface)] file:text-white file:text-[10px]"
            />
          </label>
          <button
            onClick={upload}
            disabled={!file || !label.trim() || uploading}
            className="w-full bg-[var(--accent)] disabled:opacity-50 text-white text-xs rounded-lg py-1.5 font-medium"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <div className="text-xs text-[var(--muted)]">
          No voice clips yet. Upload pre-recorded notes for this coach.
        </div>
      )}

      <div className="space-y-2">
        {items.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1.5"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm flex-1 truncate" title={c.label}>
                🎤 {c.label}
              </span>
              <span className="text-[10px] text-[var(--muted)]">
                {formatSize(c.sizeBytes)}
              </span>
              <button
                onClick={() => remove(c.id)}
                className="text-[var(--muted)] hover:text-red-400 px-1"
                aria-label="Delete clip"
                title="Delete"
              >
                ×
              </button>
            </div>
            <audio
              controls
              preload="none"
              src={`/api/voice-clips/${c.id}/file`}
              className="w-full h-7"
              style={{ height: 28 }}
            />
            <button
              onClick={() => sendClip(c.id)}
              disabled={sendingId === c.id}
              className="w-full bg-[var(--accent)] disabled:opacity-50 text-white text-xs rounded-lg py-1.5 font-medium"
            >
              {sendingId === c.id ? "Sending…" : "Send to this chat"}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-2 text-[10px] text-red-400">{error}</div>
      )}
    </div>
  );
}

function InlineEdit({
  reply,
  onSaved,
}: {
  reply: SavedReply;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(reply.label);
  const [body, setBody] = useState(reply.body);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/saved-replies/${reply.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, body }),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="p-2.5 space-y-2 bg-[var(--surface-2)] border-t border-[var(--border)]">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-2 text-xs outline-none focus:border-[var(--accent)] resize-y"
      />
      <button
        onClick={save}
        disabled={saving || !label.trim() || !body.trim()}
        className="w-full bg-[var(--accent)] disabled:opacity-50 text-white text-xs rounded-lg py-1.5 font-medium"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
