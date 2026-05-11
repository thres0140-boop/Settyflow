"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ThreadInfoPanel from "@/components/ThreadInfoPanel";
import { notifyThreadsChanged, onInsertText, onServerEvent } from "@/lib/events";
import { getThreadCache, setThreadCache } from "@/lib/threadCache";

interface Message {
  id: number;
  direction: "in" | "out";
  content: string;
  sentAt: string;
  authorName: string | null;
  unipileMsgId: string | null;
  replyToUnipileMsgId: string | null;
  replyToSnippet: string | null;
  replyToFromMe: boolean | null;
  replyToAuthorName: string | null;
}

interface ReplyTarget {
  messageId: number;
  snippet: string;
  authorLabel: string;
}

interface ThreadDetail {
  id: number;
  leadName: string;
  leadHandle: string | null;
  leadProfilePic: string | null;
  status: string;
  notes: string | null;
  tags?: string;
  archived?: boolean;
  account: {
    id: number;
    handle: string | null;
    displayName: string | null;
    profilePicUrl: string | null;
    color: string;
  };
  messages: Message[];
}

const STATUSES = [
  { key: "new", label: "New" },
  { key: "qualified", label: "Qualified" },
  { key: "call_booked", label: "Call Booked" },
  { key: "closed", label: "Closed" },
];

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const id = params.threadId;

  // Hydrate from cache immediately so the user never sees a "Loading…" flash
  // when reopening a thread they've already visited this session.
  const [thread, setThread] = useState<ThreadDetail | null>(() =>
    getThreadCache<ThreadDetail>(Number(id)),
  );
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // When threadId changes (e.g. switching chats), swap to the new thread's
  // cached data immediately to avoid showing the previous chat's content.
  useEffect(() => {
    setThread(getThreadCache<ThreadDetail>(Number(id)));
  }, [id]);

  // Persist info-panel preference across thread switches
  useEffect(() => {
    if (typeof window === "undefined") return;
    setInfoOpen(localStorage.getItem("settyflow:infoPanel") === "open");
  }, []);

  // Templates / saved replies → insert into the input box
  useEffect(() => {
    return onInsertText((t) => {
      setText((prev) => (prev ? `${prev}\n${t}` : t));
      setTimeout(() => textareaRef.current?.focus(), 0);
    });
  }, []);
  function toggleInfo() {
    setInfoOpen((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        localStorage.setItem("settyflow:infoPanel", next ? "open" : "closed");
      }
      return next;
    });
  }

  async function load() {
    const res = await fetch(`/api/threads/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setThread(data.thread);
    if (data.thread) setThreadCache(Number(id), data.thread);
  }

  useEffect(() => {
    load();
    // Poll every 3s for the open thread (cheap query, single thread).
    // SSE doesn't work cross-instance on Vercel serverless yet.
    const t = setInterval(load, 3000);
    const off = onServerEvent((e) => {
      const evtThreadId =
        e.type === "message.created" || e.type === "thread.updated"
          ? e.threadId
          : null;
      if (evtThreadId === Number(id)) load();
    });
    return () => {
      clearInterval(t);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [thread?.messages.length]);

  async function send() {
    if (!text.trim() || !thread) return;
    setSending(true);
    setError(null);
    const body = text;
    const reply = replyTo;
    setText("");
    setReplyTo(null);
    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: thread.id,
        text: body,
        replyToMessageId: reply?.messageId ?? null,
      }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "send_failed");
      setText(body);
      setReplyTo(reply);
      return;
    }
    notifyThreadsChanged();
    load();
  }

  function startReply(m: Message) {
    if (!thread) return;
    const mine = m.direction === "out";
    setReplyTo({
      messageId: m.id,
      snippet: m.content.slice(0, 200),
      authorLabel: mine
        ? `@${thread.account.handle ?? thread.account.displayName ?? "you"}`
        : thread.leadName,
    });
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  async function copyText(content: string) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      /* ignore */
    }
  }

  async function changeStatus(status: string) {
    if (!thread) return;
    await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    notifyThreadsChanged();
    load();
  }

  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <header className="border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur pt-safe">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href="/inbox"
            className="md:hidden text-[var(--muted)] hover:text-white text-xl leading-none"
            aria-label="Back"
          >
            ←
          </Link>
          {thread.leadProfilePic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thread.leadProfilePic}
              alt=""
              className="w-9 h-9 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium"
              style={{ backgroundColor: thread.account.color }}
            >
              {thread.leadName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{thread.leadName}</div>
            <div className="text-xs text-[var(--muted)] truncate">
              {thread.leadHandle && <>@{thread.leadHandle} · </>}via{" "}
              <span style={{ color: thread.account.color }}>
                @{thread.account.handle ?? thread.account.displayName}
              </span>
            </div>
          </div>
          <button
            onClick={toggleInfo}
            aria-label="Toggle info panel"
            title={infoOpen ? "Hide info" : "Show info"}
            className={`shrink-0 w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-sm ${
              infoOpen
                ? "bg-[var(--surface)] text-white"
                : "text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]"
            }`}
          >
            i
          </button>
        </div>

        <div className="px-4 pb-2 flex gap-1.5 overflow-x-auto">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => changeStatus(s.key)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${
                thread.status === s.key
                  ? "bg-white text-black border-white"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 min-h-0"
      >
        {thread.messages.length === 0 && (
          <div className="text-center text-sm text-[var(--muted)] py-8">
            No messages yet
          </div>
        )}
        {thread.messages.map((m) => {
          const mine = m.direction === "out";
          const hasReply = Boolean(m.replyToSnippet);
          const replyAuthor = m.replyToFromMe
            ? `@${thread.account.handle ?? thread.account.displayName ?? "you"}`
            : (m.replyToAuthorName ?? thread.leadName);
          return (
            <div
              key={m.id}
              className={`group flex items-end gap-2 ${
                mine ? "justify-end" : "justify-start"
              }`}
            >
              {mine && (
                <div className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-xs text-[var(--muted)]">
                  <button
                    onClick={() => copyText(m.content)}
                    className="hover:text-white px-1.5 py-0.5 rounded hover:bg-[var(--surface)]"
                    title="Copy"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => startReply(m)}
                    className="hover:text-white px-1.5 py-0.5 rounded hover:bg-[var(--surface)]"
                    title="Reply"
                  >
                    ↩
                  </button>
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                  mine
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface)] text-white border border-[var(--border)]"
                }`}
              >
                {hasReply && (
                  <div
                    className={`mb-1.5 rounded-lg px-2 py-1.5 text-xs border-l-2 ${
                      mine
                        ? "bg-white/10 border-white/40 text-white/80"
                        : "bg-[var(--surface-2)] border-[var(--accent)] text-[var(--muted)]"
                    }`}
                  >
                    <div className="font-medium opacity-80 mb-0.5">
                      {replyAuthor}
                    </div>
                    <div className="line-clamp-2">{m.replyToSnippet}</div>
                  </div>
                )}
                {m.content}
                <div
                  className={`text-[10px] mt-1 ${
                    mine ? "text-white/60" : "text-[var(--muted)]"
                  }`}
                >
                  {new Date(m.sentAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              {!mine && (
                <div className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-xs text-[var(--muted)]">
                  <button
                    onClick={() => startReply(m)}
                    className="hover:text-white px-1.5 py-0.5 rounded hover:bg-[var(--surface)]"
                    title="Reply"
                  >
                    ↩
                  </button>
                  <button
                    onClick={() => copyText(m.content)}
                    className="hover:text-white px-1.5 py-0.5 rounded hover:bg-[var(--surface)]"
                    title="Copy"
                  >
                    ⧉
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className="border-t border-[var(--border)] bg-[var(--background)]"
        style={{
          // Extend the input bar to the bottom edge of the screen, but keep
          // the textarea + send button above the iOS home indicator by adding
          // safe-area padding *inside* the form (see <form> below).
        }}
      >
        {replyTo && (
          <div className="px-3 pt-2 pb-1 flex items-start gap-2">
            <div className="flex-1 min-w-0 rounded-lg bg-[var(--surface)] border-l-2 border-[var(--accent)] px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--accent)] font-medium">
                  Replying to {replyTo.authorLabel}
                </span>
                <button
                  onClick={() => setReplyTo(null)}
                  className="text-[var(--muted)] hover:text-white"
                  aria-label="Cancel reply"
                >
                  ×
                </button>
              </div>
              <div className="text-[var(--muted)] line-clamp-2 mt-0.5">
                {replyTo.snippet}
              </div>
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="px-3 pt-3 flex gap-2"
          style={{
            // Push the input well clear of the iOS home indicator.
            paddingBottom: `calc(env(safe-area-inset-bottom) + 2.25rem)`,
          }}
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              replyTo
                ? `Reply to ${replyTo.authorLabel}…`
                : `Reply as @${thread.account.handle ?? thread.account.displayName}…`
            }
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Escape" && replyTo) {
                e.preventDefault();
                setReplyTo(null);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="flex-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-4 py-2 text-sm outline-none focus:border-[var(--accent)] resize-none max-h-32"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-[var(--accent)] disabled:opacity-50 rounded-full w-10 h-10 flex items-center justify-center text-white"
            aria-label="Send"
          >
            ↑
          </button>
        </form>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-950/40 border-t border-red-900/60">
          {error}
        </div>
      )}
      </div>
      {infoOpen && (
        <div className="hidden md:flex">
          <ThreadInfoPanel thread={thread} onUpdate={load} />
        </div>
      )}
    </div>
  );
}
