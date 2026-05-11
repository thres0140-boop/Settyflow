import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import {
  getChatMessages,
  getChatAttendees,
  unipileConfigured,
} from "@/lib/unipile";

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

    // Log the FULL payload — visible in Vercel function logs. Critical for
    // figuring out unknown Unipile field shapes when something doesn't ingest right.
    console.log("[webhook] payload:", JSON.stringify(body));

    const event: string = body.event ?? body.type ?? "";
    const accountId: string | undefined =
      body.account_id ??
      body.data?.account_id ??
      body.message?.account_id;

    if (!accountId) {
      console.warn("[webhook] no account_id in payload");
      return NextResponse.json({ ok: true });
    }

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
        ev === "messaging" ||
        ev === "new_message");

    if (isMessage) {
      await ingestMessage(account.id, accountId, body);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    return NextResponse.json({ ok: true });
  }
}

async function ingestMessage(
  accountId: number,
  unipileAccountId: string,
  body: any,
) {
  // Unipile's payload shape varies — flatten it as much as possible.
  // Try top-level, body.data, and body.message.
  const msg = body.message ?? body.data ?? body;

  const chatId: string | undefined =
    msg.chat_id ?? body.chat_id ?? msg.chatId ?? body.chatId;
  if (!chatId) {
    console.warn("[webhook] no chat_id in payload");
    return;
  }

  const isOwn: boolean = Boolean(
    msg.is_sender ?? msg.is_from_me ?? body.is_sender ?? false,
  );
  const direction: "in" | "out" = isOwn ? "out" : "in";

  // Extract from payload first
  const attendee = body.sender ?? body.attendees?.[0] ?? msg.sender ?? {};
  let leadName: string =
    msg.sender_name ??
    msg.from_name ??
    attendee.attendee_name ??
    attendee.display_name ??
    attendee.name ??
    attendee.username ??
    body.attendee_name ??
    "";
  let leadHandle: string | null =
    msg.sender_username ??
    msg.from_username ??
    attendee.username ??
    attendee.handle ??
    null;
  let leadProfilePic: string | null =
    attendee.profile_picture_url ??
    attendee.picture_url ??
    attendee.attendee_picture_url ??
    null;
  let leadProviderId: string | null =
    attendee.provider_id ??
    attendee.attendee_provider_id ??
    attendee.id ??
    body.attendee_provider_id ??
    null;

  let content: string =
    msg.text ??
    msg.body ??
    msg.content ??
    msg.message ??
    body.text ??
    body.message_text ??
    "";
  const unipileMsgId: string | null =
    msg.id ?? msg.message_id ?? body.message_id ?? null;
  const sentAtRaw: string | number | undefined =
    msg.timestamp ?? msg.created_at ?? msg.sent_at ?? body.timestamp;
  const sentAt = sentAtRaw ? new Date(sentAtRaw) : new Date();

  // FALLBACK: if either content or lead identity is missing, refetch from Unipile.
  // Webhook payloads are inconsistent across event types — the API is the source of truth.
  const needsRefetch =
    unipileConfigured() &&
    (!content || !leadName || (!leadHandle && !leadProviderId));

  if (needsRefetch) {
    console.log(
      `[webhook] sparse payload, refetching chat ${chatId} from Unipile`,
    );
    try {
      // Newest message
      const msgs: any = await getChatMessages(chatId, unipileAccountId, 5);
      const items = (msgs.items ?? msgs.messages ?? []) as any[];
      const target = unipileMsgId
        ? items.find((m: any) => m.id === unipileMsgId) ?? items[0]
        : items[0];
      if (target?.text && !content) content = String(target.text);
    } catch (e) {
      console.warn(`[webhook] refetch messages failed:`, e);
    }

    try {
      const att: any = await getChatAttendees(chatId, unipileAccountId);
      const others = (att.items ?? []).filter((a: any) => !a.is_self);
      const lead = others[0];
      if (lead) {
        if (!leadName || leadName === "")
          leadName = lead.name ?? leadName ?? "Instagram User";
        leadProfilePic = leadProfilePic ?? lead.picture_url ?? null;
        leadProviderId = leadProviderId ?? lead.provider_id ?? null;
        if (!leadHandle && lead.profile_url) {
          const m = String(lead.profile_url).match(
            /instagram\.com\/([^/?#]+)/i,
          );
          if (m) leadHandle = m[1];
        }
      }
    } catch (e) {
      console.warn(`[webhook] refetch attendees failed:`, e);
    }
  }

  if (!leadName) leadName = "Instagram User";

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
      // Only overwrite name fields if we actually got something.
      leadName: leadName !== "Instagram User" ? leadName : undefined,
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
    const dup = await prisma.message.findUnique({
      where: { unipileMsgId },
    });
    if (dup) return;
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
  const acc = await prisma.account.findUnique({
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
    accountHandle: acc?.handle ?? null,
    accountColor: acc?.color ?? "#6366f1",
  });
}
