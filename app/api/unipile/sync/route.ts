import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  listChats,
  listAccounts,
  getChatMessages,
  getChatAttendees,
  unipileConfigured,
} from "@/lib/unipile";

// Extract handle / displayName / profile pic from a Unipile account record,
// trying several known field paths since the shape varies by provider.
function extractAccountProfile(a: any): {
  handle: string | null;
  displayName: string | null;
  profilePicUrl: string | null;
} {
  const handle =
    a?.connection_params?.im?.username ??
    a?.connection_params?.username ??
    a?.username ??
    a?.name ??
    null;
  const displayName = a?.name ?? handle ?? null;
  const profilePicUrl =
    a?.connection_params?.im?.picture_url ??
    a?.profile_picture_url ??
    a?.picture_url ??
    null;
  return { handle, displayName, profilePicUrl };
}

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

  // Pull the latest Unipile account list once so we can heal any of our
  // local rows whose handle / displayName / pic came up empty on first import.
  let unipileAccountIndex: Map<string, any> = new Map();
  try {
    const list: any = await listAccounts();
    const items: any[] = list.items ?? list.accounts ?? [];
    unipileAccountIndex = new Map(items.map((a: any) => [a.id, a]));
  } catch (e) {
    console.warn("[sync] listAccounts failed (continuing without profile heal):", e);
  }

  for (const acc of accounts) {
    try {
      // Heal missing profile fields on the local row, if Unipile has them.
      if (!acc.handle || !acc.displayName || !acc.profilePicUrl) {
        const ua = unipileAccountIndex.get(acc.unipileAccountId);
        if (ua) {
          const p = extractAccountProfile(ua);
          if ((!acc.handle && p.handle) || (!acc.displayName && p.displayName) || (!acc.profilePicUrl && p.profilePicUrl)) {
            await prisma.account.update({
              where: { id: acc.id },
              data: {
                handle: acc.handle ?? p.handle,
                displayName: acc.displayName ?? p.displayName,
                profilePicUrl: acc.profilePicUrl ?? p.profilePicUrl,
              },
            });
            // Reflect locally so logging is accurate.
            acc.handle = acc.handle ?? p.handle;
            acc.displayName = acc.displayName ?? p.displayName;
            acc.profilePicUrl = acc.profilePicUrl ?? p.profilePicUrl;
            console.log(`[sync] healed profile for account ${acc.id}: handle=${acc.handle}`);
          }
        }
      }

      console.log(`[sync] listChats for account ${acc.id} (${acc.unipileAccountId})`);
      const chats = await listChats(acc.unipileAccountId, 50);
      const items = (chats.items ?? chats.chats ?? []) as any[];
      console.log(`[sync] account ${acc.id}: got ${items.length} chats from Unipile`);

      // Cutoff: only import chats whose last activity is AT OR AFTER the
      // account was connected. Otherwise a freshly-connected IG account
      // with years of history would backfill thousands of dead 2021 chats.
      // 60-second grace window so messages sent right around connect time
      // aren't accidentally excluded.
      const cutoff = new Date(acc.createdAt.getTime() - 60_000);

      let threadCount = 0;
      let msgCount = 0;
      let skippedOld = 0;

      for (const c of items) {
        const chatId: string | undefined = c.id;
        if (!chatId) continue;

        const chatTs = c.timestamp ? new Date(c.timestamp) : null;
        if (chatTs && chatTs < cutoff) {
          // Stale chat from before the account was connected — skip backfill.
          // The webhook will still pick this thread up if a new message
          // arrives on it going forward.
          skippedOld++;
          continue;
        }

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

      results.push({
        accountId: acc.id,
        threads: threadCount,
        messages: msgCount,
        skippedOld,
      });
    } catch (e: any) {
      console.error(`[sync] account ${acc.id} failed:`, e);
      results.push({ accountId: acc.id, error: String(e?.message ?? e) });
    }
  }

  return NextResponse.json({ results });
}
