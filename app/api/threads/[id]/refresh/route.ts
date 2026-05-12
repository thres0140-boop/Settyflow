import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getChatMessages,
  unipileConfigured,
} from "@/lib/unipile";

// Per-thread refresh: re-pull recent messages from Unipile for this chat
// and ingest anything we missed (typically because a webhook didn't fire
// or arrived with an event type we don't recognize). Cheap to call —
// dedup is via unique unipileMsgId.
//
// POST /api/threads/:id/refresh
// Returns { fetched, inserted, threadId }.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!unipileConfigured()) {
    return NextResponse.json({ error: "unipile_not_configured" }, { status: 500 });
  }

  const { id } = await params;
  const threadId = Number(id);

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: { account: { select: { unipileAccountId: true } } },
  });
  if (!thread) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let fetched = 0;
  let inserted = 0;
  let newestPreview = "";
  let newestTs: Date | null = null;
  let newestFromMe = false;

  try {
    const res: any = await getChatMessages(
      thread.chatId,
      thread.account.unipileAccountId,
      30,
    );
    const items = (res.items ?? res.messages ?? []) as any[];
    fetched = items.length;
    // Unipile returns newest-first → reverse for chronological inserts.
    const ordered = [...items].reverse();
    for (const m of ordered) {
      const upId: string | null = m.id ?? null;
      if (upId) {
        const dup = await prisma.message.findUnique({
          where: { unipileMsgId: upId },
        });
        if (dup) continue;
      }
      const isOwn: boolean = Boolean(m.is_sender);
      const msgAttachments = (m.attachments ?? [])
        .map((a: any) => ({
          id: a.id ?? a.attachment_id ?? null,
          type: a.type ?? a.file_type ?? "file",
          mime: a.mime_type ?? a.mimetype ?? null,
          durationMs: a.duration ?? a.duration_ms ?? null,
        }))
        .filter((a: any) => a.id);
      await prisma.message.create({
        data: {
          threadId: thread.id,
          accountId: thread.accountId,
          unipileMsgId: upId,
          direction: isOwn ? "out" : "in",
          content: m.text ?? "",
          authorName: isOwn ? null : thread.leadName,
          authorHandle: isOwn ? null : thread.leadHandle,
          sentAt: m.timestamp ? new Date(m.timestamp) : new Date(),
          attachments: JSON.stringify(msgAttachments),
        },
      });
      inserted++;
    }

    // Refresh the thread's lastMessage* fields from the newest message.
    const newest = items[0];
    if (newest) {
      newestPreview = String(newest.text ?? "").slice(0, 200);
      newestFromMe = Boolean(newest.is_sender);
      newestTs = newest.timestamp ? new Date(newest.timestamp) : null;
      await prisma.thread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: newestTs ?? undefined,
          lastMessagePreview: newestPreview,
          lastMessageFromMe: newestFromMe,
          // If we just pulled a NEW inbound message, treat it as
          // unviewed even if the user had previously marked the
          // thread as handled.
          markedReadAt: inserted > 0 && !newestFromMe ? null : undefined,
        },
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: "refresh_failed", detail: String(e?.message ?? e) },
      { status: 502 },
    );
  }

  return NextResponse.json({ threadId, fetched, inserted });
}
