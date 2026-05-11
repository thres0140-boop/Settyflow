"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ThreadInfoPanel from "@/components/ThreadInfoPanel";
import SwipeToReply from "@/components/SwipeToReply";
import {
  notifyThreadsChanged,
  onInsertText,
  onServerEvent,
  onDismissInfoSheet,
} from "@/lib/events";
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
  deliveredAt: string | null;
  seenAt: string | null;
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
  { key: "qualified", label: "Link Sent" },
  { key: "call_booked", label: "Call Booked" },
  { key: "follow_up", label: "Follow Up" },
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
  const [infoClosing, setInfoClosing] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const didInitialScrollRef = useRef(false);

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

  // Dismiss the info sheet (e.g. after picking a template or sending a voice clip)
  useEffect(() => {
    return onDismissInfoSheet(() => {
      if (infoOpen) toggleInfo();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infoOpen]);
  function toggleInfo() {
    if (!infoOpen) {
      setInfoOpen(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("settyflow:infoPanel", "open");
      }
      return;
    }
    // Animate the close
    setInfoClosing(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("settyflow:infoPanel", "closed");
    }
    window.setTimeout(() => {
      setInfoOpen(false);
      setInfoClosing(false);
    }, 240);
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

  // Reset the "have we done the initial jump-to-bottom" flag whenever we
  // switch to a different chat — otherwise opening a second chat would
  // smooth-scroll from the top.
  useEffect(() => {
    didInitialScrollRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    if (!didInitialScrollRef.current) {
      // First time we have messages — jump instantly to the bottom.
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
    } else {
      // New message arrived later — smooth scroll.
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
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
                @{thread.account.handle ?? thread.account.displayName ?? "account"}
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
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-2 min-h-0"
        style={{ overscrollBehaviorX: "contain" }}
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
            <SwipeToReply key={m.id} onReply={() => startReply(m)}>
            <div
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
                  className={`text-[10px] mt-1 flex items-center gap-1 ${
                    mine ? "text-white/60" : "text-[var(--muted)]"
                  }`}
                >
                  <span>
                    {new Date(m.sentAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {mine && (m.seenAt || m.deliveredAt) && (
                    <span title={m.seenAt ? `Seen ${new Date(m.seenAt).toLocaleString()}` : "Delivered"}>
                      · {m.seenAt ? "Seen" : "Delivered"}
                    </span>
                  )}
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
            </SwipeToReply>
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
                : `Reply as @${thread.account.handle ?? thread.account.displayName ?? "account"}…`
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

      {/* Desktop: right-side panel */}
      {infoOpen && (
        <div className="hidden md:flex">
          <ThreadInfoPanel thread={thread} onUpdate={load} />
        </div>
      )}

      {/* Mobile: bottom sheet */}
      {infoOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex flex-col">
          {/* Scrim — fades in/out with the sheet */}
          <button
            aria-label="Close"
            onClick={toggleInfo}
            className="flex-1 backdrop-blur-sm"
            style={{
              background: "rgba(0,0,0,0.6)",
              animation: infoClosing
                ? "scrim-fade-out 240ms ease forwards"
                : "scrim-fade-in 240ms ease forwards",
            }}
          />
          {/* Sheet */}
          <div
            className="bg-[var(--background)] rounded-t-2xl shadow-2xl border-t border-[var(--border)] overflow-hidden flex flex-col"
            style={{
              maxHeight: "85dvh",
              height: "85dvh",
              animation: infoClosing
                ? "sheet-down 240ms cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "sheet-up 240ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {/* Drag handle + close (compact) */}
            <div className="flex items-center justify-center py-2 relative shrink-0">
              <span className="w-9 h-1 rounded-full bg-[var(--border)]" />
              <button
                onClick={toggleInfo}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[var(--muted)] hover:text-white hover:bg-[var(--surface)] text-base"
                aria-label="Close info"
              >
                ✕
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto"
              style={{
                // Safe area + a bit extra so the Notes textarea isn't pinned
                // under the home indicator on iOS.
                paddingBottom: "calc(env(safe-area-inset-bottom) + 2.5rem)",
              }}
            >
              <ThreadInfoPanel thread={thread} onUpdate={load} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
