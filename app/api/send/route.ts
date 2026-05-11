import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendChatMessage, extractMsgId, unipileConfigured } from "@/lib/unipile";
import { emitRealtime } from "@/lib/realtime";

// POST { threadId, text, replyToMessageId? } — sends from the account that owns the thread
export async function POST(req: NextRequest) {
  if (!unipileConfigured()) {
    return NextResponse.json({ error: "unipile_not_configured" }, { status: 500 });
  }

  const { threadId, text, replyToMessageId } = await req.json().catch(() => ({}));
  if (!threadId || !text) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const thread = await prisma.thread.findUnique({
    where: { id: Number(threadId) },
    include: { account: true },
  });
  if (!thread) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });

  // Look up the message we're replying to (if any)
  let replyMeta: {
    unipileId: string | null;
    snippet: string;
    fromMe: boolean;
    authorName: string | null;
  } | null = null;

  if (replyToMessageId) {
    const orig = await prisma.message.findUnique({
      where: { id: Number(replyToMessageId) },
    });
    if (orig && orig.threadId === thread.id) {
      replyMeta = {
        unipileId: orig.unipileMsgId,
        snippet: orig.content.slice(0, 120),
        fromMe: orig.direction === "out",
        authorName: orig.authorName,
      };
    }
  }

  try {
    const result: any = await sendChatMessage(
      thread.chatId,
      thread.account.unipileAccountId,
      String(text),
      replyMeta?.unipileId ?? null,
    );

    const upId = extractMsgId(result);
    const now = new Date();

    const msg = await prisma.message.create({
      data: {
        threadId: thread.id,
        accountId: thread.accountId,
        unipileMsgId: upId,
        direction: "out",
        content: String(text),
        sentAt: now,
        replyToUnipileMsgId: replyMeta?.unipileId ?? null,
        replyToSnippet: replyMeta?.snippet ?? null,
        replyToFromMe: replyMeta?.fromMe ?? null,
        replyToAuthorName: replyMeta?.authorName ?? null,
      },
    });

    await prisma.thread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: now,
        lastMessagePreview: String(text).slice(0, 200),
        lastMessageFromMe: true,
      },
    });

    emitRealtime({
      type: "message.created",
      threadId: thread.id,
      accountId: thread.accountId,
      direction: "out",
      preview: String(text).slice(0, 200),
      leadName: thread.leadName,
      leadHandle: thread.leadHandle,
      leadProfilePic: thread.leadProfilePic,
      accountHandle: thread.account.handle,
      accountColor: thread.account.color,
    });

    return NextResponse.json({ message: msg });
  } catch (err: any) {
    console.error("[send] failed:", err);
    return NextResponse.json(
      { error: String(err?.message ?? err) },
      { status: 502 },
    );
  }
}
