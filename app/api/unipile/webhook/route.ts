import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";

// Unipile webhook for IG events. Always returns 200 so Unipile doesn't retry-storm.
export async function POST(req: NextRequest) {
  try {
    const secret = process.env.UNIPILE_WEBHOOK_SECRET;
    if (secret) {
      const incoming =
        req.headers.get("x-unipile-secret") ??
        req.headers.get("x-webhook-secret") ??
        req.nextUrl.searchParams.get("secret");
      if (incoming !== secret) {
        console.warn("[webhook] secret mismatch");
        return NextResponse.json({ ok: true });
      }
    }

    const body = await req.json();
    const event: string = body.event ?? body.type ?? "";
    const accountId: string | undefined =
      body.account_id ?? body.data?.account_id;

    if (!accountId) return NextResponse.json({ ok: true });

    const account = await prisma.account.findUnique({
      where: { unipileAccountId: accountId },
    });
    if (!account) {
      console.warn(`[webhook] unknown account ${accountId}`);
      return NextResponse.json({ ok: true });
    }

    const ev = event.toLowerCase();
    const isMessage =
      ev.includes("message") &&
      (ev.includes("created") ||
        ev.includes("received") ||
        ev === "messaging");

    if (isMessage) {
      await ingestMessage(account.id, body);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    return NextResponse.json({ ok: true });
  }
}

async function ingestMessage(accountId: number, body: any) {
  const msg = body.data ?? body;
  const chatId: string | undefined = msg.chat_id ?? body.chat_id ?? msg.chatId;
  if (!chatId) return;

  const isOwn: boolean = msg.is_sender ?? msg.is_from_me ?? false;
  const direction: "in" | "out" = isOwn ? "out" : "in";

  const attendee = body.attendees?.[0] ?? body.sender ?? {};
  const leadName: string =
    msg.sender_name ??
    msg.from_name ??
    attendee.display_name ??
    attendee.name ??
    attendee.username ??
    "Instagram User";
  const leadHandle: string | null =
    msg.sender_username ??
    msg.from_username ??
    attendee.username ??
    attendee.handle ??
    null;
  const leadProfilePic: string | null =
    attendee.profile_picture_url ?? attendee.picture_url ?? null;
  const leadProviderId: string | null =
    attendee.provider_id ?? attendee.id ?? null;

  const content: string = msg.text ?? msg.body ?? msg.content ?? "";
  const unipileMsgId: string | null = msg.id ?? msg.message_id ?? null;
  const sentAtRaw: string | number | undefined =
    msg.timestamp ?? msg.created_at ?? msg.sent_at;
  const sentAt = sentAtRaw ? new Date(sentAtRaw) : new Date();

  // Look up first so we can suppress unread bumps on archived threads.
  const existing = await prisma.thread.findUnique({
    where: { accountId_chatId: { accountId, chatId } },
  });
  const shouldBumpUnread = !isOwn && !existing?.archived;

  const thread = await prisma.thread.upsert({
    where: { accountId_chatId: { accountId, chatId } },
    create: {
      accountId,
      chatId,
      leadName,
      leadHandle,
      leadProfilePic,
      leadProviderId,
      lastMessageAt: sentAt,
      lastMessagePreview: content.slice(0, 200),
      lastMessageFromMe: isOwn,
      unreadCount: isOwn ? 0 : 1,
    },
    update: {
      leadName,
      leadHandle: leadHandle ?? undefined,
      leadProfilePic: leadProfilePic ?? undefined,
      lastMessageAt: sentAt,
      lastMessagePreview: content.slice(0, 200),
      lastMessageFromMe: isOwn,
      unreadCount: shouldBumpUnread ? ({ increment: 1 } as any) : undefined,
    },
  });

  // Dedup on unipileMsgId when available
  if (unipileMsgId) {
    const existing = await prisma.message.findUnique({
      where: { unipileMsgId },
    });
    if (existing) return;
  }

  await prisma.message.create({
    data: {
      threadId: thread.id,
      accountId,
      unipileMsgId,
      direction,
      content,
      authorHandle: isOwn ? null : leadHandle,
      authorName: isOwn ? null : leadName,
      sentAt,
    },
  });

  // Push realtime update to all connected clients.
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { handle: true, color: true },
  });
  emitRealtime({
    type: "message.created",
    threadId: thread.id,
    accountId,
    direction,
    preview: content.slice(0, 200),
    leadName,
    leadHandle,
    leadProfilePic,
    accountHandle: account?.handle ?? null,
    accountColor: account?.color ?? "#6366f1",
  });
}
