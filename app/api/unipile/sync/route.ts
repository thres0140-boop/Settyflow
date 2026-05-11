import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listChats,
  getChatMessages,
  getChatAttendees,
  unipileConfigured,
} from "@/lib/unipile";

// Backfill chats + messages from Unipile for one (or all) accounts.
// POST { accountId? }  — if omitted, syncs every connected account.
export async function POST(req: NextRequest) {
  if (!unipileConfigured()) {
    return NextResponse.json({ error: "unipile_not_configured" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const accountId: number | undefined = body.accountId;

  const accounts = accountId
    ? await prisma.account.findMany({ where: { id: accountId } })
    : await prisma.account.findMany();

  console.log(`[sync] starting accountId=${accountId} → found ${accounts.length} accounts`);

  const results: any[] = [];

  for (const acc of accounts) {
    try {
      console.log(`[sync] listChats for account ${acc.id} (${acc.unipileAccountId})`);
      const chats = await listChats(acc.unipileAccountId, 50);
      const items = (chats.items ?? chats.chats ?? []) as any[];
      console.log(`[sync] account ${acc.id}: got ${items.length} chats from Unipile`);

      let threadCount = 0;
      let msgCount = 0;

      for (const c of items) {
        const chatId: string | undefined = c.id;
        if (!chatId) continue;

        // Pull attendee (the other side of the conversation) for handle + pic.
        let leadName: string = c.name ?? "Instagram User";
        let leadHandle: string | null = null;
        let leadProfilePic: string | null = null;
        let leadProviderId: string | null = c.attendee_provider_id ?? null;

        try {
          const att = await getChatAttendees(chatId, acc.unipileAccountId);
          const others = (att.items ?? []).filter((a: any) => !a.is_self);
          const lead = others[0];
          if (lead) {
            leadName = lead.name ?? leadName;
            leadProfilePic = lead.picture_url ?? null;
            leadProviderId = lead.provider_id ?? leadProviderId;
            // Pull @handle out of profile_url e.g. https://www.instagram.com/<handle>
            if (lead.profile_url) {
              const m = String(lead.profile_url).match(
                /instagram\.com\/([^/?#]+)/i,
              );
              if (m) leadHandle = m[1];
            }
          }
        } catch (e) {
          console.warn(`[sync] attendees ${chatId} failed:`, e);
        }

        const lastTs = c.timestamp ? new Date(c.timestamp) : null;

        const thread = await prisma.thread.upsert({
          where: { accountId_chatId: { accountId: acc.id, chatId } },
          create: {
            accountId: acc.id,
            chatId,
            leadName,
            leadHandle,
            leadProfilePic,
            leadProviderId,
            lastMessageAt: lastTs,
            unreadCount: Number(c.unread_count ?? c.unread ?? 0),
          },
          update: {
            leadName,
            leadHandle: leadHandle ?? undefined,
            leadProfilePic: leadProfilePic ?? undefined,
            leadProviderId: leadProviderId ?? undefined,
            lastMessageAt: lastTs ?? undefined,
            unreadCount: Number(c.unread_count ?? c.unread ?? 0),
          },
        });
        threadCount++;

        // Pull recent messages (cap to 30 to keep sync snappy)
        try {
          const msgs = await getChatMessages(chatId, acc.unipileAccountId, 30);
          const arr = (msgs.items ?? msgs.messages ?? []) as any[];

          // Newest-first → reverse for chronological insert
          const ordered = [...arr].reverse();

          for (const m of ordered) {
            const upId: string | null = m.id ?? null;
            if (upId) {
              const dup = await prisma.message.findUnique({
                where: { unipileMsgId: upId },
              });
              if (dup) continue;
            }
            const isOwn: boolean = Boolean(m.is_sender);
            await prisma.message.create({
              data: {
                threadId: thread.id,
                accountId: acc.id,
                unipileMsgId: upId,
                direction: isOwn ? "out" : "in",
                content: m.text ?? "",
                authorName: isOwn ? null : leadName,
                authorHandle: isOwn ? null : leadHandle,
                sentAt: m.timestamp ? new Date(m.timestamp) : new Date(),
              },
            });
            msgCount++;
          }

          // Set last-message preview from the newest message we have
          const newest = arr[0];
          if (newest) {
            await prisma.thread.update({
              where: { id: thread.id },
              data: {
                lastMessagePreview: String(newest.text ?? "").slice(0, 200),
                lastMessageFromMe: Boolean(newest.is_sender),
                lastMessageAt: newest.timestamp
                  ? new Date(newest.timestamp)
                  : undefined,
              },
            });
          }
        } catch (e) {
          console.warn(`[sync] msgs for chat ${chatId} failed:`, e);
        }
      }

      await prisma.account.update({
        where: { id: acc.id },
        data: { lastSyncedAt: new Date() },
      });

      results.push({ accountId: acc.id, threads: threadCount, messages: msgCount });
    } catch (e: any) {
      console.error(`[sync] account ${acc.id} failed:`, e);
      results.push({ accountId: acc.id, error: String(e?.message ?? e) });
    }
  }

  return NextResponse.json({ results });
}
