import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import {
  getChatMessages,
  getChatAttendees,
  unipileConfigured,
} from "@/lib/unipile";
import { sendPushToAll } from "@/lib/push-server";

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
    const isNewMessage =
      ev.includes("message") &&
      (ev.includes("created") ||
        ev.includes("received") ||
        ev === "messaging" ||
        ev === "new_message");
    const isReadReceipt =
      ev.includes("read") || ev.includes("seen");
    const isDeliveredReceipt = ev.includes("deliver");

    if (isNewMessage) {
      await ingestMessage(account.id, accountId, body);
    } else if (isReadReceipt) {
      await applyReceipt(body, "seen");
    } else if (isDeliveredReceipt) {
      await applyReceipt(body, "delivered");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error:", err);
    return NextResponse.json({ ok: true });
  }
}

// Read / delivered receipts from Unipile. Payload field names vary across
// platforms — we look in several places for the affected message id(s).
async function applyReceipt(body: any, kind: "seen" | "delivered") {
  const msg = body.message ?? body.data ?? body;
  const ids: string[] = [];
  const single =
    msg.id ??
    msg.message_id ??
    body.message_id ??
    msg.target_message_id ??
    body.target_message_id;
  if (typeof single === "string") ids.push(single);
  const multi = msg.message_ids ?? body.message_ids ?? msg.ids;
  if (Array.isArray(multi)) for (const id of multi) if (typeof id === "string") ids.push(id);

  if (ids.length === 0) {
    console.warn(`[webhook] ${kind} event without message id(s)`);
    return;
  }

  const tsRaw = msg.timestamp ?? body.timestamp ?? msg.read_at ?? msg.delivered_at;
  const at = tsRaw ? new Date(tsRaw) : new Date();
  const field = kind === "seen" ? "seenAt" : "deliveredAt";

  await prisma.message.updateMany({
    where: { unipileMsgId: { in: ids } },
    data: { [field]: at } as any,
  });

  // Emit so open clients update instantly.
  for (const upId of ids) {
    const m = await prisma.message.findUnique({
      where: { unipileMsgId: upId },
      select: { threadId: true },
    });
    if (m) emitRealtime({ type: "thread.updated", threadId: m.threadId });
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

  // Extract from payload first.
  //
  // CRITICAL: for outbound messages (isOwn=true) the sender_* / attendee
  // fields describe OUR coach account, not the lead — Instagram-generated
  // events like "private reply to a comment" come through as outbound from
  // the coach, and naively reading sender_name into leadName saved the
  // coach's own display name as the lead. So we only consult these fields
  // for inbound messages, and force a refetch from the chat attendees
  // endpoint for outbound messages.
  const attendee = body.sender ?? body.attendees?.[0] ?? msg.sender ?? {};
  let leadName: string = "";
  let leadHandle: string | null = null;
  let leadProfilePic: string | null = null;
  let leadProviderId: string | null = null;

  if (!isOwn) {
    leadName =
      msg.sender_name ??
      msg.from_name ??
      attendee.attendee_name ??
      attendee.display_name ??
      attendee.name ??
      attendee.username ??
      body.attendee_name ??
      "";
    leadHandle =
      msg.sender_username ??
      msg.from_username ??
      attendee.username ??
      attendee.handle ??
      null;
    leadProfilePic =
      attendee.profile_picture_url ??
      attendee.picture_url ??
      attendee.attendee_picture_url ??
      null;
    leadProviderId =
      attendee.provider_id ??
      attendee.attendee_provider_id ??
      attendee.id ??
      body.attendee_provider_id ??
      null;
  }

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

  // FALLBACK: if either content or lead identity is missing, refetch from
  // Unipile. Webhook payloads are inconsistent across event types — the API
  // is the source of truth. Outbound messages always trigger the refetch
  // since the payload describes our side, not the lead's.
  const needsRefetch =
    unipileConfigured() &&
    (isOwn || !content || !leadName || (!leadHandle && !leadProviderId));

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

  // First-time thread creation? Backfill the prior message history of this
  // chat from Unipile so the user sees the conversation context, not just
  // the single message that triggered the webhook. Skip silently if the
  // refetch fails — the new message itself still gets inserted below.
  const wasJustCreated = !existing;
  if (wasJustCreated && unipileConfigured()) {
    try {
      const history: any = await getChatMessages(chatId, unipileAccountId, 30);
      const items = (history.items ?? history.messages ?? []) as any[];
      // Unipile returns newest-first; reverse for chronological insert.
      const ordered = [...items].reverse();
      for (const m of ordered) {
        const histId: string | null = m.id ?? null;
        // Skip the one that arrived in this webhook payload — we'll create
        // it below with the deduped logic.
        if (histId && unipileMsgId && histId === unipileMsgId) continue;
        if (histId) {
          const dup = await prisma.message.findUnique({
            where: { unipileMsgId: histId },
          });
          if (dup) continue;
        }
        const histIsOwn: boolean = Boolean(m.is_sender);
        await prisma.message.create({
          data: {
            threadId: thread.id,
            accountId,
            unipileMsgId: histId,
            direction: histIsOwn ? "out" : "in",
            content: m.text ?? "",
            authorName: histIsOwn ? null : leadName,
            authorHandle: histIsOwn ? null : leadHandle,
            sentAt: m.timestamp ? new Date(m.timestamp) : new Date(),
          },
        });
      }
      console.log(
        `[webhook] backfilled ${ordered.length} historical messages for new thread ${thread.id}`,
      );
    } catch (e) {
      console.warn(`[webhook] history backfill failed for chat ${chatId}:`, e);
    }
  }

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

  // Web push to every subscribed device — only for inbound messages.
  if (!isOwn) {
    const titleHandle = leadHandle ? ` (@${leadHandle})` : "";
    const viaTag = acc?.handle ? `via @${acc.handle} · ` : "";
    await sendPushToAll({
      title: `${leadName}${titleHandle}`,
      body: `${viaTag}${content.slice(0, 200)}`,
      icon: leadProfilePic ?? "/icon-192.png",
      url: `/inbox/${thread.id}`,
      tag: `thread-${thread.id}`,
    }).catch((e: unknown) => console.warn("[push] sendPushToAll failed:", e));
  }
}
