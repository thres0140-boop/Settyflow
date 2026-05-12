import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const threadId = parseInt(id);

  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      account: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          profilePicUrl: true,
          color: true,
          unipileAccountId: true,
        },
      },
      messages: {
        orderBy: { sentAt: "asc" },
        take: 200,
        select: {
          id: true,
          direction: true,
          content: true,
          sentAt: true,
          authorName: true,
          unipileMsgId: true,
          replyToUnipileMsgId: true,
          replyToSnippet: true,
          replyToFromMe: true,
          replyToAuthorName: true,
          deliveredAt: true,
          seenAt: true,
          attachments: true,
        },
      },
    },
  });

  if (!thread) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Clear unread on open
  if (thread.unreadCount > 0) {
    await prisma.thread.update({
      where: { id: thread.id },
      data: { unreadCount: 0 },
    });
  }

  // Parse attachments JSON for the client so each message carries a real
  // array instead of a JSON string.
  const messages = thread.messages.map((m) => {
    let parsedAttachments: any[] = [];
    try {
      parsedAttachments = JSON.parse(m.attachments ?? "[]");
      if (!Array.isArray(parsedAttachments)) parsedAttachments = [];
    } catch {
      parsedAttachments = [];
    }
    return { ...m, attachments: parsedAttachments };
  });

  return NextResponse.json({ thread: { ...thread, messages } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, any> = {};
  for (const key of ["status", "notes", "archived"] as const) {
    if (key in body) allowed[key] = body[key];
  }
  if (Array.isArray(body.tags)) allowed.tags = JSON.stringify(body.tags);

  // Manual "viewed" toggle: pass markedRead: true to set markedReadAt = now,
  // or markedRead: false to clear it.
  if ("markedRead" in body) {
    allowed.markedReadAt = body.markedRead ? new Date() : null;
  }

  const thread = await prisma.thread.update({
    where: { id: parseInt(id) },
    data: allowed,
  });
  emitRealtime({ type: "thread.updated", threadId: thread.id });
  return NextResponse.json({ thread });
}
